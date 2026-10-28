# Contrato da API

Base local: `http://127.0.0.1:5000/api`. Os identificadores são strings nas respostas e inteiros positivos nas URLs; `categoria_id` aceita inteiro ou sua representação decimal em texto na entrada.

Respostas de sucesso usam `{"dados": ...}`. A exceção é o logout, com `204` e corpo vazio. Os erros seguem este formato:

```json
{
    "erro": {
        "mensagem": "Preencha os campos obrigatórios.",
        "campos": {"email": "Campo obrigatório."}
    }
}
```

`campos` só aparece quando há erros associados a campos específicos. As mensagens são em português; o cliente deve decidir seu fluxo pelos códigos HTTP, sem depender do texto literal da mensagem.

## Autenticação, cookie e CSRF

1. Faça `GET /auth/csrf` e preserve o cookie recebido.
2. Leia `dados.csrf_token` da resposta.
3. Envie esse valor em `X-CSRF-Token` nas operações `POST`.
4. Após o login, o cookie e o CSRF são trocados. Faça outro `GET /auth/csrf` antes da próxima escrita.
5. Envie o cookie também nas consultas protegidas. No navegador, use `credentials: "include"`.

O JWT é transportado somente pelo cookie `rd_sessao`, com `HttpOnly`, `SameSite=Lax` e caminho `/api`. A API não recebe o token por `Authorization: Bearer` e não o devolve no JSON. O cliente não precisa salvar JWT em `localStorage`.

A sessão anônima dura 20 minutos; a autenticada dura duas horas por padrão. Não há renovação automática nem refresh token. Quando expirar, o cliente deve iniciar o fluxo de acesso novamente. O logout revoga a sessão no servidor, inclusive para quem guardou uma cópia do cookie anterior.

## Rotas disponíveis

| Método | Caminho | Acesso | Retorno normal |
| --- | --- | --- | --- |
| GET | `/saude` | Público | 200; conexão e estrutura disponíveis. |
| GET | `/auth/csrf` | Público, com cookie de sessão | 200; token CSRF. |
| POST | `/auth/cadastro` | Sessão anônima ou autenticada + CSRF | 201; identificador da conta. |
| POST | `/auth/login` | Sessão + CSRF | 200; dados da conta e novo cookie. |
| GET | `/auth/me` | Autenticado | 200; conta atual. |
| POST | `/auth/logout` | Autenticado + CSRF | 204; sessão revogada. |
| GET | `/categorias` | Público | 200; catálogo real do banco. |
| GET | `/chamados?visao=minhas` | Autenticado | 200; chamados do morador ou coletas da cooperativa. |
| GET | `/chamados?visao=radar` | Cooperativa | 200; chamados pendentes. |
| GET | `/chamados/{id}` | Dono, responsável ou cooperativa enquanto pendente | 200; detalhes permitidos ao perfil. |
| POST | `/chamados` | Morador + CSRF | 201; chamado criado. |
| POST | `/chamados/{id}/aceitar` | Cooperativa + CSRF | 200; chamado em andamento. |
| POST | `/chamados/{id}/concluir` | Cooperativa responsável + CSRF | 200; chamado concluído. |
| GET | `/fotos/{nome}` | Mesmo controle de acesso do chamado | 200; imagem JPEG. |

Em `/chamados`, `visao=minhas` é o padrão. Outros valores ou parâmetros desconhecidos retornam `422`. Não há paginação nesta versão; a consulta retorna todos os registros correspondentes.

## Cadastro e login

`POST /auth/cadastro`, `Content-Type: application/json`:

```json
{
    "nome": "Ana Silva",
    "email": "ana@example.com",
    "senha": "uma senha de exemplo 123",
    "telefone": "(19) 99999-1234",
    "tipo": "morador"
}
```

Nome, e-mail, senha e tipo são obrigatórios. `telefone` é opcional e é gravado sem a formatação. Os tipos permitidos no cadastro são `morador` e `cooperativa`.

A senha aceita de 8 a 128 caracteres no cadastro. Espaços fazem parte dela e são preservados. O nome admite de 2 a 255 caracteres; o e-mail, até 254. Quando preenchido, o telefone deve resultar em 10 ou 11 dígitos com DDD. O e-mail é normalizado para minúsculas.

Resposta `201`:

```json
{"dados":{"id":"7"}}
```

O cadastro não faz login automático. Em seguida, `POST /auth/login` recebe:

```json
{"email":"ana@example.com","senha":"uma senha de exemplo 123"}
```

O login e `GET /auth/me` devolvem os campos públicos da conta:

```json
{
    "dados": {
        "id": "7",
        "nome": "Ana Silva",
        "email": "ana@example.com",
        "telefone": "19999991234",
        "tipo": "morador"
    }
}
```

Senha errada e e-mail inexistente recebem a mesma resposta `401`. E-mail duplicado no cadastro retorna `409`. Há um limite separado de 10 tentativas de login e 10 de cadastro por IP a cada 15 minutos; o limite inclui chamadas que deram certo. O perfil vem da coluna `usuario.perfil`, nunca do nome ou do e-mail.

Valores antigos `Morador`, `Cooperativa`, `coletor` e `catador` são interpretados sem mudar o registro original; os três últimos representam o perfil de cooperativa. Perfis não reconhecidos recebem `403`.

`POST /auth/logout` não precisa de corpo. Depois de sair, uma chamada a `/auth/me` deve retornar `401`.

## Catálogo

`GET /categorias` retorna:

```json
{
    "dados": [
        {"id":"3","nome":"Papel","perigo":"Baixo","instrucoes":"Separe limpo e seco."}
    ]
}
```

