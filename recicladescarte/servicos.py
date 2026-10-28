from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from .dominio import ErroNegocio, Perfil
from . import validacao


class ServicoUsuarios:
    def __init__(self, banco, senhas, config):
        self.banco, self.senhas, self.config = banco, senhas, config

    def cadastrar(self, dados):
        dados = validacao.cadastro(dados)
        hash_senha = self.senhas.gerar(dados["senha"])
        with self.banco.transacao() as repos:
            if repos.usuarios.por_email(dados["email"]):
                raise ErroNegocio(
                    "Este e-mail já está cadastrado.", 409, {"email": "E-mail já cadastrado."}
                )
            return repos.usuarios.inserir(dados, hash_senha, agora_banco(self.config))

    def entrar(self, dados):
        email, senha = validacao.login(dados)
        with self.banco.transacao() as repos:
            row = repos.usuarios.por_email(email)
            confere = self.senhas.conferir(row["senha"] if row else None, senha)
            if not row or not confere:
                raise ErroNegocio("E-mail ou senha incorretos.", 401)
            return repos.usuarios.entidade(row)

    def obter(self, id):
        with self.banco.transacao() as repos:
            usuario = repos.usuarios.por_id(id)
            if not usuario:
                raise ErroNegocio("Sessão ausente ou expirada. Entre novamente.", 401)
            return usuario


def agora_banco(config):
    return datetime.now(ZoneInfo(config.fuso)).replace(tzinfo=None, microsecond=0)


class ServicoColetas:
    def __init__(self, banco, fotos, config):
        self.banco, self.fotos, self.config = banco, fotos, config

    def categorias(self):
        with self.banco.transacao() as repos:
            return [c.publico() for c in repos.categorias.listar()]

    def listar(self, usuario, visao):
        if visao not in ("minhas", "radar"):
            raise ErroNegocio("Use visao=minhas ou visao=radar.")
        with self.banco.transacao() as repos:
            return [self.publico(c, usuario) for c in repos.chamados.listar(usuario, visao)]

    def buscar(self, usuario, id):
        with self.banco.transacao() as repos:
            c = self._existente(repos.chamados.buscar(id))
            if not c.pode_visualizar(usuario):
                raise ErroNegocio("Solicitação não encontrada.", 404)
            return self.publico(c, usuario)

    def criar(self, usuario, dados, foto):
        usuario.exigir_perfil(Perfil.MORADOR)
        dados = validacao.chamado(dados)
        # Só salva arquivo depois de validar os campos; remove-o se a transação falhar.
        referencia = self.fotos.salvar(foto)
        preparado = False
        try:
            with self.banco.transacao() as repos:
                if not repos.categorias.buscar(dados["categoria_id"]):
                    raise ErroNegocio(
                        "Selecione uma categoria existente.",
                        campos={"categoria_id": "Categoria inválida."},
                    )
                endereco_id = repos.enderecos.inserir(
                    usuario.id, dados["endereco"], dados["localizacao"]
                )
                id = repos.chamados.inserir(
                    usuario.id,
                    endereco_id,
                    dados["categoria_id"],
                    referencia,
                    agora_banco(self.config),
                )
                resultado = self.publico(self._existente(repos.chamados.buscar(id)), usuario)
                preparado = True
            return resultado
        except Exception:
            # Se a conexão cair durante o commit, o resultado pode ser desconhecido.
            # Preservar a foto evita apagar o arquivo de um registro já confirmado pelo banco.
            if not preparado:
                self.fotos.excluir(referencia)
            raise

    def atualizar(self, usuario, id, acao):
        usuario.exigir_perfil(Perfil.COOPERATIVA)
        with self.banco.transacao() as repos:
            c = self._existente(repos.chamados.buscar(id, bloquear=True))
            agora = agora_banco(self.config)
            if acao == "aceitar":
                coleta = c.aceitar(usuario, agora)
                repos.coletas.inserir(coleta)
            elif acao == "concluir":
                c.concluir(usuario, agora)
                repos.coletas.concluir(c.coleta)
            else:
                raise ErroNegocio("Ação inválida.")
            repos.chamados.salvar_estado(c)
            return self.publico(c, usuario)

    def foto(self, usuario, referencia):
        with self.banco.transacao() as repos:
            c = self._existente(repos.chamados.por_foto(referencia))
            if not c.pode_visualizar(usuario):
                raise ErroNegocio("Foto não encontrada.", 404)
        return self.fotos.caminho(referencia)

    @staticmethod
    def _existente(chamado):
        if not chamado:
            raise ErroNegocio("Solicitação não encontrada.", 404)
        return chamado

    def publico(self, c, usuario):
        completo = c.acesso_completo(usuario)
        dt = lambda valor: (
            (
                valor.replace(tzinfo=ZoneInfo(self.config.fuso))
                .astimezone(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z")
            )
            if valor
            else None
        )
        ponto = {"latitude": c.endereco.lat, "longitude": c.endereco.lng}
        if not completo:
            ponto = {chave: round(v, 2) for chave, v in ponto.items()}
        dados = {
            "id": str(c.id),
            "categoria": c.categoria.publico(),
            "status": c.situacao.value,
            "criado_em": dt(c.criado_em),
            "localizacao": ponto,
            "precisao_localizacao": "exata" if completo else "aproximada",
            "foto_url": c.foto_url if c.foto_url and c.foto_url.startswith("/api/fotos/") else None,
            "cooperativa_id": str(c.coleta.coletor_id) if c.coleta and completo else None,
            "cooperativa_nome": c.coleta.coletor_nome if c.coleta and completo else None,
            "aceito_em": dt(c.coleta.aceito_em) if c.coleta else None,
            "concluido_em": dt(c.coleta.concluido_em) if c.coleta else None,
            "distancia_km": c.coleta.distancia_km if c.coleta else None,
        }
        if completo:
            dados["morador_id"] = str(c.morador_id)
            dados["endereco"] = {
                "id": str(c.endereco.id),
                "logradouro": c.endereco.rua,
                "numero": c.endereco.numero,
            }
        return dados
