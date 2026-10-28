from dataclasses import dataclass, field
from pathlib import Path
import os
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Configuracao:
    segredo: str = field(repr=False)
    banco_nome: str = "sys"
    banco_host: str = "127.0.0.1"
    banco_porta: int = 3306
    banco_usuario: str = ""
    banco_senha: str = field(default="", repr=False)
    banco_socket: str | None = None
    fuso: str = "America/Sao_Paulo"
    pasta_fotos: Path = RAIZ / "dados" / "fotos"
    cookie_seguro: bool = False
    origens: tuple = ("http://127.0.0.1:5000", "http://localhost:5000")
    sessao_segundos: int = 7200
    max_sessoes: int = 10000
    porta: int = 5000
    host: str = "127.0.0.1"

    def __post_init__(self):
        if len(self.segredo.encode()) < 32 or self.segredo.startswith("troque"):
            raise ValueError("Defina API_SECRET com pelo menos 32 bytes aleatórios no .env.")
        ZoneInfo(self.fuso)
        if not self.banco_nome or not self.banco_usuario:
            raise ValueError("Preencha MYSQL_DATABASE e MYSQL_USER no .env.")
        if not 1 <= self.banco_porta <= 65535 or self.sessao_segundos < 60:
            raise ValueError("Porta do banco ou duração de sessão inválida.")
        if self.max_sessoes < 1:
            raise ValueError("MAX_SESSOES deve ser positivo.")
        for origem in self.origens:
            if not origem.startswith(("http://", "https://")) or origem.endswith("/"):
                raise ValueError("Use origens completas sem barra final em ORIGENS_PERMITIDAS.")

    @classmethod
    def ambiente(cls):
        load_dotenv(RAIZ / ".env")
        return cls(
            segredo=os.getenv("API_SECRET", ""),
            banco_nome=os.getenv("MYSQL_DATABASE", "sys"),
            banco_host=os.getenv("MYSQL_HOST", "127.0.0.1"),
            banco_porta=int(os.getenv("MYSQL_PORT", "3306")),
            banco_usuario=os.getenv("MYSQL_USER", ""),
            banco_senha=os.getenv("MYSQL_PASSWORD", ""),
            banco_socket=os.getenv("MYSQL_SOCKET") or None,
            fuso=os.getenv("DB_TIMEZONE", "America/Sao_Paulo"),
            pasta_fotos=Path(os.getenv("PASTA_FOTOS", str(RAIZ / "dados/fotos"))).resolve(),
            cookie_seguro=os.getenv("COOKIE_SECURE", "false").lower() == "true",
            origens=tuple(
                x.strip()
                for x in os.getenv(
                    "ORIGENS_PERMITIDAS", "http://127.0.0.1:5000,http://localhost:5000"
                ).split(",")
                if x.strip()
            ),
            sessao_segundos=int(os.getenv("SESSAO_SEGUNDOS", "7200")),
            max_sessoes=int(os.getenv("MAX_SESSOES", "10000")),
            porta=int(os.getenv("PORT", "5000")),
            host=os.getenv("HOST", "127.0.0.1"),
        )