O identificador e os textos são exemplos; o servidor retorna os valores existentes na sua tabela. `perigo` e `instrucoes` podem ser `null`.

## Criação de chamado com foto

`POST /chamados` recebe `multipart/form-data` com exatamente duas partes:

| Parte | Conteúdo |
| --- | --- |
| `dados` | Texto contendo o objeto JSON abaixo. |
| `foto` | Arquivo JPG, PNG ou WebP, de até 5 MiB. |

Conteúdo da parte `dados`:

```json
{
    "categoria_id": "3",
    "endereco": {"logradouro": "Rua das Flores", "numero": "120"},
    "localizacao": {"latitude": -22.9056, "longitude": -47.0608}
}
```

`logradouro`, categoria e coordenadas são obrigatórios. `numero` é opcional e deve ser texto quando enviado. Latitude deve estar entre -90 e 90; longitude, entre -180 e 180. Coordenadas precisam ser números JSON finitos. São gravadas com até oito casas decimais, conforme as colunas existentes.

O dono e o estado inicial são definidos pelo servidor. Não envie `morador_id`, `usuario_id`, `status` ou datas de criação. Também não envie campos inexistentes no banco, como `peso_kg`, `data_preferida`, `observacoes`, `bairro`, `complemento`, `cidade`, `uf` ou `cep`.

As imagens são decodificadas e regravadas em JPEG com nome aleatório. São aceitas até 20 milhões de pixels e a dimensão final é limitada a 4096 pixels em cada lado, preservando a proporção. Metadados do arquivo de origem não são repassados. O limite total da requisição é 6 MiB.

No Postman, escolha `Body → form-data`: `dados` como `Text`, `foto` como `File`; acrescente `X-CSRF-Token`. Não defina manualmente o boundary do `Content-Type`; o cliente de envio deve gerá-lo. Preserve os cookies entre a consulta do CSRF, o login e o envio da foto.

Resposta `201`, também usada nas consultas e atualizações do chamado:

```json
{
    "dados": {
        "id": "12",
        "categoria": {"id":"3","nome":"Papel","perigo":"Baixo","instrucoes":"Separe limpo e seco."},
        "status": "pendente",
        "criado_em": "2026-10-25T15:00:00Z",
        "localizacao": {"latitude":-22.9056,"longitude":-47.0608},
        "precisao_localizacao": "exata",
        "foto_url": "/api/fotos/0123456789abcdef0123456789abcdef0123456789abcdef.jpg",
        "cooperativa_id": null,
        "cooperativa_nome": null,
        "aceito_em": null,
        "concluido_em": null,
        "distancia_km": null,
        "morador_id": "7",
        "endereco": {"id":"9","logradouro":"Rua das Flores","numero":"120"}
    }
}
```

O caminho da foto é relativo ao servidor da API. Ele requer o cookie de autenticação. Valores antigos de `foto_url` que não sejam referências locais desta API não são convertidos em fotos acessíveis.

Se uma conexão cair durante a confirmação de um chamado, consulte o histórico antes de repetir o envio: uma resposta de falha de conexão não prova que o MySQL deixou de confirmar a operação. Não há chave de idempotência para criação nesta versão.

## Radar, aceite e conclusão

Antes do aceite, as cooperativas veem a categoria, a foto e coordenadas arredondadas para duas casas decimais. O endereço completo e o identificador do morador são omitidos. `precisao_localizacao` será `aproximada`; essas coordenadas não devem ser usadas como destino exato de navegação.

O morador dono sempre pode consultar seu chamado. Depois do aceite, a cooperativa responsável recebe o endereço e as coordenadas exatas. As outras cooperativas deixam de ter acesso àquele chamado e à foto; moradores não veem os chamados de outras contas. A foto em si pode conter informações do ambiente fotografado.

Para aceitar: `POST /chamados/12/aceitar`, com cookie, CSRF e sem corpo. O estado muda de `pendente` para `em_andamento`; a API cria `coleta` e registra o responsável e o instante do aceite.

Para concluir: `POST /chamados/12/concluir`, também sem corpo. Somente a responsável pode fazê-lo. O estado muda para `concluido` e `concluido_em` é preenchido.

Se duas cooperativas tentarem aceitar o mesmo chamado, a primeira transação válida vence; a outra recebe `409`. A proteção usa bloqueio de linha do InnoDB nas operações desta API, sem acrescentar `UNIQUE` a `coleta.chamado_id`. Escritas feitas diretamente por outros sistemas precisam respeitar o mesmo protocolo para ter essa garantia.

Não há cancelamento, exclusão ou reabertura neste contrato. Esses estados não foram acrescentados ao fluxo existente.

## Códigos de resposta

| Código | Significado |
| --- | --- |
| 200 / 201 / 204 | Consulta ou alteração concluída. |
| 400 | JSON ou formato da requisição inválido. |
| 401 | Credenciais inválidas ou sessão ausente/expirada. |
| 403 | Perfil sem permissão, origem recusada ou CSRF inválido. |
| 404 | Recurso inexistente ou fora do acesso daquele usuário. |
| 405 | Método HTTP não permitido. |
| 409 | E-mail duplicado, coleta já assumida, transição inválida ou conflito de concorrência. |
| 413 | Arquivo ou requisição acima do limite. |
| 415 | Tipo de conteúdo não aceito. |
| 422 | Campos inválidos, ausentes ou não previstos. |
| 429 | Limite de tentativas alcançado; `Retry-After: 900`. |
| 500 | Falha interna, sem exposição de detalhes. |
| 503 | Banco, armazenamento ou serviço indisponível. |

O cabeçalho `X-Requisicao-Id` permite relacionar uma falha à entrada correspondente no log do servidor. As respostas não expõem SQL, hash de senha ou credenciais do banco.
