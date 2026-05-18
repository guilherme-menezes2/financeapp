# Financas Pessoais

Webapp simples de financas pessoais para controlar receitas, despesas, categorias e visualizar um resumo financeiro em dashboard.

O projeto foi criado como um MVP didatico, sem autenticacao e sem multiplos usuarios, priorizando organizacao, clareza e facilidade de evolucao.

## Tecnologias usadas

Backend:

- Python
- FastAPI
- SQLite
- SQLAlchemy
- Pydantic
- Uvicorn

Frontend:

- React
- Vite
- Axios
- React Router
- Recharts
- CSS simples

## Estrutura de pastas

```text
financeapp/
  backend/
    app/
      core/
      models/
      routers/
      schemas/
      services/
      utils/
      database.py
      main.py
    main.py
    seed.py
    requirements.txt
    README.md

  frontend/
    src/
      components/
      pages/
      routes/
      services/
      styles/
      utils/
      App.jsx
      main.jsx
    index.html
    package.json
    README.md
```

## Como rodar o backend

Entre na pasta do backend:

```bash
cd backend
```

Crie e ative um ambiente virtual:

```bash
python -m venv .venv
.venv\Scripts\activate
```

Instale as dependencias:

```bash
pip install -r requirements.txt
```

Inicie a API:

```bash
uvicorn main:app --reload
```

A API ficara disponivel em:

```text
http://localhost:8000
```

Swagger:

```text
http://localhost:8000/docs
```

Health check:

```text
http://localhost:8000/health
```

## Como rodar o frontend

Em outro terminal, entre na pasta do frontend:

```bash
cd frontend
```

Instale as dependencias:

```bash
npm install
```

Inicie o Vite:

```bash
npm run dev
```

O frontend ficara disponivel em:

```text
http://localhost:5173
```

## Como popular dados de teste

O backend possui um script de seed:

```text
backend/seed.py
```

Ele cria categorias padrao e lancamentos de exemplo dos ultimos 6 meses.

Para executar:

```bash
cd backend
python seed.py
```

Depois disso, rode backend e frontend normalmente e acesse:

```text
http://localhost:5173
```

O Dashboard deve exibir cards, graficos e resumo financeiro com dados de exemplo.

## Como rodar com Docker Compose

Na raiz do projeto, execute:

```bash
docker compose up --build
```

O Compose sobe dois servicos:

- `backend`: API FastAPI na porta `8000`
- `frontend`: React/Vite na porta `5173`

Acesse:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:8000
Swagger:  http://localhost:8000/docs
```

Para parar os containers:

```bash
docker compose down
```

Para acompanhar logs:

```bash
docker compose logs -f
```

Para acessar o terminal do backend:

```bash
docker compose exec backend bash
```

Para acessar o terminal do frontend:

```bash
docker compose exec frontend sh
```

### Banco SQLite no Docker

O SQLite fica persistido em:

```text
backend/data/app.db
```

A pasta `backend/data` e montada como volume no container do backend. Assim, o banco nao e perdido ao recriar os containers.

### Variaveis de ambiente no Docker

Backend:

```text
DATABASE_URL=sqlite:///data/app.db
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Frontend:

```text
VITE_API_URL=http://localhost:8000
```

O frontend roda dentro do container, mas quem acessa a API e o navegador do usuario. Por isso, `VITE_API_URL` aponta para `http://localhost:8000`.

### Popular dados usando Docker

Com os containers rodando:

```bash
docker compose exec backend python seed.py
```

Depois recarregue o Dashboard em:

```text
http://localhost:5173
```

## Endpoints principais da API

### Health

```http
GET /health
```

### Categorias

```http
GET    /categorias
GET    /categorias?tipo=receita
GET    /categorias?tipo=despesa
GET    /categorias/{categoria_id}
POST   /categorias
PUT    /categorias/{categoria_id}
DELETE /categorias/{categoria_id}
```

Exemplo de categoria:

```json
{
  "nome": "Supermercado",
  "tipo": "despesa",
  "cor": "#f97316"
}
```

### Lancamentos

```http
GET    /lancamentos
GET    /lancamentos/{lancamento_id}
POST   /lancamentos
PUT    /lancamentos/{lancamento_id}
DELETE /lancamentos/{lancamento_id}
```

Filtros disponiveis em `GET /lancamentos`:

```http
GET /lancamentos?tipo=despesa
GET /lancamentos?categoria_id=1
GET /lancamentos?data_inicio=2026-01-01&data_fim=2026-01-31
GET /lancamentos?texto=mercado
```

Exemplo de lancamento:

```json
{
  "tipo": "despesa",
  "descricao": "Compra no mercado",
  "valor": 250.75,
  "data": "2026-05-18",
  "categoria_id": 1,
  "observacao": "Compra mensal"
}
```

### Resumo financeiro

```http
GET /resumo
GET /resumo?data_inicio=2026-01-01&data_fim=2026-05-31
```

Retorna:

- total de receitas
- total de despesas
- saldo
- quantidade de lancamentos
- resumo do mes atual
- despesas por categoria
- receitas por categoria
- fluxo mensal dos ultimos 6 meses

## Funcionalidades existentes

- Cadastro, edicao, listagem e exclusao de categorias
- Cadastro, edicao, listagem e exclusao de lancamentos
- Filtros de lancamentos por tipo, categoria, periodo e descricao
- Bloqueio de categoria duplicada com mesmo nome e tipo
- Bloqueio de exclusao de categoria com lancamentos vinculados
- Validacao de categoria compativel com o tipo do lancamento
- Dashboard com cards financeiros
- Grafico de receitas x despesas por mes
- Grafico de despesas por categoria
- Listagem de receitas e despesas por categoria
- Script de seed para dados de teste
- Layout responsivo
- Estados de loading, erro e lista vazia

## Proximos passos sugeridos

- Adicionar testes automatizados no backend
- Adicionar testes de interface no frontend
- Implementar paginacao em lancamentos
- Adicionar confirmacao visual com toast
- Melhorar filtros do dashboard
- Adicionar exportacao CSV
- Adicionar recorrencia de lancamentos
- Adicionar autenticacao em uma versao futura
- Preparar migrations com Alembic
- Configurar variaveis de ambiente para URLs e banco de dados
