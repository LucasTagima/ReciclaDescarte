"""Comandos locais explícitos. Não cria tabelas, não altera o esquema e não semeia dados ao iniciar."""

import argparse
import getpass
from recicladescarte.configuracao import Configuracao
from recicladescarte.banco import BancoMySQL
from recicladescarte.validacao import texto
from recicladescarte.validacao import email as validar_email
from recicladescarte.seguranca import Senhas


def main():
    parser = argparse.ArgumentParser(
        description="Conferência e manutenção local do ReciclaDescarte"
    )
    sub = parser.add_subparsers(dest="comando", required=True)
    sub.add_parser("verificar-banco", help="Somente leitura: confere as cinco tabelas e o InnoDB")
    cat = sub.add_parser(
        "adicionar-categoria", help="Insere um material na tabela categoria existente"
    )
    cat.add_argument("--nome", required=True)
    cat.add_argument("--perigo", default="")
    cat.add_argument("--instrucoes", default="")
    redefinir = sub.add_parser(
        "redefinir-senha", help="Troca explicitamente a senha de uma conta existente"
    )
    redefinir.add_argument("--email", required=True)
    args = parser.parse_args()
    banco = BancoMySQL(Configuracao.ambiente())
    banco.verificar()
    if args.comando == "verificar-banco":
        print("Conexão e estrutura compatíveis. Nenhum registro ou tabela foi alterado.")
    elif args.comando == "adicionar-categoria":
        nome = texto(args.nome, "nome", 1, 100)
        perigo = texto(args.perigo, "perigo", 0, 50) or None
        instrucoes = texto(args.instrucoes, "instrucoes", 0, 5000) or None
        with banco.transacao() as repos:
            if repos.categorias.um("SELECT id FROM categoria WHERE nome=%s", (nome,)):
                parser.error("Essa categoria já existe.")
            id, _ = repos.categorias.executar(
                "INSERT INTO categoria (nome,perigo,instrucoes) VALUES (%s,%s,%s)",
                (nome, perigo, instrucoes),
            )
        print(f"Categoria cadastrada com identificador {id}.")
    elif args.comando == "redefinir-senha":
        email = validar_email(args.email)
        senha = texto(getpass.getpass("Nova senha: "), "senha", 8, 128, limpar=False)
        if senha != getpass.getpass("Repita a nova senha: "):
            parser.error("As senhas não coincidem.")
        hash_senha = Senhas().gerar(senha)
        with banco.transacao() as repos:
            usuario = repos.usuarios.por_email(email)
            if not usuario:
                parser.error("Conta não encontrada.")
            repos.usuarios.atualizar_senha(usuario["id"], hash_senha)
        print(
            "Senha atualizada na coluna existente. Reinicie a API para encerrar as sessões anteriores."
        )


if __name__ == "__main__":
    main()
