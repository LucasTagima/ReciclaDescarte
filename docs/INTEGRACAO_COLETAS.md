# Integração das coletas - 26/10/2026

## Comportamento desta etapa

O morador envia material, foto, rua, número opcional e coordenadas. A criação envia `multipart/form-data` com as partes `dados` e `foto`, conforme `ROTAS.md`. O JSON contém somente `categoria_id`, `endereco` e `localizacao`. A API continua responsável por definir morador, situação e datas.

Os campos de peso, data de preferência, observações, bairro, cidade, UF, complemento e CEP saíram do formulário. Eles não têm colunas no banco que o grupo decidiu preservar. A mudança deve ser registrada também no escopo e nos documentos acadêmicos: esses recursos estão adiados, e esta entrega não oferece agendamento nem cálculo de impacto por peso.

| Tela ou parte | Adequação |
|---|---|
| Nova solicitação | Envia somente os campos aceitos. Exibe as instruções do material quando estiverem cadastradas. |
| Localização manual | Editar rua ou coordenadas exige nova confirmação. O mapa mantém a altura durante a edição para não deslocar o checkbox no clique. |
| Modelo de chamado | Lê as respostas da API sem exigir peso. |
| Painel do morador | Conta os pedidos reais e substitui o indicador de peso pelo total de pedidos. |
| Histórico e detalhes | Mostram situação, criação, responsável, aceite e conclusão quando disponíveis. Datas ausentes não viram datas de 1970. |
| Busca e ordenação | Buscam material, identificador e rua/número quando o endereço está disponível; ordenam pela criação. A preferência antiga de agendamento volta para mais recentes. |
| Radar | Mantém o endereço reservado até o aceite e identifica o ponto aproximado. A distância é uma estimativa em linha reta. |
| Fotos | Resolvem `/api/fotos/...` no servidor definido em `scripts/config.js`, inclusive quando as páginas e a API estão em portas diferentes. A imagem protegida é solicitada com credenciais. |
| Aceite e conclusão | Atualizam a lista com a resposta confirmada pela API. Erros continuam visíveis e não ativam a demonstração. |
| Demonstração | Usa os mesmos campos da etapa atual, mantendo os dados fictícios no navegador. |
| Upload na API | Corrige a leitura multipart que recusava imagens válidas maiores que 64 KB. O limite de 5 MB por foto continua sendo verificado. |

## Preparação dos materiais

Confira `http://127.0.0.1:5000/api/categorias`. Os materiais de demonstração não são copiados automaticamente para o MySQL.

Se a tabela estiver vazia e você quiser cadastrar um material explicitamente, abra um terminal na raiz e execute:

```powershell
.\.venv\Scripts\python.exe gerenciar.py adicionar-categoria --nome "Papel" --perigo "Baixo" --instrucoes "Separe o material limpo e seco."
```

Isso insere um registro na tabela existente. O formulário usa o identificador retornado pelo banco; não depende de o material ter um número fixo.

## Conferência no Workbench

Selecione como padrão o esquema usado em `MYSQL_DATABASE` no seu `.env`. Depois execute a consulta abaixo, que é somente leitura:

```sql
SELECT
    ch.id AS chamado_id,
    ch.status,
    ca.nome AS material,
    e.rua,
    e.numero,
    c.id AS coleta_id,
    c.coletor_id,
    c.aceito_em,
    c.concluido_em
FROM chamado AS ch
JOIN categoria AS ca ON ca.id = ch.categoria_id
JOIN endereco AS e ON e.id = ch.endereco_id
LEFT JOIN coleta AS c ON c.chamado_id = ch.id
ORDER BY ch.id DESC
LIMIT 10;
```

| Ação feita nas páginas | O que conferir no banco |
|---|---|
| Morador envia o pedido | Novos registros em `endereco` e `chamado`; situação `Pendente`. Ainda não há coleta vinculada. |
| Cooperativa aceita | Registro em `coleta`, com responsável e `aceito_em`; chamado `Em Andamento`. |
| Responsável conclui | `concluido_em` preenchido e chamado `Concluído`. |

O MySQL guarda a referência da foto em `chamado.foto_url`; o arquivo fica na pasta de fotos da API. A coluna `distancia_km` continua sem cálculo automático nesta entrega. As preferências gerais continuam locais ao navegador.

## Arquivos de execução alterados

- `pages/solicitacao.html`
- `pages/dash_morador.html`
- `pages/coletas.html`
- `pages/radar_cooperativa.html`
- `pages/configuracoes.html`
- `pages/sobre.html`
- `css/solicitacao.css`
- `scripts/pages/solicitacao.js`
- `scripts/pages/morador.js`
- `scripts/pages/coletas.js`
- `scripts/pages/radar.js`
- `scripts/models/chamado.js`
- `scripts/components/chamados.js`
- `scripts/services/coletas.js`
- `scripts/services/demo.js`
- `scripts/services/preferencias.js`
- `scripts/utils/dados.js`
- `recicladescarte/__init__.py`

A atualização inclui documentação e testes opcionais. A API tem somente o ajuste do limite de memória do parser multipart: de 64 para 128 KB, para acomodar o buffer de leitura. O limite total da requisição continua em 6 MB e o armazenamento de fotos continua recusando arquivos acima de 5 MB. A estrutura MySQL, os repositórios e a configuração de conexão já feita pelo grupo são preservados. Consulte `TESTES_COLETAS.md` antes de registrar os resultados no PI: os testes controlados não comprovam a gravação de coletas no MySQL real do grupo.
