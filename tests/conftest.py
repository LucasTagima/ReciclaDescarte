"""Repositórios em memória exclusivos dos testes; nunca usados como fallback pela API."""

from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime
from threading import RLock
from types import SimpleNamespace
from pathlib import Path
import sys
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from recicladescarte import criar_app
from recicladescarte.banco import Banco, Usuarios
from recicladescarte.configuracao import Configuracao
from recicladescarte.dominio import Categoria, Endereco, Chamado, Situacao, Perfil


class BancoMemoria(Banco):
    def __init__(self):
        self.usuarios = {}
        self.enderecos = {}
        self.chamados = {}
        self.categorias = {1: Categoria(1, "Eletrônicos", "Atenção", "Separar o material.")}
        self.trava = RLock()

    def verificar(self):
        pass

    @contextmanager
    def transacao(self):
        with self.trava:
            snapshot = deepcopy((self.usuarios, self.enderecos, self.chamados))
            try:
                yield SimpleNamespace(
                    usuarios=UsuariosMemoria(self),
                    categorias=CategoriasMemoria(self),
                    enderecos=EnderecosMemoria(self),
                    chamados=ChamadosMemoria(self),
                    coletas=ColetasMemoria(self),
                )
            except Exception:
                self.usuarios, self.enderecos, self.chamados = snapshot
                raise


class UsuariosMemoria:
    entidade = staticmethod(Usuarios.entidade)

    def __init__(self, banco):
        self.banco = banco

    def por_id(self, id):
        return self.entidade(self.banco.usuarios.get(id))

    def por_email(self, email):
        return next((u for u in self.banco.usuarios.values() if u["email"] == email), None)

    def atualizar_senha(self, id, hash_senha):
        self.banco.usuarios[id]["senha"] = hash_senha

    def inserir(self, dados, hash_senha, agora):
        id = len(self.banco.usuarios) + 1
        row = {
            "id": id,
            "nome": dados["nome"],
            "email": dados["email"],
            "senha": hash_senha,
            "telefone": dados["telefone"],
            "perfil": dados["tipo"],
            "criado_em": agora,
        }
        self.banco.usuarios[id] = row
        return self.entidade(row)


class CategoriasMemoria:
    def __init__(self, banco):
        self.banco = banco

    def listar(self):
        return list(self.banco.categorias.values())

    def buscar(self, id):
        return self.banco.categorias.get(id)


class EnderecosMemoria:
    def __init__(self, banco):
        self.banco = banco

    def inserir(self, usuario_id, dados, ponto):
        id = len(self.banco.enderecos) + 1
        self.banco.enderecos[id] = Endereco(
            id,
            usuario_id,
            dados["logradouro"],
            dados["numero"],
            ponto["latitude"],
            ponto["longitude"],
        )
        return id


class ChamadosMemoria:
    def __init__(self, banco):
        self.banco = banco

    def buscar(self, id, bloquear=False):
        return self.banco.chamados.get(id)

    def por_foto(self, referencia):
        return next((c for c in self.banco.chamados.values() if c.foto_url == referencia), None)

    def listar(self, usuario, visao):
        if visao == "radar":
            usuario.exigir_perfil(Perfil.COOPERATIVA)
        return [
            c
            for c in self.banco.chamados.values()
            if (
                (c.situacao == Situacao.PENDENTE)
                if visao == "radar"
                else (
                    c.morador_id == usuario.id
                    if usuario.perfil == Perfil.MORADOR
                    else c.coleta is not None and c.coleta.coletor_id == usuario.id
                )
            )
        ]

    def inserir(self, usuario_id, endereco_id, categoria_id, foto_url, agora):
        id = len(self.banco.chamados) + 1
        self.banco.chamados[id] = Chamado(
            id,
            usuario_id,
            self.banco.enderecos[endereco_id],
            self.banco.categorias[categoria_id],
            foto_url,
            Situacao.PENDENTE,
            agora,
        )
        return id

    def salvar_estado(self, c):
        self.banco.chamados[c.id] = c


class ColetasMemoria:
    def __init__(self, banco):
        self.banco = banco

    def inserir(self, c):
        c.id = c.chamado_id

    def concluir(self, c):
        pass


@pytest.fixture
def config(tmp_path):
    return Configuracao(
        segredo="segredo-de-testes-com-mais-de-trinta-e-dois-bytes",
        banco_usuario="teste",
        pasta_fotos=tmp_path / "fotos",
    )


@pytest.fixture
def banco():
    return BancoMemoria()


@pytest.fixture
def app(config, banco):
    return criar_app(config, banco)


class Acesso:
    def __init__(self, app):
        self.client = app.test_client()
        self.csrf = self.client.get("/api/auth/csrf").json["dados"]["csrf_token"]

    def post(self, url, **kwargs):
        headers = {"X-CSRF-Token": self.csrf, **kwargs.pop("headers", {})}
        return self.client.post(url, headers=headers, **kwargs)

    def cadastrar(self, email="morador@example.com", tipo="morador", senha="Senha de teste 123"):
        return self.post(
            "/api/auth/cadastro",
            json={
                "nome": "Pessoa de teste",
                "email": email,
                "senha": senha,
                "tipo": tipo,
                "telefone": "19999999999",
            },
        )

    def entrar(self, email="morador@example.com", senha="Senha de teste 123"):
        res = self.post("/api/auth/login", json={"email": email, "senha": senha})
        if res.status_code == 200:
            self.csrf = self.client.get("/api/auth/csrf").json["dados"]["csrf_token"]
        return res


@pytest.fixture
def acesso(app):
    return Acesso(app)
