"""Um processo com threads: sessões temporárias são compartilhadas entre elas."""

from waitress import serve
from recicladescarte import criar_app
from recicladescarte.configuracao import Configuracao

if __name__ == "__main__":
    config = Configuracao.ambiente()
    app = criar_app(config)
    app.extensions["banco"].verificar()
    print(f"ReciclaDescarte API em http://{config.host}:{config.porta}/api/saude")
    serve(
        app, host=config.host, port=config.porta, threads=4, max_request_body_size=6 * 1024 * 1024
    )
