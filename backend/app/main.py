import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import models
from app.database import Base, engine
from app.routers import categorias
from app.routers import lancamentos
from app.routers import resumo
from app.utils.db_migrations import aplicar_migracoes_sqlite


Base.metadata.create_all(bind=engine)
aplicar_migracoes_sqlite()

app = FastAPI(
    title="Financas Pessoais API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://frontend:5173",
        *[
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "").split(",")
            if origin.strip()
        ],
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(categorias.router)
app.include_router(lancamentos.router)
app.include_router(resumo.router)


@app.exception_handler(Exception)
async def internal_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Erro interno no servidor."},
    )


@app.get("/health")
def health_check():
    return {"status": "OK"}
