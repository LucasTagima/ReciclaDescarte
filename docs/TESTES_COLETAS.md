# Testes do fluxo de coletas

Data da execução automatizada original: **26/10/2026**.

## Resultados da execução automatizada

| Suíte | Resultado | Cobertura |
| --- | --- | --- |
| Python (pytest) | 30 aprovados; 5 não executados | Cadastro, sessão, permissões, validação, fotos e transições da coleta. |
| JavaScript (Node.js 24) | 11 aprovados | Filtros, ordenação, datas, preferências e requisições à API. |
| Navegador (Playwright com Chromium) | 9 cenários aprovados | Cadastro e login, abertura com foto, radar, aceite, segundo aceite recusado, conclusão, reenvio após falha, demonstração e responsividade. |

As suítes de Python e navegador usam a API Flask com dados em memória. No navegador, as páginas se comunicam por HTTP com a API de teste; os mapas e a localização são simulados. O formulário foi verificado nas larguras de 320, 390 e 1280 pixels. Os cinco casos que exigem um MySQL de teste separado não foram executados nessa rodada.

## Validação com MySQL

Em uma verificação manual posterior, o grupo usou o site ligado a um MySQL real. O fluxo da abertura à conclusão foi conferido com os perfis de morador e cooperativa, incluindo a gravação e a consulta dos dados pela interface. A responsividade foi verificada nas larguras avaliadas. As duas contas acompanharam o chamado em sessões separadas no mesmo computador, com tempo de resposta adequado para esse cenário.

Para repetir a conferência, siga o [guia de integração](INTEGRACAO_COLETAS.md#conferência-no-mysql) e compare o status, o responsável e as datas no banco. O uso de duas contas verifica esse fluxo; não mede o desempenho com muitos acessos simultâneos.

## Como executar os testes

Os comandos abaixo partem da raiz do projeto e usam o PowerShell. Crie a `.venv` conforme o [README](../README.md#como-executar-localmente). Use Node.js 24 para os testes JavaScript e de navegador.

### Python e JavaScript

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q -m "not mysql"
node --test tests_frontend/coletas.test.mjs
```

### Navegador

Com as dependências Python de desenvolvimento instaladas:

```powershell
npm.cmd install --no-save --package-lock=false playwright
npx.cmd playwright install chromium
node tests_frontend/fluxo-coletas.mjs
```

O teste inicia [um servidor isolado](../tests_frontend/servidor_teste.py) em portas temporárias, sem ler o `.env` nem acessar o banco configurado para a aplicação. Ele usa o Python da `.venv` por padrão. Se o ambiente virtual estiver em outro local, defina `COLETAS_PYTHON` com o caminho do executável.

### Integração opcional com MySQL

Prepare um esquema descartável com as mesmas cinco tabelas e InnoDB. O nome deve começar com `rd_teste_` e ser diferente do banco usado pela aplicação. Os testes criam registros próprios e tentam removê-los ao final; não alteram a estrutura das tabelas.

```powershell
$env:TEST_MYSQL_DATABASE = "rd_teste_recicladescarte"
$env:TEST_MYSQL_HOST = "127.0.0.1"
$env:TEST_MYSQL_PORT = "3306"
$env:TEST_MYSQL_USER = "usuario_de_teste"
$env:TEST_MYSQL_PASSWORD = "senha_de_teste"
.\.venv\Scripts\python.exe -m pytest -q -m mysql
```

Configure as variáveis `TEST_MYSQL_*` no terminal que executará o teste. Essa suíte verifica persistência, transações, dois aceites concorrentes e preservação do esquema.
