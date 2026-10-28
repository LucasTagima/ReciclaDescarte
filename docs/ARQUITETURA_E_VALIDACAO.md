# Decisões de implementação e validação

Entrega preparada em 25/10/2026. Referência de dados: as cinco tabelas mostradas nas imagens do MySQL Workbench. O pacote do front-end revisado foi usado como referência de contexto e não foi editado nem incluído neste ZIP.

## Banco preservado

A conexão utiliza o esquema informado em `MYSQL_DATABASE`, inclusive `sys` se esse for o esquema atual. Não existe inicializador automático de banco, migração, criação de tabela, alteração de coluna, mudança de chave estrangeira ou inclusão de índice.

`BancoMySQL.verificar()` lê `information_schema` para conferir as colunas necessárias e o uso de InnoDB. A ausência de algo necessário gera uma falha explícita; não dispara reparos. As transações de negócio usam `SELECT`, `INSERT` e `UPDATE` sobre as tabelas existentes.

| Tabela | Como a API utiliza |
| --- | --- |
| `usuario` | Cadastro e autenticação. `senha` recebe hash, `perfil` define o acesso. |
| `endereco` | Um endereço vinculado ao morador é gravado junto com cada novo chamado. |
| `categoria` | Consulta das categorias existentes; inclusão somente por comando local explícito. |
| `chamado` | Registro do pedido, referência de foto e situação atual. |
| `coleta` | Vínculo com a cooperativa, aceite e conclusão. |

Os estados novos são gravados como `Pendente`, `Em Andamento` e `Concluído`. O JSON apresenta `pendente`, `em_andamento` e `concluido`. A leitura normaliza maiúsculas e acentos, sem reescrever registros antigos.

Como não há restrição `UNIQUE` em `coleta.chamado_id`, todos os aceites desta API bloqueiam primeiro a mesma linha de `chamado` com `SELECT ... FOR UPDATE`. A consulta das coletas, o novo vínculo e a mudança de estado acontecem na mesma transação. Falhas desfazem a unidade de trabalho. Mais de uma coleta antiga no mesmo chamado gera `409`, sem exclusão automática de registros.

Essa proteção coordena os escritores que passam pela API. Ela não acrescenta uma garantia física de unicidade para SQL executado fora desse protocolo.

## POO aplicada

| Conceito | Aplicação concreta |
| --- | --- |
| Classes e objetos | `Usuario`, `Endereco`, `Categoria`, `Chamado` e `Coleta` representam os dados e as regras do domínio. |
| Encapsulamento de regras | `Chamado.aceitar()`, `Chamado.concluir()` e `Coleta.concluir()` validam perfil, responsável e estado antes da mudança. |
| Abstração | `Banco` é uma classe abstrata com os contratos `transacao()` e `verificar()`. |
| Herança | `BancoMySQL` implementa `Banco`; os repositórios específicos herdam a execução parametrizada de `RepositorioSQL`. |
| Polimorfismo | Os serviços recebem o contrato de banco; os testes substituem `BancoMySQL` por `BancoMemoria`, que implementa o mesmo contrato. |
| Composição | Serviços recebem banco e armazenamento; chamados contêm endereço, categoria e, quando houver, coleta. |

As entidades não dependem de Flask ou PyMySQL. Os serviços coordenam os casos de uso; os repositórios concentram a persistência. Não foi criada uma hierarquia artificial entre morador e cooperativa: os dois são contas com perfis diferentes, conforme `usuario.perfil`.

Essa organização aplica POO ao back-end. A avaliação de conformidade completa com a disciplina ainda depende dos critérios específicos do professor; a presença de classes, isoladamente, não substitui essa avaliação.

## Sessão e senha

O JWT é assinado com HS256 e validado com algoritmo, emissor e destinatário fixos e declarações obrigatórias de identidade e tempo. Não carrega senha, hash ou dados pessoais. A sessão fica registrada na memória do processo para permitir logout imediato sem criar tabela.

O cadastro utiliza scrypt pelo Werkzeug. A autenticação também reconhece hashes anteriores compatíveis com `scrypt` ou `pbkdf2:sha256` do Werkzeug. Não há comparação de senha em texto puro nem transformação automática de dados antigos. A redefinição local documentada no README é uma atualização explícita da coluna existente.

Um reinício encerra as sessões e zera os limites temporários de acesso. A aplicação foi configurada para um processo Waitress com threads. Implantar vários processos exigiria outro mecanismo compartilhado; o MySQL não foi modificado para isso.

## Fotos e privacidade

A coluna `foto_url` mantém uma referência curta, como `/api/fotos/<nome-aleatorio>.jpg`; o conteúdo fica em disco. A leitura da imagem passa pela autorização do chamado. O nome do arquivo enviado pelo usuário não é usado como caminho.

O cadastro do chamado grava endereço e chamado na mesma transação. Se houver falha antes da confirmação, o arquivo é removido quando possível. Se a conexão cair durante o `commit`, a foto é preservada porque o resultado da confirmação pode ser desconhecido; isso evita apagar a imagem de um chamado já salvo. Pode restar um arquivo sem vínculo nesse caso, que deve ser conferido antes de uma limpeza manual.

Para cooperativas que ainda não aceitaram um chamado, o radar omite o endereço e o morador e reduz a precisão das coordenadas. Após o aceite, os dados completos ficam disponíveis à responsável e ao morador dono.

## Verificações executadas nesta entrega

Os testes usam a aplicação Flask real, com JWT, cookies, hash de senha, validação de foto e serviços reais. O banco é substituído por um repositório de testes com transações em memória. Isso permite exercitar a API sem tocar no banco do grupo, mas não reproduz o comportamento interno de concorrência do InnoDB.

