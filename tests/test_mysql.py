"""Integração opcional. Nunca usa automaticamente o banco configurado no .env.

Exige um esquema de teste já preparado e separado, com a mesma estrutura.
Não há criação ou alteração de tabelas neste arquivo.
"""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from threading import Barrier
import os
import secrets
import pytest
from conftest import Acesso
from test_api import criar, dados_chamado
from recicladescarte import criar_app
from recicladescarte.banco import BancoMySQL

pytestmark = pytest.mark.mysql


@pytest.fixture
def real(config):
    nome = os.getenv("TEST_MYSQL_DATABASE", "")
    if not nome:
        pytest.skip("Defina um banco de teste dedicado para executar a integração MySQL.")
    if not nome.startswith("rd_teste_") or nome == os.getenv("MYSQL_DATABASE"):
        pytest.fail("Use TEST_MYSQL_DATABASE separado, com prefixo rd_teste_.")
    c = replace(
        config,
        banco_nome=nome,
        banco_usuario=os.getenv("TEST_MYSQL_USER", "root"),
        banco_senha=os.getenv("TEST_MYSQL_PASSWORD", ""),
        banco_host=os.getenv("TEST_MYSQL_HOST", "127.0.0.1"),
        banco_porta=int(os.getenv("TEST_MYSQL_PORT", "3306")),
        banco_socket=os.getenv("TEST_MYSQL_SOCKET") or None,
    )
    b = BancoMySQL(c)
    b.verificar()
    prefixo = secrets.token_hex(12)
    with b.transacao() as r:
        categoria_id, _ = r.categorias.executar(
            "INSERT INTO categoria(nome,perigo,instrucoes) VALUES (%s,%s,%s)",
            ("Teste " + prefixo, "Atenção", "Registro de teste."),
        )
    app = criar_app(c, b)
    yield app, b, categoria_id, prefixo
    # A limpeza alcança somente registros criados por esta fixture, no esquema de teste.
    with b.transacao() as r:
        r.chamados.executar(
            "DELETE FROM coleta WHERE chamado_id IN (SELECT id FROM chamado WHERE categoria_id=%s)",
            (categoria_id,),
        )
        r.chamados.executar("DELETE FROM chamado WHERE categoria_id=%s", (categoria_id,))
        r.enderecos.executar(
            "DELETE FROM endereco WHERE usuario_id IN (SELECT id FROM usuario WHERE email LIKE %s)",
            (prefixo + "%@teste.invalid",),
        )
        r.usuarios.executar(
            "DELETE FROM usuario WHERE email LIKE %s", (prefixo + "%@teste.invalid",)
        )
        r.categorias.executar("DELETE FROM categoria WHERE id=%s", (categoria_id,))


def novo(app, prefixo, papel, indice=0):
    a = Acesso(app)
    email = f"{prefixo}{papel}{indice}@teste.invalid"
    assert a.cadastrar(email, papel).status_code == 201
    assert a.entrar(email).status_code == 200
    return a


def pedir(morador, categoria):
    dados = dados_chamado()
    dados["categoria_id"] = categoria
    res = criar(morador, dados)
    assert res.status_code == 201, res.json
    return res.json["dados"]


def test_mysql_fluxo_persistente_e_hash(real):
    app, b, categoria, prefixo = real
    m = novo(app, prefixo, "morador")
    coop = novo(app, prefixo, "cooperativa")
    c = pedir(m, categoria)
    assert coop.post(f'/api/chamados/{c["id"]}/aceitar').status_code == 200
    assert coop.post(f'/api/chamados/{c["id"]}/concluir').status_code == 200
    with b.transacao() as r:
        row = r.usuarios.por_email(prefixo + "morador0@teste.invalid")
        assert row["senha"].startswith("scrypt:") and len(row["senha"]) <= 255
        salvo = r.chamados.buscar(int(c["id"]))
        assert salvo.situacao.value == "concluido" and salvo.coleta.concluido_em
        assert salvo.endereco.rua == "Rua de teste"
        assert (
            r.coletas.um("SELECT COUNT(*) AS n FROM coleta WHERE chamado_id=%s", (c["id"],))["n"]
            == 1
        )
    # Novo objeto de aplicação, mesmas tabelas: conta e chamado continuam persistidos.
    nova = criar_app(app.extensions["usuarios"].config, b)
    a = Acesso(nova)
    assert a.entrar(prefixo + "morador0@teste.invalid").status_code == 200
    assert a.client.get(f'/api/chamados/{c["id"]}').json["dados"]["status"] == "concluido"


