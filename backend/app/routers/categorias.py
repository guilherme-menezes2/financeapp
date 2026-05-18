from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services.categorias_service import (
    buscar_categoria_ou_404,
    normalizar_nome,
    validar_categoria_unica,
)
from app.utils.errors import conflict


router = APIRouter(prefix="/categorias", tags=["Categorias"])


TipoQuery = Annotated[
    schemas.TipoLancamento | None,
    Query(description="Filtra categorias por tipo: receita ou despesa"),
]


@router.get("", response_model=list[schemas.CategoriaResponse])
def listar_categorias(
    tipo: TipoQuery = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Categoria)

    if tipo is not None:
        query = query.filter(models.Categoria.tipo == tipo)

    return query.order_by(models.Categoria.nome.asc()).all()


@router.get("/{categoria_id}", response_model=schemas.CategoriaResponse)
def obter_categoria(categoria_id: int, db: Session = Depends(get_db)):
    return buscar_categoria_ou_404(db, categoria_id)


@router.post(
    "",
    response_model=schemas.CategoriaResponse,
    status_code=status.HTTP_201_CREATED,
)
def criar_categoria(categoria: schemas.CategoriaCreate, db: Session = Depends(get_db)):
    nome_normalizado = normalizar_nome(categoria.nome)
    validar_categoria_unica(db, nome_normalizado, categoria.tipo)

    nova_categoria = models.Categoria(
        nome=nome_normalizado,
        tipo=categoria.tipo,
        cor=categoria.cor,
    )

    db.add(nova_categoria)
    db.commit()
    db.refresh(nova_categoria)

    return nova_categoria


@router.put("/{categoria_id}", response_model=schemas.CategoriaResponse)
def atualizar_categoria(
    categoria_id: int,
    dados_categoria: schemas.CategoriaUpdate,
    db: Session = Depends(get_db),
):
    categoria = buscar_categoria_ou_404(db, categoria_id)
    dados = dados_categoria.model_dump(exclude_unset=True)

    novo_nome = normalizar_nome(dados["nome"]) if "nome" in dados else categoria.nome
    novo_tipo = dados.get("tipo", categoria.tipo)

    if novo_tipo != categoria.tipo and categoria.lancamentos:
        raise conflict("Nao e possivel alterar o tipo de uma categoria com lancamentos vinculados.")

    validar_categoria_unica(db, novo_nome, novo_tipo, categoria_id)

    if "nome" in dados:
        categoria.nome = novo_nome
    if "tipo" in dados:
        categoria.tipo = novo_tipo
    if "cor" in dados:
        categoria.cor = dados["cor"]

    db.commit()
    db.refresh(categoria)

    return categoria


@router.delete("/{categoria_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_categoria(categoria_id: int, db: Session = Depends(get_db)):
    categoria = buscar_categoria_ou_404(db, categoria_id)
    total_lancamentos = (
        db.query(models.Lancamento)
        .filter(models.Lancamento.categoria_id == categoria_id)
        .count()
    )

    if total_lancamentos > 0:
        raise conflict("Nao e possivel excluir uma categoria com lancamentos vinculados.")

    db.delete(categoria)
    db.commit()
