"""SQL parametrizado sobre as cinco tabelas existentes; não executa DDL."""

from abc import ABC, abstractmethod
from contextlib import contextmanager
from threading import Lock
import pymysql
from .dominio import Usuario, Perfil, Endereco, Categoria, Chamado, Coleta, Situacao, ErroNegocio


class Banco(ABC):
    @abstractmethod
    def transacao(self):
        """Fornece repositórios numa unidade atômica de trabalho."""

    @abstractmethod
    def verificar(self):
        """Confere conexão e estrutura sem modificar o esquema."""


COLUNAS = {
    "usuario": {"id", "nome", "email", "senha", "telefone", "perfil", "criado_em"},
    "endereco": {"id", "usuario_id", "rua", "numero", "lat", "lng", "ativo"},
    "categoria": {"id", "nome", "perigo", "instrucoes"},
    "chamado": {
        "id",
        "morador_id",
        "endereco_id",
        "categoria_id",
        "foto_url",
        "status",
        "criado_em",
    },
    "coleta": {"id", "chamado_id", "coletor_id", "distancia_km", "aceito_em", "concluido_em"},
}


class BancoMySQL(Banco):
    def __init__(self, configuracao):
        self.config = configuracao
        self._conferido = False
        self._trava = Lock()

    def _conectar(self):
        c = self.config
        return pymysql.connect(
            host=c.banco_host,
            port=c.banco_porta,
            user=c.banco_usuario,
            password=c.banco_senha,
            database=c.banco_nome,
            unix_socket=c.banco_socket,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,
            connect_timeout=5,
            read_timeout=15,
            write_timeout=15,
        )

    def verificar(self):
        with self._trava:
            con = self._conectar()
            try:
                with con.cursor() as cur:
                    cur.execute(
                        "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS "
                        "WHERE TABLE_SCHEMA=%s",
                        (self.config.banco_nome,),
                    )
                    existentes = {}
                    for row in cur.fetchall():
                        existentes.setdefault(row["TABLE_NAME"], set()).add(row["COLUMN_NAME"])
                    for tabela, campos in COLUNAS.items():
                        faltam = campos - existentes.get(tabela, set())
                        if faltam:
                            raise ErroNegocio(
                                f"Confira a tabela {tabela}: faltam {', '.join(sorted(faltam))}.",
                                503,
                            )
                    cur.execute(
                        "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES "
                        "WHERE TABLE_SCHEMA=%s",
                        (self.config.banco_nome,),
                    )
                    engines = {r["TABLE_NAME"]: r["ENGINE"] for r in cur.fetchall()}
                    if any(str(engines.get(t) or "").lower() != "innodb" for t in COLUNAS):
                        raise ErroNegocio(
                            "As cinco tabelas precisam usar InnoDB para o aceite transacional.", 503
                        )
                self._conferido = True
            finally:
                con.close()

    @contextmanager
    def transacao(self):
        if not self._conferido:
            self.verificar()
        con = self._conectar()
        try:
            con.begin()
            yield Repositorios(con)
            con.commit()
        except Exception:
            con.rollback()
            raise
        finally:
            con.close()


class RepositorioSQL:
    def __init__(self, conexao):
        self.con = conexao

    def um(self, sql, valores=()):
        with self.con.cursor() as cur:
            cur.execute(sql, valores)
            return cur.fetchone()

    def varios(self, sql, valores=()):
        with self.con.cursor() as cur:
            cur.execute(sql, valores)
            return cur.fetchall()

    def executar(self, sql, valores=()):
        with self.con.cursor() as cur:
            cur.execute(sql, valores)
            return cur.lastrowid, cur.rowcount


class Usuarios(RepositorioSQL):
    @staticmethod
    def entidade(row):
        if row is None:
            return None
        return Usuario(
            row["id"], row["nome"], row["email"], row["telefone"], Perfil.do_banco(row["perfil"])
        )

    def por_id(self, id):
        return self.entidade(self.um("SELECT * FROM usuario WHERE id=%s", (id,)))

    def por_email(self, email):
        return self.um("SELECT * FROM usuario WHERE email=%s", (email,))

    def atualizar_senha(self, id, hash_senha):
        self.executar("UPDATE usuario SET senha=%s WHERE id=%s", (hash_senha, id))

    def inserir(self, dados, hash_senha, agora):
        id, _ = self.executar(
            "INSERT INTO usuario (nome,email,senha,telefone,perfil,criado_em) VALUES (%s,%s,%s,%s,%s,%s)",
            (dados["nome"], dados["email"], hash_senha, dados["telefone"], dados["tipo"], agora),
        )
        return self.por_id(id)


class Categorias(RepositorioSQL):
    def listar(self):
        return [
            Categoria(**r)
            for r in self.varios("SELECT id,nome,perigo,instrucoes FROM categoria ORDER BY nome,id")
        ]

    def buscar(self, id):
        row = self.um("SELECT id,nome,perigo,instrucoes FROM categoria WHERE id=%s", (id,))
        return Categoria(**row) if row else None


