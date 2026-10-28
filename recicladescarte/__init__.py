"""API REST separada do front-end, criada por uma fábrica de aplicação."""

from functools import wraps
import json
import logging
import secrets
from flask import Flask, request, jsonify, g, send_file
from werkzeug.exceptions import HTTPException
import pymysql
from .configuracao import Configuracao
from .dominio import ErroNegocio
from .banco import BancoMySQL
from .fotos import ArmazenamentoFotos
from .seguranca import Sessoes, Senhas, LimiteTentativas, COOKIE
from .servicos import ServicoUsuarios, ServicoColetas


def criar_app(config=None, banco=None):
    config = config or Configuracao.ambiente()
    app = Flask(__name__, static_folder=None)
    app.config.update(
        MAX_CONTENT_LENGTH=6 * 1024 * 1024,
        MAX_FORM_MEMORY_SIZE=128 * 1024,
        MAX_FORM_PARTS=10,
        JSON_AS_ASCII=False,
    )
    app.json.ensure_ascii = False
    banco = banco or BancoMySQL(config)
    sessoes = Sessoes(config)
    senhas = Senhas()
    usuarios = ServicoUsuarios(banco, senhas, config)
    coletas = ServicoColetas(banco, ArmazenamentoFotos(config.pasta_fotos), config)
    limite_login = LimiteTentativas()
    limite_cadastro = LimiteTentativas(limite=10)
    app.extensions.update(banco=banco, sessoes=sessoes, usuarios=usuarios, coletas=coletas)

    def resposta(dados, status=200):
        return jsonify(dados=dados), status

    def sessao_atual():
        if not hasattr(g, "sessao"):
            g.sessao = sessoes.obter(request.cookies.get(COOKIE))
        return g.sessao

    def exigir_csrf():
        sessoes.validar_csrf(sessao_atual(), request.headers.get("X-CSRF-Token"))

    def protegido(funcao):
        @wraps(funcao)
        def executar(*args, **kwargs):
            sessao = sessao_atual()
            if not sessao or sessao.usuario_id is None:
                raise ErroNegocio("Sessão ausente ou expirada. Entre novamente.", 401)
            g.usuario = usuarios.obter(sessao.usuario_id)
            return funcao(*args, **kwargs)

        return executar

    def cookie(res, token, duracao):
        res.set_cookie(
            COOKIE,
            token,
            max_age=int(duracao),
            httponly=True,
            secure=config.cookie_seguro,
            samesite="Lax",
            path="/api",
        )

    @app.before_request
    def conferir_origem():
        g.requisicao_id = secrets.token_hex(8)
        origem = request.headers.get("Origin")
        if origem and origem not in config.origens:
            raise ErroNegocio("Origem não permitida para esta aplicação.", 403)
        if request.method == "OPTIONS":
            return "", 204

    @app.after_request
    def cabecalhos(res):
        res.headers["Cache-Control"] = "no-store"
        res.headers["X-Content-Type-Options"] = "nosniff"
        res.headers["Referrer-Policy"] = "no-referrer"
        res.headers["X-Frame-Options"] = "DENY"
        res.headers["X-Requisicao-Id"] = getattr(g, "requisicao_id", "")
        origem = request.headers.get("Origin")
        if origem in config.origens:
            res.headers["Access-Control-Allow-Origin"] = origem
            res.headers["Access-Control-Allow-Credentials"] = "true"
            res.headers["Access-Control-Allow-Headers"] = "Content-Type, X-CSRF-Token"
            res.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            res.vary.add("Origin")
        return res

    @app.errorhandler(ErroNegocio)
    def erro_negocio(erro):
        corpo = {"mensagem": str(erro)}
        if erro.campos:
            corpo["campos"] = erro.campos
        res = jsonify(erro=corpo)
        res.status_code = erro.status
        if erro.status == 429:
            res.headers["Retry-After"] = "900"
        return res

    @app.errorhandler(pymysql.MySQLError)
    def erro_banco(erro):
        codigo = erro.args[0] if erro.args else 0
        if codigo == 1062:
            return erro_negocio(ErroNegocio("O registro já está cadastrado.", 409))
        if codigo in (1205, 1213):
            return erro_negocio(
                ErroNegocio(
                    "Outra operação está atualizando esta coleta. Atualize e tente novamente.", 409
                )
            )
        app.logger.error("Falha de banco; código=%s; requisição=%s", codigo, g.requisicao_id)
        return erro_negocio(
            ErroNegocio(
                "Não foi possível acessar o banco de dados. Confira a configuração do serviço.", 503
            )
        )

    @app.errorhandler(HTTPException)
    def erro_http(erro):
        mensagens = {
            400: "Requisição ou JSON inválido.",
            404: "Recurso não encontrado.",
            405: "Método não permitido.",
            413: "A requisição excede o tamanho permitido.",
            415: "Envie Content-Type application/json para esta operação.",
        }
        return erro_negocio(
            ErroNegocio(
                mensagens.get(erro.code, "Não foi possível processar a requisição."), erro.code
            )
        )

    @app.errorhandler(Exception)
    def erro_inesperado(erro):
        # Não devolve SQL, caminhos, senhas ou o segredo de assinatura ao cliente.
        app.logger.error(
            "Falha interna; tipo=%s; requisição=%s", type(erro).__name__, g.requisicao_id
        )
        return erro_negocio(ErroNegocio("Não foi possível concluir a operação.", 500))

    @app.get("/api/saude")
    def saude():
        banco.verificar()
        return resposta({"servico": "ReciclaDescarte", "banco": "disponivel"})

    @app.get("/api/auth/csrf")
    def csrf():
        atual = sessao_atual()
        res = jsonify(dados={"csrf_token": atual.csrf}) if atual else None
        if atual is None:
            atual, token = sessoes.criar()
            res = jsonify(dados={"csrf_token": atual.csrf})
            cookie(res, token, 1200)
        return res

    @app.post("/api/auth/cadastro")
    def cadastro():
        exigir_csrf()
        limite_cadastro.conferir(request.remote_addr or "local")
        usuario = usuarios.cadastrar(request.get_json())
        return resposta({"id": str(usuario.id)}, 201)

    @app.post("/api/auth/login")
    def entrar():
        exigir_csrf()
        limite_login.conferir(request.remote_addr or "local")
        usuario = usuarios.entrar(request.get_json())
        atual = sessao_atual()
        _, token = sessoes.criar(usuario.id, substituir=atual.id)
        res = jsonify(dados=usuario.publico())
        cookie(res, token, config.sessao_segundos)
        return res

    @app.get("/api/auth/me")
    @protegido
    def perfil():
        return resposta(g.usuario.publico())

    @app.post("/api/auth/logout")
    @protegido
    def sair():
        exigir_csrf()
        sessoes.revogar(sessao_atual())
        res = app.response_class(status=204)
        res.delete_cookie(
            COOKIE, path="/api", secure=config.cookie_seguro, httponly=True, samesite="Lax"
        )
        return res

    @app.get("/api/categorias")
    def categorias():
        return resposta(coletas.categorias())

    @app.get("/api/chamados")
    @protegido
    def listar_chamados():
        extras = set(request.args) - {"visao"}
        if extras:
            raise ErroNegocio("Parâmetro de consulta não aceito: " + ", ".join(sorted(extras)))
        return resposta(coletas.listar(g.usuario, request.args.get("visao", "minhas")))

    @app.get("/api/chamados/<int:id>")
    @protegido
    def detalhes_chamado(id):
        return resposta(coletas.buscar(g.usuario, id))

    @app.post("/api/chamados")
    @protegido
    def criar_chamado():
        exigir_csrf()
        if request.mimetype != "multipart/form-data":
            raise ErroNegocio("Envie multipart/form-data com dados e foto.", 415)
        if (
            set(request.form) != {"dados"}
            or set(request.files) != {"foto"}
            or len(request.form.getlist("dados")) != 1
            or len(request.files.getlist("foto")) != 1
        ):
            raise ErroNegocio("Envie somente uma parte dados e uma parte foto.", 400)
        try:
            dados = json.loads(request.form["dados"])
        except (ValueError, TypeError):
            raise ErroNegocio("A parte dados deve conter JSON válido.", 400)
        return resposta(coletas.criar(g.usuario, dados, request.files["foto"]), 201)

    def alterar_chamado(id, acao):
        exigir_csrf()
        if request.content_length not in (None, 0):
            raise ErroNegocio("Esta operação não recebe corpo.", 400)
        return resposta(coletas.atualizar(g.usuario, id, acao))

    @app.post("/api/chamados/<int:id>/aceitar")
    @protegido
    def aceitar(id):
        return alterar_chamado(id, "aceitar")

    @app.post("/api/chamados/<int:id>/concluir")
    @protegido
    def concluir(id):
        return alterar_chamado(id, "concluir")

    @app.get("/api/fotos/<nome>")
    @protegido
    def foto(nome):
        caminho = coletas.foto(g.usuario, f"/api/fotos/{nome}")
        if not caminho.is_file():
            raise ErroNegocio("Foto não encontrada.", 404)
        return send_file(caminho, mimetype="image/jpeg", conditional=False, max_age=0)

    return app
