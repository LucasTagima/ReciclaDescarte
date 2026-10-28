from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
import time
from dataclasses import replace
import jwt
import pytest
from PIL import Image
from conftest import Acesso, ColetasMemoria
from recicladescarte import criar_app
from recicladescarte.seguranca import COOKIE, Sessoes
from recicladescarte.dominio import ErroNegocio, Situacao
from recicladescarte import validacao


def imagem():
    buffer = BytesIO()
    Image.new("RGB", (16, 16), "green").save(buffer, "PNG")
    return buffer.getvalue()


def dados_chamado():
    return {
        "categoria_id": 1,
        "endereco": {"logradouro": "Rua de teste", "numero": "123"},
        "localizacao": {"latitude": -22.9056, "longitude": -47.0608},
    }


def criar(acesso, dados=None, conteudo=None, nome="foto.png"):
    return acesso.post(
        "/api/chamados",
        data={
            "dados": json.dumps(dados if dados is not None else dados_chamado()),
            "foto": (BytesIO(conteudo if conteudo is not None else imagem()), nome),
        },
        content_type="multipart/form-data",
    )


def conta(app, email, tipo="morador"):
    a = Acesso(app)
    assert a.cadastrar(email, tipo).status_code == 201
    assert a.entrar(email).status_code == 200
    return a


def test_cadastro_hash_login_perfil_e_logout(app, banco, config):
    a = Acesso(app)
    assert a.cadastrar().status_code == 201
    assert banco.usuarios[1]["senha"].startswith("scrypt:")
    assert banco.usuarios[1]["senha"] != "Senha de teste 123"
    antiga_csrf = a.csrf
    antigo_jwt = a.client.get_cookie(COOKIE, path="/api").value
    assert a.entrar().json["dados"]["tipo"] == "morador"
    token = a.client.get_cookie(COOKIE, path="/api").value
    claims = jwt.decode(
        token,
        config.segredo,
        algorithms=["HS256"],
        audience="recicladescarte-api",
        issuer="recicladescarte",
    )
    assert claims["sub"] == "1" and not {"senha", "email", "nome"} & set(claims)
    assert antiga_csrf != a.csrf and antigo_jwt != token
    assert a.client.get("/api/auth/me").json["dados"]["email"] == "morador@example.com"
    assert a.post("/api/auth/logout").status_code == 204
    assert a.client.get("/api/auth/me").status_code == 401
    replay = app.test_client()
    replay.set_cookie(COOKIE, token, path="/api")
    assert replay.get("/api/auth/me").status_code == 401


def test_csrf_cookies_origem_e_sessao_anonima(app):
    client = app.test_client()
    assert client.post("/api/auth/cadastro", json={}).status_code == 403
    res = client.get("/api/auth/csrf")
    header = res.headers["Set-Cookie"]
    assert "HttpOnly" in header and "SameSite=Lax" in header and "Path=/api" in header
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.get("/api/auth/csrf", headers={"Origin": "https://site-invasor.example"}).status_code
        == 403
    )
    assert (
        client.post("/api/auth/login", json={}, headers={"X-CSRF-Token": "errado"}).status_code
        == 403
    )
    assert (
        client.post("/api/auth/login", json={}, headers={"X-CSRF-Token": "inválido"}).status_code
        == 403
    )


def test_cookie_seguro_em_configuracao_https(config, banco):
    app = criar_app(replace(config, cookie_seguro=True), banco)
    assert "Secure" in app.test_client().get("/api/auth/csrf").headers["Set-Cookie"]


def test_senha_com_espacos_e_senha_legada_nao_e_texto_puro(app, banco):
    a = Acesso(app)
    assert a.cadastrar(senha="  minha senha 123  ").status_code == 201
    assert a.entrar(senha="minha senha 123").status_code == 401
    assert a.entrar(senha="  minha senha 123  ").status_code == 200
    banco.usuarios[1]["senha"] = "  minha senha 123  "
    assert a.entrar(senha="  minha senha 123  ").status_code == 401


def test_credenciais_erradas_duplicidade_e_perfil_invalido(acesso):
    assert acesso.cadastrar().status_code == 201
    assert acesso.cadastrar().status_code == 409
    assert acesso.entrar(senha="incorreta").status_code == 401
    assert acesso.entrar(email="naoexiste@example.com").status_code == 401
    assert acesso.cadastrar(email="admin@example.com", tipo="administrador").status_code == 422


def test_limite_de_tentativas(acesso):
    for _ in range(10):
        assert acesso.entrar(senha="incorreta").status_code == 401
    res = acesso.entrar(senha="incorreta")
    assert res.status_code == 429 and res.headers["Retry-After"] == "900"


def test_jwt_adulterado_expirado_e_reinicio(app, config, banco):
    a = conta(app, "pessoa@example.com")
    token = a.client.get_cookie(COOKIE, path="/api").value
    client = app.test_client()
    client.set_cookie(COOKIE, token[:-8] + "A" * 8, path="/api")
    assert client.get("/api/auth/me").status_code == 401
    outra = criar_app(config, banco).test_client()
    outra.set_cookie(COOKIE, token, path="/api")
    assert outra.get("/api/auth/me").status_code == 401
    s = Sessoes(config)
    sessao, jwt_real = s.criar(1)
    s.relogio = lambda: sessao.expira_em + 1
    assert s.obter(jwt_real) is None


