"""Regressão do upload multipart com imagens maiores que o buffer de leitura."""

from io import BytesIO
import json
import random

from PIL import Image
from conftest import Acesso


def foto_png():
    dados = random.Random(2026).randbytes(400 * 400 * 3)
    arquivo = BytesIO()
    Image.frombytes("RGB", (400, 400), dados).save(arquivo, "PNG")
    return arquivo.getvalue()


def enviar(acesso, imagem):
    dados = {
        "categoria_id": "1",
        "endereco": {"logradouro": "Rua de teste", "numero": ""},
        "localizacao": {"latitude": -22.9056, "longitude": -47.0608},
    }
    return acesso.post(
        "/api/chamados",
        data={"dados": json.dumps(dados), "foto": (BytesIO(imagem), "material.png")},
        content_type="multipart/form-data",
    )


def test_foto_valida_maior_que_buffer_multipart(app, banco):
    acesso = Acesso(app)
    assert acesso.cadastrar().status_code == 201
    assert acesso.entrar().status_code == 200
    imagem = foto_png()
    assert 128 * 1024 < len(imagem) < 5 * 1024 * 1024
    resposta = enviar(acesso, imagem)
    assert resposta.status_code == 201
    assert len(banco.chamados) == 1
    foto = acesso.client.get(resposta.json["dados"]["foto_url"])
    assert foto.status_code == 200
    assert foto.mimetype == "image/jpeg"


def test_foto_acima_de_cinco_mebibytes_continua_recusada(app, banco, config):
    acesso = Acesso(app)
    assert acesso.cadastrar().status_code == 201
    assert acesso.entrar().status_code == 200
    imagem = foto_png()
    imagem += b"\0" * (5 * 1024 * 1024 + 1 - len(imagem))
    resposta = enviar(acesso, imagem)
    assert resposta.status_code == 413
    assert banco.chamados == {}
    assert not list(config.pasta_fotos.glob("*.jpg"))
