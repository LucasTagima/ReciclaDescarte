# ReciclaDescarte

Projeto Integrador de Programação Web do curso de Ciência de Dados e IA da PUC-Campinas.

## Descrição

O ReciclaDescarte é uma plataforma web para aproximar moradores que precisam descartar materiais recicláveis de cooperativas e coletores que podem retirá-los. O projeto foi pensado inicialmente para Campinas (SP), com atenção a materiais como eletrônicos, óleo de cozinha e itens volumosos.

- **Morador:** solicita a coleta informando o material, uma foto e o local de retirada. Acompanha a situação do pedido em **Minhas coletas**.
- **Cooperativa:** consulta os pedidos disponíveis no **Radar de coletas**, usa filtros para encontrar solicitações, aceita as que pode atender e registra a conclusão.

## Tecnologias Utilizadas

- **Interface:** HTML, CSS e JavaScript.
- **API REST:** Python com Flask e servidor Waitress.
- **Banco de dados:** MySQL, com conexão pela biblioteca PyMySQL.
- **Protótipo:** Figma.
- **Testes:** pytest para Python, Node.js para os módulos JavaScript e Playwright para o fluxo no navegador.

## Estrutura do Projeto

| Caminho | Finalidade |
|---|---|
| `index.html` e `pages/` | Página inicial e telas de cadastro, login, solicitação, radar, histórico e configurações. |
| `css/` | Estilos da interface, incluindo temas e adaptação a diferentes tamanhos de tela. |
| `scripts/` | Módulos JavaScript das telas, componentes e serviços de comunicação com a API. |
| `recicladescarte/` | Código da API, regras de negócio, conexão com o banco e tratamento de fotos. |
| `imagens/` e `icon/` | Logotipo, ilustrações, ícones e marcadores do mapa. |
| `docs/` | Documentação da API, da integração com o banco e dos testes. |
| `tests/` e `tests_frontend/` | Testes automatizados da API e da interface. |
| `executar.py` e `gerenciar.py` | Inicialização da API, conferência do banco e cadastro de categorias. |
| `.env.example` e `requirements.txt` | Modelo de configuração local e dependências da API. |

## Protótipo