def test_mysql_dois_aceites_reais_sem_unique_novo(real):
    app, b, categoria, prefixo = real
    m = novo(app, prefixo, "morador")
    cooperativas = [novo(app, prefixo, "cooperativa", i) for i in range(2)]
    c = pedir(m, categoria)
    barreira = Barrier(2)

    def aceitar(a):
        barreira.wait(timeout=5)
        return a.post(f'/api/chamados/{c["id"]}/aceitar').status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        status = list(pool.map(aceitar, cooperativas))
    assert sorted(status) == [200, 409]
    with b.transacao() as r:
        assert (
            r.coletas.um("SELECT COUNT(*) AS n FROM coleta WHERE chamado_id=%s", (c["id"],))["n"]
            == 1
        )


def test_mysql_rollback_e_foto_removida(real, monkeypatch):
    from recicladescarte.banco import Chamados

    app, b, categoria, prefixo = real
    m = novo(app, prefixo, "morador")
    with b.transacao() as r:
        antes = r.enderecos.um("SELECT COUNT(*) AS n FROM endereco")["n"]

    def falhar(*args, **kwargs):
        raise RuntimeError("falha simulada após criar endereço")

    monkeypatch.setattr(Chamados, "inserir", falhar)
    dados = dados_chamado()
    dados["categoria_id"] = categoria
    assert criar(m, dados).status_code == 500
    with b.transacao() as r:
        assert r.enderecos.um("SELECT COUNT(*) AS n FROM endereco")["n"] == antes
    assert list(app.extensions["coletas"].config.pasta_fotos.glob("*.jpg")) == []


def test_mysql_senha_duplicada_e_injecao_sql(real):
    app, b, categoria, prefixo = real
    m = novo(app, prefixo, "morador")
    assert m.cadastrar(prefixo + "morador0@teste.invalid").status_code == 409
    assert m.entrar("x'or'1'='1@example.com").status_code == 401
    dados = dados_chamado()
    dados["categoria_id"] = categoria
    dados["endereco"]["logradouro"] = "Rua '); DELETE FROM usuario; --"
    res = criar(m, dados)
    assert res.status_code == 201
    with b.transacao() as r:
        assert r.usuarios.por_email(prefixo + "morador0@teste.invalid")
        assert (
            r.chamados.buscar(int(res.json["dados"]["id"])).endereco.rua
            == dados["endereco"]["logradouro"]
        )


def test_mysql_esquema_nao_muda(real):
    app, b, categoria, prefixo = real
    with b.transacao() as r:
        antes = {
            t: r.usuarios.um("SHOW CREATE TABLE `" + t + "`")["Create Table"]
            for t in ("usuario", "endereco", "categoria", "chamado", "coleta")
        }
    m = novo(app, prefixo, "morador")
    c = pedir(m, categoria)
    with b.transacao() as r:
        depois = {t: r.usuarios.um("SHOW CREATE TABLE `" + t + "`")["Create Table"] for t in antes}
    import re

    # AUTO_INCREMENT muda com INSERT, mas não é uma mudança de definição de colunas/índices.
    limpar = lambda v: re.sub(r" AUTO_INCREMENT=\d+", "", v)
    assert {t: limpar(v) for t, v in antes.items()} == {t: limpar(v) for t, v in depois.items()}
