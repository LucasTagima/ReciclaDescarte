# Validação da integração de coletas

Data: 26/10/2026. Base: a cópia `ReciclaDescarte-main.zip` enviada pelo grupo.

## Resultados executados

| Verificação | Resultado | Finalidade e limite |
|---|---|---|
| JavaScript, Node 24 | 11 testes aprovados | Modelo sem peso, busca por rua/identificador, datas ausentes, ordenação, preferências antigas, referência da foto, multipart, CSRF, cookies, ações e falhas. Os testes de requisição usam respostas controladas. |
| Python, pytest | 30 aprovados e 5 ignorados | Testes existentes da API e dois novos testes de upload. Usam repositórios em memória. Os cinco testes ignorados exigem MySQL de teste separado e não foram executados. |
| Navegador Chromium 153 | 9 cenários aprovados, sem erros JavaScript | Páginas reais conversando por HTTP com a API Flask real, em portas diferentes. O acesso ao banco foi substituído pelos repositórios de teste em memória. |

Os nove cenários de navegador cobrem:

1. Cadastro e login pelos formulários, com cookies e CSRF reais.
2. Criação de solicitação com categoria de identificador 17, foto, localização simulada e número opcional, sem campos extras rejeitados pela API.
3. Foto carregada no endereço da API e recusa da mesma foto sem autenticação.
4. Radar com localização aproximada, endereço reservado e liberação ao responsável depois do aceite.
5. Recusa de um segundo aceite, com erro visível e sem indicar sucesso.
6. Conclusão da coleta, link com as coordenadas exatas para o responsável, bloqueio de acesso de outra cooperativa e atualização dos indicadores do morador.
7. Coordenadas manuais, falha HTTP 503 simulada no envio, preservação dos campos, novo envio e busca pelo endereço.
8. Demonstração separada da API, com criação, aceite e conclusão usando dados fictícios locais.
9. Formulário sem rolagem horizontal nas larguras simuladas de 320, 390 e 1280 pixels.

Os mapas externos foram substituídos por uma página de teste e a localização foi controlada pelo navegador automatizado. Isso não comprova funcionamento de GPS físico, disponibilidade do OpenStreetMap ou navegação real no Google Maps. As larguras simuladas não equivalem a testes em aparelhos físicos.

## Falhas encontradas e correções

- O formulário enviava campos que o banco não armazena e a API rejeitava o JSON. Esses campos saíram da tela e do envio.
- O modelo JS exigia peso em toda resposta, impedindo a leitura dos chamados reais. A exigência foi removida.
- As referências `/api/fotos/...` eram resolvidas na porta das páginas. Agora usam o servidor configurado para a API e a consulta protegida envia credenciais.
- Datas nulas podiam ser apresentadas como datas de 1970. Agora são identificadas como não informadas.
- Ao terminar a digitação das coordenadas, a mudança de altura do mapa deslocava o checkbox durante o clique. A área do mapa tem altura mínima estável; editar o endereço ou o ponto exige uma nova confirmação.
- Uma imagem PNG válida de cerca de 480 KB era recusada com HTTP 413 pelo limite de memória do parser multipart. O limite passou de 64 para 128 KB, preservando o limite de 5 MB da foto e de 6 MB da requisição. Os novos testes verificam uma imagem aceita acima do tamanho do buffer e a recusa de um arquivo maior que 5 MB, sem criar chamado nem deixar foto salva nesse caso.

## Reprodução opcional

Para usar a aplicação, basta seguir `LEIA-ME-COLETAS.md`. Os testes abaixo são recursos de desenvolvimento e não são necessários para executar a API normalmente.

No Windows, na raiz do projeto, para os testes Python:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

Para os testes de JavaScript, com Node 22.7 ou superior:

```powershell
node --test tests_frontend/coletas.test.mjs
```

O teste de navegador é `tests_frontend/fluxo-coletas.mjs`. Ele requer Playwright com Chromium instalado, além das dependências Python de desenvolvimento. O script inicia `tests_frontend/servidor_teste.py`, que cria uma API isolada em portas temporárias, sem ler o `.env` e sem acessar seu MySQL. Não use esse servidor de teste para executar a aplicação real; a inicialização normal continua sendo `executar.py`.

## Conferência que permanece no computador do grupo

O grupo já confirmou o cadastro e o login reais na sessão de configuração. A criação, o aceite e a conclusão desta atualização ainda precisam ser executados nas páginas ligadas ao MySQL do grupo. Use a consulta em `INTEGRACAO_COLETAS.md` e registre o identificador do pedido, as mudanças de situação e as datas no banco.

Este relatório descreve os testes executados no ambiente de preparação. Não os apresente no PI como se fossem testes de persistência de coletas no banco real, testes com usuários externos ou testes de carga.
