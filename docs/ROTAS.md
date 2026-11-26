# Contrato da API

Base local: `http://127.0.0.1:5000/api`. Os caminhos deste guia são relativos a essa base. Use identificadores inteiros positivos nos caminhos; no JSON de resposta, os IDs vêm como texto.

Respostas JSON de sucesso têm o formato `{"dados": ...}`. O logout retorna `204` sem corpo, e a rota de foto entrega uma imagem. Os erros têm o formato:

```json
{
    "erro": {
        "mensagem": "Preencha os campos obrigatórios.",
        "campos": {"email": "Campo obrigatório."}
    }
}
```

`campos` aparece quando o erro se refere a campos específicos. Use o código HTTP para tratar a resposta no cliente.

## Autenticação e CSRF

1. Faça `GET /auth/csrf`, preserve o cookie da sessão e leia `dados.csrf_token`.
2. Nas requisições `POST`, inclusive cadastro e login, mantenha o cookie e envie o token no cabeçalho `X-CSRF-Token`.
3. Após o login, preserve o novo cookie e consulte `GET /auth/csrf` novamente antes da próxima escrita.
4. Use o cookie nas consultas protegidas. No navegador, envie as requisições com `credentials: "include"` e use uma origem autorizada em `ORIGENS_PERMITIDAS`.

O JWT circula no cookie `rd_sessao` (`HttpOnly`, `SameSite=Lax`, caminho `/api`). A API não aceita `Authorization: Bearer` nem devolve o token no corpo da resposta. A sessão anônima dura 20 minutos; a autenticada dura duas horas por padrão. Após expiração ou logout, inicie uma nova sessão para entrar novamente.

## Rotas disponíveis

| Método | Caminho | Acesso | Resposta de sucesso |
| --- | --- | --- | --- |
| GET | `/saude` | Público | `200`; informa se a estrutura do banco está disponível. |
| GET | `/auth/csrf` | Público | `200`; cria sessão anônima se necessário e retorna o token. |
| POST | `/auth/cadastro` | Sessão e CSRF | `201`; ID da conta criada. |
| POST | `/auth/login` | Sessão e CSRF | `200`; dados da conta e novo cookie. |
| GET | `/auth/me` | Autenticado | `200`; dados da conta atual. |
| POST | `/auth/logout` | Autenticado e CSRF | `204`; sessão encerrada. |
| GET | `/categorias` | Público | `200`; categorias cadastradas no MySQL. |
| GET | `/chamados?visao=minhas` | Autenticado | `200`; pedidos do morador ou coletas assumidas pela cooperativa. |
| GET | `/chamados?visao=radar` | Cooperativa | `200`; pedidos pendentes. |
| GET | `/chamados/{id}` | Morador dono, cooperativa responsável ou cooperativa enquanto pendente | `200`; dados permitidos ao perfil. |
| POST | `/chamados` | Morador e CSRF | `201`; pedido criado. |
| POST | `/chamados/{id}/aceitar` | Cooperativa e CSRF | `200`; coleta em andamento. |
| POST | `/chamados/{id}/concluir` | Cooperativa responsável e CSRF | `200`; coleta concluída. |
| GET | `/fotos/{nome}` | Mesmo acesso exigido pelo chamado | `200`; imagem JPEG. |

Em `GET /chamados`, `visao=minhas` é o padrão. Valores de `visao` fora de `minhas` e `radar` ou parâmetros desconhecidos retornam `422`. A lista não usa paginação.

## Cadastro e login

Para `POST /auth/cadastro`, envie JSON:

```json
{
    "nome": "Ana Silva",
    "email": "ana@example.com",
    "senha": "uma senha de exemplo 123",
    "telefone": "(19) 99999-1234",
    "tipo": "morador"
}
```

`tipo` pode ser `morador` ou `cooperativa`. O nome aceita de 2 a 255 caracteres, o e-mail até 254 e a senha de 8 a 128. Espaços da senha são preservados e o e-mail é normalizado para minúsculas. O telefone é opcional; quando informado, deve ter 10 ou 11 dígitos com DDD. E-mail duplicado retorna `409`.