class Enderecos(RepositorioSQL):
    def inserir(self, usuario_id, dados, ponto):
        id, _ = self.executar(
            "INSERT INTO endereco (usuario_id,rua,numero,lat,lng,ativo) VALUES (%s,%s,%s,%s,%s,%s)",
            (
                usuario_id,
                dados["logradouro"],
                dados["numero"],
                ponto["latitude"],
                ponto["longitude"],
                True,
            ),
        )
        return id


SELECAO_CHAMADOS = """
SELECT ch.*, e.usuario_id AS dono_endereco, e.rua, e.numero, e.lat, e.lng, e.ativo,
       ca.nome AS categoria_nome, ca.perigo, ca.instrucoes,
       c.id AS coleta_id, c.coletor_id, c.distancia_km, c.aceito_em, c.concluido_em,
       u.nome AS coletor_nome,
       (SELECT COUNT(*) FROM coleta cc WHERE cc.chamado_id=ch.id) AS total_coletas
FROM chamado ch
JOIN endereco e ON e.id=ch.endereco_id
JOIN categoria ca ON ca.id=ch.categoria_id
LEFT JOIN coleta c ON c.chamado_id=ch.id
LEFT JOIN usuario u ON u.id=c.coletor_id
"""


class Chamados(RepositorioSQL):
    @staticmethod
    def entidade(r):
        if not r:
            return None
        if r["total_coletas"] > 1:
            raise ErroNegocio(
                "Há mais de uma coleta vinculada ao mesmo chamado. Confira os registros existentes.",
                409,
            )
        endereco = Endereco(
            r["endereco_id"],
            r["dono_endereco"],
            r["rua"],
            r["numero"],
            float(r["lat"]),
            float(r["lng"]),
            bool(r["ativo"]),
        )
        categoria = Categoria(r["categoria_id"], r["categoria_nome"], r["perigo"], r["instrucoes"])
        coleta = None
        if r["coleta_id"]:
            coleta = Coleta(
                r["coleta_id"],
                r["id"],
                r["coletor_id"],
                float(r["distancia_km"]) if r["distancia_km"] is not None else None,
                r["aceito_em"],
                r["concluido_em"],
                r["coletor_nome"],
            )
        return Chamado(
            r["id"],
            r["morador_id"],
            endereco,
            categoria,
            r["foto_url"],
            Situacao.do_banco(r["status"]),
            r["criado_em"],
            coleta,
        )

    def buscar(self, id, bloquear=False):
        if bloquear:
            # Todos os aceites desta API travam a mesma linha antes de consultar/inserir a coleta.
            row = self.um("SELECT id FROM chamado WHERE id=%s FOR UPDATE", (id,))
            if not row:
                return None
            self.varios("SELECT id FROM coleta WHERE chamado_id=%s FOR UPDATE", (id,))
        return self.entidade(self.um(SELECAO_CHAMADOS + " WHERE ch.id=%s", (id,)))

    def por_foto(self, referencia):
        rows = self.varios(SELECAO_CHAMADOS + " WHERE ch.foto_url=%s", (referencia,))
        if len(rows) != 1:
            return None
        return self.entidade(rows[0])

    def listar(self, usuario, visao):
        if visao == "radar":
            usuario.exigir_perfil(Perfil.COOPERATIVA)
            # Filtra depois da leitura para reconhecer os estados já usados pelo banco.
            rows = self.varios(SELECAO_CHAMADOS + " ORDER BY ch.id DESC")
            return [c for c in map(self.entidade, rows) if c.situacao == Situacao.PENDENTE]
        filtro = "ch.morador_id" if usuario.perfil == Perfil.MORADOR else "c.coletor_id"
        return [
            self.entidade(r)
            for r in self.varios(
                SELECAO_CHAMADOS + f" WHERE {filtro}=%s ORDER BY ch.id DESC", (usuario.id,)
            )
        ]

    def inserir(self, usuario_id, endereco_id, categoria_id, foto_url, agora):
        id, _ = self.executar(
            "INSERT INTO chamado (morador_id,endereco_id,categoria_id,foto_url,status,criado_em) "
            "VALUES (%s,%s,%s,%s,%s,%s)",
            (usuario_id, endereco_id, categoria_id, foto_url, Situacao.PENDENTE.no_banco, agora),
        )
        return id

    def salvar_estado(self, chamado):
        self.executar(
            "UPDATE chamado SET status=%s WHERE id=%s", (chamado.situacao.no_banco, chamado.id)
        )


class Coletas(RepositorioSQL):
    def inserir(self, coleta):
        id, _ = self.executar(
            "INSERT INTO coleta (chamado_id,coletor_id,distancia_km,aceito_em,concluido_em) "
            "VALUES (%s,%s,%s,%s,%s)",
            (coleta.chamado_id, coleta.coletor_id, coleta.distancia_km, coleta.aceito_em, None),
        )
        coleta.id = id

    def concluir(self, coleta):
        self.executar(
            "UPDATE coleta SET concluido_em=%s WHERE id=%s", (coleta.concluido_em, coleta.id)
        )


class Repositorios:
    def __init__(self, conexao):
        self.usuarios = Usuarios(conexao)
        self.categorias = Categorias(conexao)
        self.enderecos = Enderecos(conexao)
        self.chamados = Chamados(conexao)
        self.coletas = Coletas(conexao)
