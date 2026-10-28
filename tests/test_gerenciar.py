import sys
import pytest
import gerenciar


def preparar(monkeypatch, config, banco, senhas, email="morador@example.com"):
    monkeypatch.setattr(gerenciar.Configuracao, "ambiente", staticmethod(lambda: config))
    monkeypatch.setattr(gerenciar, "BancoMySQL", lambda _: banco)
    respostas = iter(senhas)
    monkeypatch.setattr(gerenciar.getpass, "getpass", lambda _: next(respostas))
    monkeypatch.setattr(sys, "argv", ["gerenciar.py", "redefinir-senha", "--email", email])


def test_redefinicao_local_altera_so_a_senha_e_permite_login(
    acesso, banco, config, monkeypatch, capsys
):
    assert acesso.cadastrar().status_code == 201
    usuario = banco.usuarios[1].copy()
    nova = "  Outra senha de teste 456  "
    preparar(monkeypatch, config, banco, (nova, nova))
    gerenciar.main()
    assert {k: v for k, v in banco.usuarios[1].items() if k != "senha"} == {
        k: v for k, v in usuario.items() if k != "senha"
    }
    assert banco.usuarios[1]["senha"].startswith("scrypt:")
    assert len(banco.usuarios[1]["senha"]) <= 255
    assert nova not in capsys.readouterr().out
    assert acesso.entrar().status_code == 401
    assert acesso.entrar(senha=nova).status_code == 200


@pytest.mark.parametrize(
    "email,confirmacao",
    [
        ("morador@example.com", "senha diferente"),
        ("inexistente@example.com", "Nova senha 456"),
    ],
)
def test_redefinicao_nao_altera_conta_em_erro(
    acesso, banco, config, monkeypatch, email, confirmacao
):
    assert acesso.cadastrar().status_code == 201
    hash_anterior = banco.usuarios[1]["senha"]
    preparar(monkeypatch, config, banco, ("Nova senha 456", confirmacao), email)
    with pytest.raises(SystemExit) as erro:
        gerenciar.main()
    assert erro.value.code == 2
    assert banco.usuarios[1]["senha"] == hash_anterior