O cadastro retorna `{"dados":{"id":"7"}}` e não autentica a conta. Para entrar, envie `email` e `senha` em JSON para `POST /auth/login`. Login e `GET /auth/me` retornam `id`, `nome`, `email`, `telefone` e `tipo`. Credenciais inválidas retornam `401`. Cadastro e login têm limites separados de dez requisições por IP a cada 15 minutos.

`POST /auth/logout` não recebe corpo e revoga a sessão. Uma consulta posterior a `/auth/me` sem sessão autenticada retorna `401`.

## Categorias

`GET /categorias` consulta o banco:

```json
{"dados":[{"id":"3","nome":"Papel","perigo":"Baixo","instrucoes":"Separe limpo e seco."}]}
```

`perigo` e `instrucoes` podem ser `null`. Use o ID da categoria retornado pelo seu ambiente.

## Criação de chamado com foto

Envie `POST /chamados` como `multipart/form-data`, com exatamente duas partes: `dados` como texto JSON e `foto` como arquivo JPEG, PNG ou WebP. Envie o cabeçalho de CSRF e preserve o cookie. Ao montar o formulário, deixe o cliente gerar o `Content-Type` com seu delimitador.

Exemplo da parte `dados`:

```json
{
    "categoria_id": "3",
    "endereco": {"logradouro": "Rua das Flores", "numero": "120"},
    "localizacao": {"latitude": -22.9056, "longitude": -47.0608}
}
```

`categoria_id` aceita inteiro positivo ou a representação decimal em texto. `logradouro` e coordenadas são obrigatórios; `numero` é opcional e, quando informado, deve ser texto. Envie as coordenadas como números JSON finitos (latitude de −90 a 90; longitude de −180 a 180). A API define o morador, a situação e as datas. Campos fora do exemplo, como peso ou agendamento, não são aceitos.

A foto pode ter até 5 MiB e 20 milhões de pixels; o limite da requisição inteira é 6 MiB. O servidor grava um JPEG sem os metadados originais, com proporção preservada e até 4096 pixels por lado.

Exemplo de resposta `201`:

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

`foto_url` é um caminho relativo à origem da API e já inclui `/api`. A consulta da foto requer sessão autorizada. Se a conexão cair durante o envio, confira o histórico antes de repetir a criação: o pedido pode ter sido gravado mesmo sem resposta ao navegador.

## Radar, aceite e conclusão

Antes do aceite, a cooperativa recebe material, foto e coordenadas aproximadas (`precisao_localizacao: "aproximada"`), sem o endereço completo nem o ID do morador. Após o aceite, a cooperativa responsável recebe o endereço e as coordenadas exatas. As outras cooperativas deixam de ter acesso. O morador pode acompanhar seu próprio pedido em todas as etapas.

- `POST /chamados/12/aceitar`: muda o status de `pendente` para `em_andamento`, registra a responsável e preenche `aceito_em`. Um segundo aceite recebe `409`.
- `POST /chamados/12/concluir`: somente a cooperativa responsável pode mudar o status para `concluido` e preencher `concluido_em`.

As duas operações exigem cookie e CSRF, sem corpo. O contrato atual não oferece cancelamento, exclusão ou reabertura.

## Códigos de resposta

| Código | Significado |
| --- | --- |
| `200` / `201` / `204` | Consulta ou alteração concluída. |
| `400` | JSON malformado, partes multipart ausentes ou duplicadas, ou corpo indevido. |
| `401` | Credenciais inválidas ou sessão ausente ou expirada. |
| `403` | Perfil sem permissão, origem recusada ou CSRF inválido. |
| `404` | Recurso inexistente ou fora do acesso da conta. |
| `405` | Método HTTP não permitido. |
| `409` | E-mail duplicado, pedido já assumido, transição inválida ou conflito de concorrência. |
| `413` | Foto ou requisição acima do limite. |
| `415` | Tipo de conteúdo não aceito. |
| `422` | Dados ou parâmetros de consulta ausentes, inválidos ou não aceitos. |
| `429` | Limite de tentativas alcançado; `Retry-After: 900`. |
| `500` / `503` | Falha interna ou serviço indisponível. |

Use o cabeçalho `X-Requisicao-Id` para localizar a requisição no log da API.
