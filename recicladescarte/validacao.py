import math
import re
from .dominio import ErroNegocio


def objeto(dados, permitidos, obrigatorios=()):
    if not isinstance(dados, dict):
        raise ErroNegocio("Envie um objeto JSON.", 400)
    extras = set(dados) - set(permitidos)
    faltas = set(obrigatorios) - set(dados)
    if extras:
        raise ErroNegocio(
            "Campos não aceitos por esta versão: " + ", ".join(sorted(extras)),
            422,
            {c: "Este campo não faz parte deste contrato." for c in sorted(extras)},
        )
    if faltas:
        raise ErroNegocio(
            "Preencha os campos obrigatórios.",
            422,
            {c: "Campo obrigatório." for c in sorted(faltas)},
        )
    return dados


def texto(valor, campo, minimo, maximo, limpar=True):
    if not isinstance(valor, str):
        raise ErroNegocio("Confira os dados informados.", campos={campo: "Informe um texto."})
    valor = valor.strip() if limpar else valor
    if not minimo <= len(valor) <= maximo or "\x00" in valor:
        raise ErroNegocio(
            "Confira os dados informados.",
            campos={campo: f"Use de {minimo} a {maximo} caracteres."},
        )
    return valor


def email(valor):
    valor = texto(valor, "email", 3, 254).casefold()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", valor):
        raise ErroNegocio("Informe um e-mail válido.", campos={"email": "E-mail inválido."})
    return valor


def cadastro(dados):
    objeto(
        dados, {"nome", "email", "senha", "telefone", "tipo"}, {"nome", "email", "senha", "tipo"}
    )
    tipo = dados["tipo"]
    if tipo not in ("morador", "cooperativa"):
        raise ErroNegocio("Escolha morador ou cooperativa.", campos={"tipo": "Perfil inválido."})
    telefone = dados.get("telefone")
    if telefone is not None:
        telefone = re.sub(r"\D", "", texto(telefone, "telefone", 0, 20))
        if telefone and len(telefone) not in (10, 11):
            raise ErroNegocio(
                "Informe telefone com DDD.", campos={"telefone": "Use 10 ou 11 dígitos."}
            )
    return {
        "nome": texto(dados["nome"], "nome", 2, 255),
        "email": email(dados["email"]),
        "senha": texto(dados["senha"], "senha", 8, 128, limpar=False),
        "telefone": telefone or None,
        "tipo": tipo,
    }


def login(dados):
    objeto(dados, {"email", "senha"}, {"email", "senha"})
    return email(dados["email"]), texto(dados["senha"], "senha", 1, 128, limpar=False)


def id_positivo(valor, campo="id"):
    if isinstance(valor, bool) or not re.fullmatch(r"[1-9][0-9]{0,9}", str(valor)):
        raise ErroNegocio("Identificador inválido.", campos={campo: "Informe um inteiro positivo."})
    id = int(valor)
    if id > 2147483647:
        raise ErroNegocio("Identificador inválido.", campos={campo: "Valor fora do limite."})
    return id


def chamado(dados):
    objeto(
        dados,
        {"categoria_id", "endereco", "localizacao"},
        {"categoria_id", "endereco", "localizacao"},
    )
    endereco = objeto(dados["endereco"], {"logradouro", "numero"}, {"logradouro"})
    ponto = objeto(dados["localizacao"], {"latitude", "longitude"}, {"latitude", "longitude"})
    coords = {}
    for chave, limite in [("latitude", 90), ("longitude", 180)]:
        valor = ponto[chave]
        if (
            isinstance(valor, bool)
            or not isinstance(valor, (int, float))
            or not math.isfinite(valor)
            or abs(valor) > limite
        ):
            raise ErroNegocio(
                "Informe coordenadas válidas.", campos={chave: "Coordenada inválida."}
            )
        coords[chave] = round(float(valor), 8)
    numero = endereco.get("numero")
    if numero is not None:
        numero = texto(numero, "numero", 0, 100) or None
    return {
        "categoria_id": id_positivo(dados["categoria_id"], "categoria_id"),
        "endereco": {
            "logradouro": texto(endereco["logradouro"], "logradouro", 1, 255),
            "numero": numero,
        },
        "localizacao": coords,
    }
