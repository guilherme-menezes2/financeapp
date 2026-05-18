# Backend - Financas Pessoais

API criada com FastAPI, SQLite, SQLAlchemy e Pydantic.

## Rodando localmente

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

A API ficara disponivel em:

- http://localhost:8000
- http://localhost:8000/docs
- http://localhost:8000/health
