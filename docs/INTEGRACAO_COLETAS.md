# Integração das coletas

Data original: **26/10/2026**.

Este guia descreve o que o morador e a cooperativa fazem no site e como conferir o resultado no MySQL.

## Preparação

Inicie o banco, a API e o servidor das páginas conforme o [README](../README.md#como-executar-localmente). No modo conectado, o formulário consulta as categorias em `http://127.0.0.1:5000/api/categorias`. Se a tabela estiver vazia, cadastre pelo menos um material na raiz do projeto. Exemplo no PowerShell:

```powershell
.\.venv\Scripts\python.exe gerenciar.py adicionar-categoria --nome "Papel" --perigo "Baixo" --instrucoes "Separe o material limpo e seco."
```

O formulário usa o identificador retornado pelo MySQL. Os materiais fictícios do modo de demonstração ficam separados do banco real.

## Da solicitação à conclusão

1. **Morador:** selecione a categoria, anexe uma foto, informe a rua e confirme o local de retirada no mapa. O número é opcional; as coordenadas podem vir do navegador ou ser preenchidas manualmente. O pedido aparece como **Pendente** em **Minhas coletas**.
2. **Cooperativa:** encontre o pedido no **Radar de coletas** e aceite-o. Antes do aceite, a posição é aproximada. Depois, a responsável recebe o endereço completo, pode abrir o destino no Google Maps e vê o pedido **Em andamento**.
3. **Cooperativa responsável:** registre a conclusão após a retirada. O pedido fica **Concluído** no histórico dos dois perfis.

O radar usa a localização da cooperativa, quando informada, para estimar a distância em linha reta. Essa estimativa não é distância por trajeto nem é gravada pelo navegador no MySQL. Os filtros e as demais preferências da interface são salvos localmente.

A solicitação vai para a API como `multipart/form-data`, com os campos `dados` e `foto`. Veja o [formato da requisição](ROTAS.md#criação-de-chamado-com-foto). A API define o morador, a situação inicial e as datas. Peso, agendamento e observações não fazem parte desse fluxo.

## Conferência no MySQL

No MySQL Workbench, selecione o esquema definido em `MYSQL_DATABASE`. A consulta abaixo é somente leitura e mostra os dez chamados mais recentes:

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

| Ação | O que conferir |
| --- | --- |
| Criar solicitação | Novo `chamado` com endereço e categoria, situação `Pendente` e sem coleta vinculada. |
| Aceitar | Registro em `coleta` com `coletor_id` e `aceito_em`; chamado `Em Andamento`. |
| Concluir | `concluido_em` preenchido e chamado `Concluído`. |

A foto fica no servidor da API, e o banco guarda o caminho protegido em `chamado.foto_url`. A interface resolve esse caminho a partir do endereço definido em [scripts/config.js](../scripts/config.js).
