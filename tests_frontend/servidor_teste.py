"""Ambiente isolado para o teste de navegador. Não lê o .env nem conecta ao MySQL.

Executa o Flask e os serviços reais com os repositórios em memória de tests/conftest.py.
As portas e a pasta temporária são exclusivas desta execução.
"""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event, Thread
from urllib.parse import urlsplit
import importlib.util
import json
import re
import signal
import sys

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from recicladescarte import criar_app
from recicladescarte.configuracao import Configuracao
from recicladescarte.dominio import Categoria
from werkzeug.serving import make_server

spec = importlib.util.spec_from_file_location("fixtures_coletas", RAIZ / "tests" / "conftest.py")
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)


def main():
    api_url = ""

    class Paginas(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(RAIZ), **kwargs)

        def do_GET(self):
            caminho = urlsplit(self.path).path
            parte = caminho.strip("/").split("/")[0]
            if caminho not in ("/", "/index.html") and parte not in {
                "pages",
                "css",
                "scripts",
                "imagens",
                "icon",
            }:
                self.send_error(404)
                return
            if caminho == "/scripts/config.js":
                texto = (RAIZ / "scripts" / "config.js").read_text(encoding="utf-8")
                texto = re.sub(
                    r"apiBase:\s*[\"\'][^\"\']*[\"\']", f'apiBase: "{api_url}/api"', texto, count=1
                )
                corpo = texto.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript; charset=utf-8")
                self.send_header("Content-Length", str(len(corpo)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(corpo)
                return
            super().do_GET()

        def log_message(self, *args):
            pass

    paginas = ThreadingHTTPServer(("127.0.0.1", 0), Paginas)
    front_url = f"http://127.0.0.1:{paginas.server_port}"
    with TemporaryDirectory(prefix="rd-coletas-navegador-") as pasta:
        banco = fixtures.BancoMemoria()
        banco.categorias = {
            17: Categoria(17, "Papel", "Baixo", "Separe o papel limpo e seco."),
            41: Categoria(41, "Eletrônicos", "Atenção", "Mantenha o equipamento inteiro."),
        }
        config = Configuracao(
            segredo="segredo-exclusivo-do-teste-isolado-de-navegador-2026",
            banco_usuario="teste-em-memoria",
            pasta_fotos=Path(pasta) / "fotos",
            origens=(front_url,),
        )
        app = criar_app(config, banco=banco)
        api = make_server("127.0.0.1", 0, app, threaded=True)
        api_url = f"http://127.0.0.1:{api.server_port}"
        for servidor in (api, paginas):
            Thread(target=servidor.serve_forever, daemon=True).start()
        parar = Event()
        signal.signal(signal.SIGTERM, lambda *_: parar.set())
        signal.signal(signal.SIGINT, lambda *_: parar.set())
        print(json.dumps({"api": api_url, "front": front_url}), flush=True)
        try:
            parar.wait()
        finally:
            api.shutdown()
            paginas.shutdown()
            api.server_close()
            paginas.server_close()


if __name__ == "__main__":
    main()
