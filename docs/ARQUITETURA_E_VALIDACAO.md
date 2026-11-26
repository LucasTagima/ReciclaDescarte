# Arquitetura e validação

Documento original de **25/10/2026**. Integração das coletas registrada em **26/10/2026**.

O ReciclaDescarte separa a interface no navegador da API em Python. O JavaScript envia requisições HTTP à API, que verifica as regras do sistema e consulta ou atualiza o MySQL.

## Componentes

| Componente | Responsabilidade |
| --- | --- |
| [Páginas HTML](../pages/) e [CSS](../css/) | Telas e estilos dos perfis de morador e cooperativa. |
| [Serviço JavaScript de API](../scripts/services/api.js) | Centraliza as requisições feitas pelas telas. O endereço da API fica em [scripts/config.js](../scripts/config.js). |
| [Rotas Flask](../recicladescarte/__init__.py) | Recebem as requisições, verificam a sessão e encaminham cada ação ao serviço correspondente. Veja o [contrato da API](ROTAS.md). |
| [Serviços](../recicladescarte/servicos.py) e [domínio](../recicladescarte/dominio.py) | Organizam cadastro, autenticação e coletas. Classes como `Chamado` e `Coleta` verificam estado, perfil e responsabilidade. |
| [Acesso ao MySQL](../recicladescarte/banco.py) | Abre transações e oferece repositórios com consultas parametrizadas. |

Os serviços usam o contrato da classe `Banco`. A aplicação utiliza `BancoMySQL`; nos testes, `BancoMemoria` implementa o mesmo contrato. Morador e cooperativa são perfis de `Usuario`, definidos pela coluna `usuario.perfil`.

## Banco de dados

A API usa as cinco tabelas existentes. O comando `gerenciar.py verificar-banco` confere a conexão, as colunas necessárias e o uso de InnoDB. A aplicação não cria nem modifica a estrutura do banco.

| Tabela | Dados |
| --- | --- |
| `usuario` | Conta, senha como hash e perfil. |
| `endereco` | Rua, número e coordenadas do local de retirada. |
| `categoria` | Material, nível de perigo e instruções de descarte. |
| `chamado` | Solicitação do morador, endereço, categoria, situação e referência à foto. |
| `coleta` | Cooperativa responsável, aceite e conclusão. |

O endereço e o chamado são gravados na mesma transação. No aceite, a API bloqueia a linha do chamado com `SELECT ... FOR UPDATE`, confere se ele ainda está pendente, registra a coleta e atualiza a situação. Um segundo aceite recebe `409`. Essa garantia vale para as gravações feitas pela API; o esquema não tem uma restrição de unicidade em `coleta.chamado_id`.

## Sessões e fotos

As senhas são armazenadas como hash com scrypt. O login envia o JWT em um cookie `HttpOnly`, e as requisições `POST` exigem um token CSRF. As sessões ficam em memória: reiniciar o processo encerra as sessões. A execução padrão usa um processo Waitress com threads; vários processos exigiriam um mecanismo de sessão compartilhado.

A manutenção local permite redefinir a senha de uma conta com `gerenciar.py redefinir-senha --email <email>`. O comando solicita a nova senha no terminal e atualiza o hash; não há recuperação por e-mail.

A coluna `chamado.foto_url` guarda apenas a referência. O arquivo fica em `dados/fotos` por padrão, ou no diretório definido por `PASTA_FOTOS`, e é servido pela API conforme as permissões do chamado. Ao transferir uma instalação preservando os registros, copie o banco e a pasta de fotos.

Antes do aceite, a cooperativa vê o material, a foto e uma posição aproximada. O endereço completo e as coordenadas exatas ficam disponíveis ao morador dono e à cooperativa responsável.

## Execução e validação

O [README](../README.md#como-executar-localmente) explica a configuração local da API, do servidor das páginas e do MySQL. Consulte o [guia de integração](INTEGRACAO_COLETAS.md) para conferir uma coleta no banco e o [guia de testes](TESTES_COLETAS.md) para reproduzir as verificações.