[Abrir o protótipo do ReciclaDescarte no Figma](https://www.figma.com/proto/JnrGW3Au1lcBRiipZqghKt/ReciclaDescarteTelas?node-id=58-4&p=f&t=DvHDpvKFf9cqd2j0-0&scaling=scale-down&content-scaling=fixed&page-id=0%3A1)

O protótipo apresenta as telas de entrada, solicitação de coleta e consulta de pedidos pelos dois perfis.

## Integrantes

- **Juan Cesar Marquez:** protótipo das telas e apoio ao desenvolvimento da interface com CSS e JavaScript.
- **Leonardo Vieira de Andrade:** banco de dados MySQL e contato com o parceiro externo.
- **Lucas Eiji Tagima:** modelagem do banco de dados, desenvolvimento da interface em HTML e CSS e configuração inicial do repositório.
- **Murilo Rodrigues:** preparação das apresentações do projeto.
- **Otávio de Souza Zaccarias:** organização da equipe, desenvolvimento do banco e da interface, integração com a API, documentação e validação.

## Status do Projeto

**Primeira versão acadêmica funcional, validada em ambiente local.** Na apresentação ao professor, a equipe conferiu a gravação e a consulta de dados no MySQL pela interface. Também verificou a adaptação das telas às larguras avaliadas e o tempo de resposta com uma conta de morador e outra de cooperativa em uso simultâneo no mesmo computador.

**Publicação na internet:** a definir.

## Como Executar Localmente

Os comandos abaixo usam o PowerShell no Windows. Para o modo conectado, tenha Python instalado, um servidor MySQL em execução e um navegador com JavaScript habilitado.

### 1. Abra o projeto e instale as dependências

Baixe os arquivos pelo GitHub ou clone o repositório:

```powershell
git clone https://github.com/LucasTagima/ReciclaDescarte.git
cd ReciclaDescarte
```

Na pasta que contém `executar.py`, execute:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 2. Prepare o banco e configure a conexão

Use o banco MySQL já preparado para o ReciclaDescarte. A aplicação espera as tabelas `usuario`, `endereco`, `categoria`, `chamado` e `coleta` e não as cria automaticamente. Se for configurar um banco novo, use o SQL abaixo em um esquema vazio.

<details>
<summary>SQL para preparar um banco novo</summary>

```sql
CREATE DATABASE IF NOT EXISTS recicladescarte;
USE recicladescarte;

CREATE TABLE usuario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    perfil VARCHAR(50) NOT NULL,
    criado_em DATETIME
);

CREATE TABLE endereco (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    rua VARCHAR(255) NOT NULL,
    numero VARCHAR(100),
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (usuario_id) REFERENCES usuario(id)
);

CREATE TABLE categoria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    perigo VARCHAR(50),
    instrucoes TEXT
);

CREATE TABLE chamado (
    id INT AUTO_INCREMENT PRIMARY KEY,
    morador_id INT NOT NULL,
    endereco_id INT NOT NULL,
    categoria_id INT NOT NULL,
    foto_url VARCHAR(500),
    status VARCHAR(50) DEFAULT 'Pendente',
    criado_em DATETIME,
    FOREIGN KEY (morador_id) REFERENCES usuario(id),
    FOREIGN KEY (endereco_id) REFERENCES endereco(id),
    FOREIGN KEY (categoria_id) REFERENCES categoria(id)
);

CREATE TABLE coleta (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chamado_id INT NOT NULL,
    coletor_id INT NOT NULL,
    distancia_km DECIMAL(8, 2),
    aceito_em DATETIME,
    concluido_em DATETIME,
    FOREIGN KEY (chamado_id) REFERENCES chamado(id),
    FOREIGN KEY (coletor_id) REFERENCES usuario(id)
);
```

</details>

Crie o arquivo `.env` a partir do modelo, caso ele ainda não exista:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Se ainda não tiver configurado `API_SECRET`, gere um valor:

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```

No `.env`, preencha `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` e `MYSQL_DATABASE` com os dados do seu banco. Se o MySQL estiver no mesmo computador, use `127.0.0.1` como host. Preencha `API_SECRET` com o valor gerado. Mantenha `http://127.0.0.1:5500` em `ORIGENS_PERMITIDAS` e confira se `apiBase`, em [`scripts/config.js`](scripts/config.js), aponta para `http://127.0.0.1:5000/api`. O `.env` é local e fica fora do Git.

Confira a conexão e as tabelas:

```powershell
.\.venv\Scripts\python.exe gerenciar.py verificar-banco
```

Em um banco novo, cadastre pelo menos uma categoria para usar o formulário de coleta. Por exemplo:

```powershell
.\.venv\Scripts\python.exe gerenciar.py adicionar-categoria --nome "Papel" --perigo "Baixo" --instrucoes "Separe o material limpo e seco."
```

### 3. Inicie a API e a interface

No primeiro terminal:

```powershell
.\.venv\Scripts\python.exe executar.py
```

Com a API em execução, abra um segundo terminal na mesma pasta e inicie o servidor das páginas:

```powershell
.\.venv\Scripts\python.exe -m http.server 5500 --bind 127.0.0.1
```

Acesse [a página inicial](http://127.0.0.1:5500/index.html). O endpoint [de saúde da API](http://127.0.0.1:5000/api/saude) permite verificar a conexão com o banco. Para acompanhar o mesmo pedido pelos dois perfis, use uma janela normal para o morador e uma anônima para a cooperativa.

Para usar apenas o modo de demonstração, execute `py -m http.server 5500 --bind 127.0.0.1` na pasta do projeto, abra a página inicial e selecione uma das opções de demonstração na tela de entrada. Esse modo usa dados fictícios e funciona sem a API e o MySQL.

## Documentação e Testes

- [Rotas da API](docs/ROTAS.md): endereços, dados enviados e respostas.
- [Integração das coletas](docs/INTEGRACAO_COLETAS.md): cadastro de categorias e conferência dos registros no MySQL.
- [Guia dos testes](docs/TESTES_COLETAS.md): cenários avaliados e instruções para executar os testes de Python, JavaScript e navegador.

## Licença

Projeto distribuído sob a [licença MIT](LICENSE).