Foram cobertos cadastro, senha armazenada como hash, credenciais incorretas, duplicidade, cookies, CSRF, origem, alteração de JWT, expiração, logout, reinício, permissões, limites de tentativas, fluxo completo da coleta, restrição de fotos e endereços, coordenadas, tamanho de arquivo, rejeição de campos extras, rollback e dois aceites simultâneos no contrato de testes.

Resultado da execução e limites exatos: consulte [RESULTADO_DOS_TESTES.txt](RESULTADO_DOS_TESTES.txt), incluído no pacote.

**A integração com o MySQL do usuário ainda precisa ser executada no computador do grupo.** Não foram recebidas credenciais nem estabelecida conexão com esse servidor. Uma tentativa de iniciar e conectar a um MySQL 8.0.46 isolado neste ambiente encontrou bloqueio de sockets/conexões locais; por isso, não se declara validação real de persistência ou concorrência MySQL nesta entrega.

## Como executar os cinco testes MySQL opcionais

Esses testes devem apontar para um esquema separado de teste, já preparado com a mesma estrutura das cinco tabelas. Não use o banco com os dados do trabalho. O nome precisa começar com `rd_teste_` e ser diferente de `MYSQL_DATABASE`. O pacote não fornece comandos de criação ou alteração do esquema.

Exemplo no PowerShell, após preparar esse esquema de teste:

```powershell
$env:TEST_MYSQL_DATABASE = "rd_teste_recicladescarte"
$env:TEST_MYSQL_HOST = "127.0.0.1"
$env:TEST_MYSQL_PORT = "3306"
$env:TEST_MYSQL_USER = "seu_usuario_de_teste"
$env:TEST_MYSQL_PASSWORD = "sua_senha_de_teste"
.\.venv\Scripts\python.exe -m pytest -q -m mysql
```

No Linux, `TEST_MYSQL_SOCKET` permite usar um socket local em vez de TCP. Essas variáveis são lidas diretamente do ambiente dos testes; não são carregadas automaticamente do `.env` da aplicação.

Os testes inserem seus próprios registros identificados por um prefixo aleatório e removem esses registros ao terminar. Não alteram a definição das tabelas. Cobrem persistência com nova instância da aplicação, hash dentro do limite da coluna, aceite concorrente com duas conexões reais, rollback de endereço, tratamento de duplicidade, entradas com aparência de SQL e comparação de `SHOW CREATE TABLE` antes e depois. O contador `AUTO_INCREMENT` pode avançar em consequência dos inserts.

## Coerência com o front-end e o documento

A tecnologia definida pelo grupo foi mantida: Python no back-end, API HTTP e MySQL relacional. HTML, CSS e JavaScript continuam no front-end existente. As rotas utilizam o prefixo `/api` e objetos de resposta com `dados`.

Na integração de 26/10/2026, o formulário foi adequado ao banco existente: material, foto, rua, número opcional e coordenadas. Peso, data preferida, observações, bairro, cidade, UF, complemento e CEP saíram do formulário desta etapa. Esses recursos ficam adiados no escopo; os dados não são solicitados para depois serem descartados. Nenhuma coluna foi acrescentada e nenhum campo fictício foi incluído nas respostas da API.

O modelo JS aceita as respostas sem peso. Os cartões e o histórico mostram as datas registradas pela API, a ordenação usa a criação e o painel apresenta o total de pedidos. As fotos usam o endereço da API configurada em `scripts/config.js`, com cookies na consulta protegida. O radar respeita a localização aproximada recebida do servidor e o endereço exato é exibido ao responsável após o aceite.

Também foi corrigida a leitura de uploads multipart: o limite de memória do parser passou de 64 para 128 KB para acomodar o buffer de leitura. Uma foto PNG válida de cerca de 480 KB, antes recusada com HTTP 413, passa a ser aceita. O limite de 5 MB por foto e o limite total de 6 MB da requisição continuam em vigor. Dois testes de regressão verificam o caso aceito e a recusa de um arquivo acima de 5 MB.

Cadastro e login foram validados pelo grupo no ambiente local. O novo fluxo de coletas precisa ser confirmado nesse mesmo MySQL depois da aplicação dos arquivos. Os testes automatizados desta entrega usam repositórios em memória e não substituem essa conferência. Consulte [INTEGRACAO_COLETAS.md](INTEGRACAO_COLETAS.md) e [TESTES_COLETAS.md](TESTES_COLETAS.md).

Permanecem para etapas posteriores: serviço de cálculo de trajetos e distância para persistência no banco, edição pública de conta, recuperação de senha por e-mail e persistência de preferências gerais. O radar calcula apenas uma estimativa em linha reta no navegador; o link de rota abre o Google Maps. Não há rotas da API simulando os recursos adiados.

## Referências técnicas

- Flask: [fábrica de aplicação](https://flask.palletsprojects.com/en/stable/patterns/appfactories/) e [envio de arquivos](https://flask.palletsprojects.com/en/stable/patterns/fileuploads/).
- Werkzeug: [hash e verificação de senha](https://werkzeug.palletsprojects.com/en/stable/utils/#module-werkzeug.security).
- PyJWT: [assinatura, validação e declarações obrigatórias](https://pyjwt.readthedocs.io/en/stable/usage.html).
- PyMySQL: [conexões, parâmetros e transações](https://pymysql.readthedocs.io/en/latest/user/examples.html).
- MySQL: [leituras com bloqueio no InnoDB](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html).
- Waitress: [documentação oficial](https://docs.pylonsproject.org/projects/waitress/en/stable/).
