"""JWT assinado e registro temporário para revogação, sem criar tabela de sessão."""

from collections import defaultdict, deque
from dataclasses import dataclass
from threading import RLock
import secrets
import time
import jwt
from werkzeug.security import generate_password_hash, check_password_hash
from .dominio import ErroNegocio

COOKIE = "rd_sessao"


class Senhas:
    def __init__(self):
        # Usado também para não pular o custo do hash quando o e-mail não existe.
        self._falso = generate_password_hash(secrets.token_urlsafe(32))

    def gerar(self, senha):
        return generate_password_hash(senha, method="scrypt")

    def conferir(self, hash_salvo, senha):
        permitido = isinstance(hash_salvo, str) and hash_salvo.startswith(
            ("scrypt:", "pbkdf2:sha256:")
        )
        try:
            valido = check_password_hash(hash_salvo if permitido else self._falso, senha)
        except (ValueError, TypeError):
            check_password_hash(self._falso, senha)
            return False
        return permitido and valido


@dataclass(frozen=True)
class Sessao:
    id: str
    usuario_id: int | None
    csrf: str
    criada_em: float
    expira_em: float


class Sessoes:
    def __init__(self, config, relogio=time.time):
        self.config = config
        self.relogio = relogio
        self._itens = {}
        self._trava = RLock()

    def _limpar(self):
        agora = self.relogio()
        for id in [id for id, s in self._itens.items() if s.expira_em <= agora]:
            self._itens.pop(id, None)

    def criar(self, usuario_id=None, substituir=None):
        with self._trava:
            self._limpar()
            if len(self._itens) >= self.config.max_sessoes and substituir not in self._itens:
                raise ErroNegocio("Muitas sessões abertas. Tente novamente mais tarde.", 503)
            agora = self.relogio()
            duracao = self.config.sessao_segundos if usuario_id is not None else 1200
            sessao = Sessao(
                secrets.token_urlsafe(32),
                usuario_id,
                secrets.token_urlsafe(32),
                agora,
                agora + duracao,
            )
            token = jwt.encode(
                {
                    "sub": str(usuario_id) if usuario_id is not None else "anonimo",
                    "jti": sessao.id,
                    "iat": int(agora),
                    "nbf": int(agora),
                    "exp": int(sessao.expira_em),
                    "iss": "recicladescarte",
                    "aud": "recicladescarte-api",
                },
                self.config.segredo,
                algorithm="HS256",
            )
            if substituir:
                self._itens.pop(substituir, None)
            self._itens[sessao.id] = sessao
            return sessao, token

    def obter(self, token):
        if not token:
            return None
        try:
            claims = jwt.decode(
                token,
                self.config.segredo,
                algorithms=["HS256"],
                audience="recicladescarte-api",
                issuer="recicladescarte",
                options={"require": ["sub", "jti", "iat", "nbf", "exp", "iss", "aud"]},
            )
        except jwt.InvalidTokenError:
            return None
        with self._trava:
            self._limpar()
            sessao = self._itens.get(claims["jti"])
            if not sessao:
                return None
            esperado = str(sessao.usuario_id) if sessao.usuario_id is not None else "anonimo"
            return sessao if claims["sub"] == esperado else None

    def revogar(self, sessao):
        with self._trava:
            self._itens.pop(sessao.id, None)

    @staticmethod
    def validar_csrf(sessao, recebido):
        if (
            not sessao
            or not isinstance(recebido, str)
            or not recebido.isascii()
            or not secrets.compare_digest(sessao.csrf, recebido)
        ):
            raise ErroNegocio("Validação da sessão recusada. Obtenha um novo token CSRF.", 403)


class LimiteTentativas:
    def __init__(self, limite=10, janela=900, relogio=time.monotonic):
        self.limite, self.janela, self.relogio = limite, janela, relogio
        self._itens = defaultdict(deque)
        self._trava = RLock()

    def conferir(self, chave):
        with self._trava:
            agora = self.relogio()
            for k in list(self._itens):
                fila = self._itens[k]
                while fila and fila[0] <= agora - self.janela:
                    fila.popleft()
                if not fila:
                    del self._itens[k]
            fila = self._itens[chave]
            if len(fila) >= self.limite:
                raise ErroNegocio("Muitas tentativas. Aguarde quinze minutos.", 429)
            if len(self._itens) > 20000:
                raise ErroNegocio("Serviço ocupado. Tente novamente mais tarde.", 503)
            fila.append(agora)
