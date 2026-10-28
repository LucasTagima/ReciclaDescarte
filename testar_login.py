"""Cliente de terminal para exercitar o login real, sem modificar o front-end."""

import argparse
import getpass
import http.cookiejar
import json
from urllib.error import HTTPError
from urllib.request import build_opener, HTTPCookieProcessor, Request


def main():
    parser = argparse.ArgumentParser(
        description="Testa cadastro opcional, login, perfil e logout da API"
    )
    parser.add_argument("--url", default="http://127.0.0.1:5000")
    parser.add_argument("--email", required=True)
    parser.add_argument("--cadastrar", action="store_true")
    parser.add_argument("--nome", default="Pessoa de teste")
    parser.add_argument("--perfil", choices=["morador", "cooperativa"], default="morador")
    args = parser.parse_args()
    senha = getpass.getpass("Senha (não aparece enquanto você digita): ")
    cliente = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
    base = args.url.rstrip("/") + "/api"

    def chamar(caminho, metodo="GET", dados=None, csrf=None):
        headers = {"Accept": "application/json"}
        if dados is not None:
            headers["Content-Type"] = "application/json"
        if csrf:
            headers["X-CSRF-Token"] = csrf
        req = Request(
            base + caminho,
            method=metodo,
            headers=headers,
            data=json.dumps(dados).encode() if dados is not None else None,
        )
        try:
            res = cliente.open(req, timeout=20)
        except HTTPError as erro:
            res = erro
        with res:
            corpo = res.read()
            return res.status, json.loads(corpo) if corpo else None

    def esperado(caminho, status, **kwargs):
        atual, corpo = chamar(caminho, **kwargs)
        if atual != status:
            mensagem = (
                corpo.get("erro", {}).get("mensagem", "Resposta inesperada")
                if corpo
                else "Resposta vazia"
            )
            raise SystemExit(f"Falha em {caminho}: HTTP {atual}. {mensagem}")
        print(f"OK HTTP {status}: {caminho}")
        return corpo

    csrf = esperado("/auth/csrf", 200)["dados"]["csrf_token"]
    if args.cadastrar:
        esperado(
            "/auth/cadastro",
            201,
            metodo="POST",
            csrf=csrf,
            dados={"nome": args.nome, "email": args.email, "senha": senha, "tipo": args.perfil},
        )
    esperado(
        "/auth/login", 200, metodo="POST", csrf=csrf, dados={"email": args.email, "senha": senha}
    )
    csrf = esperado("/auth/csrf", 200)["dados"]["csrf_token"]
    perfil = esperado("/auth/me", 200)["dados"]
    print(f'Usuário autenticado: {perfil["nome"]} / perfil {perfil["tipo"]}')
    esperado("/auth/logout", 204, metodo="POST", csrf=csrf)
    esperado("/auth/me", 401)
    print("Fluxo de acesso concluído. A conta criada permanece no banco; a sessão foi encerrada.")


if __name__ == "__main__":
    main()
