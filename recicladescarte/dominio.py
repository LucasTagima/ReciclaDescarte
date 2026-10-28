"""Entidades e regras do fluxo; este módulo não depende de Flask ou MySQL."""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
import unicodedata


class ErroNegocio(Exception):
    def __init__(self, mensagem, status=422, campos=None):
        super().__init__(mensagem)
        self.status = status
        self.campos = campos or {}


def texto_normalizado(valor):
    texto = unicodedata.normalize("NFKD", str(valor or ""))
    return "".join(c for c in texto if not unicodedata.combining(c)).strip().lower()


class Perfil(str, Enum):
    MORADOR = "morador"
    COOPERATIVA = "cooperativa"

    @classmethod
    def do_banco(cls, valor):
        valor = texto_normalizado(valor)
        if valor in {"cooperativa", "coletor", "catador"}:
            return cls.COOPERATIVA
        if valor == "morador":
            return cls.MORADOR
        raise ErroNegocio("Este perfil não tem acesso a esta versão da aplicação.", 403)


class Situacao(str, Enum):
    PENDENTE = "pendente"
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDO = "concluido"

    @classmethod
    def do_banco(cls, valor):
        try:
            return cls(texto_normalizado(valor).replace(" ", "_"))
        except ValueError:
            raise ErroNegocio("Há um chamado com situação não reconhecida no banco.", 409)

    @property
    def no_banco(self):
        return {
            self.PENDENTE: "Pendente",
            self.EM_ANDAMENTO: "Em Andamento",
            self.CONCLUIDO: "Concluído",
        }[self]


@dataclass(frozen=True)
class Usuario:
    id: int
    nome: str
    email: str
    telefone: str | None
    perfil: Perfil

    def exigir_perfil(self, perfil):
        if self.perfil != perfil:
            raise ErroNegocio("Seu perfil não tem permissão para esta ação.", 403)

    def publico(self):
        return {
            "id": str(self.id),
            "nome": self.nome,
            "email": self.email,
            "telefone": self.telefone,
            "tipo": self.perfil.value,
        }


@dataclass(frozen=True)
class Endereco:
    id: int
    usuario_id: int
    rua: str
    numero: str | None
    lat: float
    lng: float
    ativo: bool = True


@dataclass(frozen=True)
class Categoria:
    id: int
    nome: str
    perigo: str | None = None
    instrucoes: str | None = None

    def publico(self):
        return {
            "id": str(self.id),
            "nome": self.nome,
            "perigo": self.perigo,
            "instrucoes": self.instrucoes,
        }


@dataclass
class Coleta:
    id: int | None
    chamado_id: int
    coletor_id: int
    distancia_km: float | None
    aceito_em: datetime
    concluido_em: datetime | None = None
    coletor_nome: str | None = None

    def concluir(self, usuario, agora):
        usuario.exigir_perfil(Perfil.COOPERATIVA)
        if self.coletor_id != usuario.id:
            raise ErroNegocio("Somente o responsável pode concluir esta coleta.", 403)
        if self.concluido_em is not None:
            raise ErroNegocio("Esta coleta já foi concluída.", 409)
        self.concluido_em = agora


@dataclass
class Chamado:
    id: int
    morador_id: int
    endereco: Endereco
    categoria: Categoria
    foto_url: str | None
    situacao: Situacao
    criado_em: datetime | None
    coleta: Coleta | None = None

    def aceitar(self, usuario, agora):
        usuario.exigir_perfil(Perfil.COOPERATIVA)
        if self.situacao != Situacao.PENDENTE or self.coleta is not None:
            raise ErroNegocio("Esta solicitação já foi assumida ou mudou de situação.", 409)
        self.situacao = Situacao.EM_ANDAMENTO
        self.coleta = Coleta(None, self.id, usuario.id, None, agora, coletor_nome=usuario.nome)
        return self.coleta

    def concluir(self, usuario, agora):
        if self.situacao != Situacao.EM_ANDAMENTO or self.coleta is None:
            raise ErroNegocio("Somente uma coleta em andamento pode ser concluída.", 409)
        self.coleta.concluir(usuario, agora)
        self.situacao = Situacao.CONCLUIDO

    def acesso_completo(self, usuario):
        return (usuario.perfil == Perfil.MORADOR and self.morador_id == usuario.id) or (
            self.coleta is not None and self.coleta.coletor_id == usuario.id
        )

    def pode_visualizar(self, usuario):
        return self.acesso_completo(usuario) or (
            usuario.perfil == Perfil.COOPERATIVA and self.situacao == Situacao.PENDENTE
        )
