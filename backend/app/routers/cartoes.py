from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services.cartoes_service import (
    buscar_cartao_ou_404,
    normalizar_texto,
    validar_cartao_unico,
)
from app.utils.errors import conflict


router = APIRouter(prefix="/cartoes", tags=["Cartoes"])


@router.get("", response_model=list[schemas.CartaoResponse])
def listar_cartoes(db: Session = Depends(get_db)):
    return db.query(models.Cartao).order_by(models.Cartao.nome.asc()).all()


@router.get("/{cartao_id}", response_model=schemas.CartaoResponse)
def obter_cartao(cartao_id: int, db: Session = Depends(get_db)):
    return buscar_cartao_ou_404(db, cartao_id)


@router.post("", response_model=schemas.CartaoResponse, status_code=status.HTTP_201_CREATED)
def criar_cartao(cartao: schemas.CartaoCreate, db: Session = Depends(get_db)):
    nome = normalizar_texto(cartao.nome)
    bandeira = normalizar_texto(cartao.bandeira)
    validar_cartao_unico(db, nome)

    novo_cartao = models.Cartao(nome=nome, bandeira=bandeira, limite=cartao.limite)
    db.add(novo_cartao)
    db.commit()
    db.refresh(novo_cartao)
    return novo_cartao


@router.put("/{cartao_id}", response_model=schemas.CartaoResponse)
def atualizar_cartao(
    cartao_id: int,
    dados_cartao: schemas.CartaoUpdate,
    db: Session = Depends(get_db),
):
    cartao = buscar_cartao_ou_404(db, cartao_id)
    dados = dados_cartao.model_dump(exclude_unset=True)

    novo_nome = normalizar_texto(dados["nome"]) if "nome" in dados else cartao.nome
    validar_cartao_unico(db, novo_nome, cartao_id)

    if "nome" in dados:
        cartao.nome = novo_nome
    if "bandeira" in dados:
        cartao.bandeira = normalizar_texto(dados["bandeira"])
    if "limite" in dados:
        cartao.limite = dados["limite"]

    db.commit()
    db.refresh(cartao)
    return cartao


@router.delete("/{cartao_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_cartao(cartao_id: int, db: Session = Depends(get_db)):
    cartao = buscar_cartao_ou_404(db, cartao_id)
    total_lancamentos = (
        db.query(models.Lancamento)
        .filter(models.Lancamento.cartao_id == cartao_id)
        .count()
    )

    if total_lancamentos > 0:
        raise conflict("Nao e possivel excluir um cartao com lancamentos vinculados.")

    db.delete(cartao)
    db.commit()