def test_fluxo_coleta_permissoes_foto_e_privacidade(app):
    morador = conta(app, "m@example.com")
    outro = conta(app, "outro@example.com")
    coop = conta(app, "c@example.com", "cooperativa")
    outra_coop = conta(app, "c2@example.com", "cooperativa")
    res = criar(morador, nome="../../arquivo.png")
    assert res.status_code == 201, res.json
    c = res.json["dados"]
    assert c["status"] == "pendente" and c["endereco"]["logradouro"] == "Rua de teste"
    assert not {"peso_kg", "data_preferida", "observacoes"} & set(c)
    assert morador.client.get(c["foto_url"]).status_code == 200
    assert outro.client.get(c["foto_url"]).status_code == 404
    assert outro.client.get(f'/api/chamados/{c["id"]}').status_code == 404
    radar = coop.client.get("/api/chamados?visao=radar").json["dados"]
    assert len(radar) == 1 and "endereco" not in radar[0] and "morador_id" not in radar[0]
    assert radar[0]["precisao_localizacao"] == "aproximada"
    assert radar[0]["localizacao"]["latitude"] == -22.91
    assert coop.client.get(c["foto_url"]).status_code == 200
    assert morador.post(f'/api/chamados/{c["id"]}/aceitar').status_code == 403
    aceita = coop.post(f'/api/chamados/{c["id"]}/aceitar')
    assert aceita.status_code == 200 and aceita.json["dados"]["status"] == "em_andamento"
    assert "endereco" in aceita.json["dados"]
    assert outra_coop.post(f'/api/chamados/{c["id"]}/aceitar').status_code == 409
    assert outra_coop.post(f'/api/chamados/{c["id"]}/concluir').status_code == 403
    assert outra_coop.client.get(c["foto_url"]).status_code == 404
    assert coop.client.get("/api/chamados?visao=radar").json["dados"] == []
    concluida = coop.post(f'/api/chamados/{c["id"]}/concluir')
    assert concluida.status_code == 200 and concluida.json["dados"]["concluido_em"]
    assert coop.post(f'/api/chamados/{c["id"]}/concluir').status_code == 409
    assert morador.client.get("/api/chamados").json["dados"][0]["status"] == "concluido"


@pytest.mark.parametrize(
    "extra", ["peso_kg", "data_preferida", "observacoes", "morador_id", "status"]
)
def test_campos_sem_coluna_ou_controlados_pelo_servidor_sao_rejeitados(app, banco, extra):
    a = conta(app, "m@example.com")
    dados = dados_chamado()
    dados[extra] = "teste"
    res = criar(a, dados)
    assert res.status_code == 422 and extra in res.json["erro"]["campos"]
    assert not banco.chamados and not banco.enderecos


def test_endereco_extra_nao_e_descartado(app):
    a = conta(app, "m@example.com")
    dados = dados_chamado()
    dados["endereco"]["bairro"] = "Centro"
    assert criar(a, dados).status_code == 422


@pytest.mark.parametrize("lat,lng", [(91, 0), (0, 181), (True, 0), ("-22", -47), (float("nan"), 0)])
def test_coordenadas_invalidas(lat, lng):
    dados = dados_chamado()
    dados["localizacao"] = {"latitude": lat, "longitude": lng}
    with pytest.raises(ErroNegocio):
        validacao.chamado(dados)


def test_foto_invalida_tamanho_e_categoria(app, banco, config):
    a = conta(app, "m@example.com")
    assert criar(a, conteudo=b"nao sou imagem").status_code == 422
    assert criar(a, conteudo=b"x" * (5 * 1024 * 1024 + 1)).status_code == 413
    dados = dados_chamado()
    dados["categoria_id"] = 999
    assert criar(a, dados).status_code == 422
    assert not list(config.pasta_fotos.glob("*.jpg"))
    assert not banco.enderecos and not banco.chamados


def test_transacao_desfaz_aceite_se_persistencia_falhar(app, banco, monkeypatch):
    m = conta(app, "m@example.com")
    c = conta(app, "c@example.com", "cooperativa")
    id = criar(m).json["dados"]["id"]

    def falhar(*args):
        raise RuntimeError("erro simulado")

    monkeypatch.setattr(ColetasMemoria, "inserir", falhar)
    assert c.post(f"/api/chamados/{id}/aceitar").status_code == 500
    assert banco.chamados[int(id)].situacao == Situacao.PENDENTE
    assert banco.chamados[int(id)].coleta is None


def test_aceites_em_paralelo_no_contrato_de_transacao(app):
    m = conta(app, "m@example.com")
    cooperativas = [conta(app, f"coop{i}@example.com", "cooperativa") for i in range(2)]
    id = criar(m).json["dados"]["id"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        resultados = list(
            pool.map(lambda c: c.post(f"/api/chamados/{id}/aceitar").status_code, cooperativas)
        )
    assert sorted(resultados) == [200, 409]


def test_erros_json_e_cors(app):
    a = Acesso(app)
    res = a.post("/api/auth/login", data="{invalido", content_type="application/json")
    assert res.status_code == 400 and "erro" in res.json
    assert a.client.get("/api/inexistente").status_code == 404
    res = a.client.get("/api/categorias", headers={"Origin": "http://localhost:5000"})
    assert res.headers["Access-Control-Allow-Origin"] == "http://localhost:5000"
    assert res.headers["Cache-Control"] == "no-store"
    assert a.client.get("/api/saude").status_code == 200


def test_morador_nao_acessa_radar_coop_nao_cria_pedido(app):
    m = conta(app, "m@example.com")
    c = conta(app, "c@example.com", "cooperativa")
    assert m.client.get("/api/chamados?visao=radar").status_code == 403
    assert criar(c).status_code == 403


def test_perfil_real_vem_do_banco(app, banco):
    a = conta(app, "cooperativa-no-email@example.com")
    assert a.client.get("/api/auth/me").json["dados"]["tipo"] == "morador"
    banco.usuarios[1]["perfil"] = "Administrador"
    assert a.client.get("/api/auth/me").status_code == 403
