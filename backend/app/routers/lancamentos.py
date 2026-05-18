from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.database import get_db
from app.services.lancamentos_service import (
    buscar_lancamento_ou_404,
    obter_categoria_compativel,
    validar_cartao_do_lancamento,
)
from app.utils.dates import validar_periodo


router = APIRouter(prefix="/lancamentos", tags=["Lancamentos"])


TipoQuery = Annotated[
    schemas.TipoLancamento | None,
    Query(description="Filtra lancamentos por tipo: receita ou despesa"),
]


@router.get("", response_model=list[schemas.LancamentoResponse])
def listar_lancamentos(
    tipo: TipoQuery = None,
    categoria_id: int | None = Query(default=None, gt=0),
    data_inicio: date | None = None,
    data_fim: date | None = None,
    texto: str | None = Query(default=None, description="Busca texto na descricao"),
    db: Session = Depends(get_db),
):
    validar_periodo(data_inicio, data_fim)

    query = db.query(models.Lancamento).options(
        joinedload(models.Lancamento.categoria),
        joinedload(models.Lancamento.cartao),
    )

    if tipo is not None:
        query = query.filter(models.Lancamento.tipo == tipo)
    if categoria_id is not None:
        query = query.filter(models.Lancamento.categoria_id == categoria_id)
    if data_inicio is not None:
        query = query.filter(models.Lancamento.data >= data_inicio)
    if data_fim is not None:
        query = query.filter(models.Lancamento.data <= data_fim)
    if texto:
        texto_normalizado = texto.strip().lower()
        if texto_normalizado:
            query = query.filter(func.lower(models.Lancamento.descricao).contains(texto_normalizado))

    return query.order_by(models.Lancamento.data.desc(), models.Lancamento.id.desc()).all()


@router.get("/{lancamento_id}", response_model=schemas.LancamentoResponse)
def obter_lancamento(lancamento_id: int, db: Session = Depends(get_db)):
    return buscar_lancamento_ou_404(db, lancamento_id)


@router.post(
    "",
    response_model=schemas.LancamentoResponse,
    status_code=status.HTTP_201_CREATED,
)
def criar_lancamento(lancamento: schemas.LancamentoCreate, db: Session = Depends(get_db)):
    obter_categoria_compativel(db, lancamento.categoria_id, lancamento.tipo)
    validar_cartao_do_lancamento(db, lancamento.forma_pagamento, lancamento.cartao_id)

    novo_lancamento = models.Lancamento(
        tipo=lancamento.tipo,
        forma_pagamento=lancamento.forma_pagamento,
        descricao=lancamento.descricao,
        valor=lancamento.valor,
        data=lancamento.data,
        categoria_id=lancamento.categoria_id,
        cartao_id=lancamento.cartao_id,
        observacao=lancamento.observacao,
    )

    db.add(novo_lancamento)
    db.commit()

    return buscar_lancamento_ou_404(db, novo_lancamento.id)


@router.put("/{lancamento_id}", response_model=schemas.LancamentoResponse)
def atualizar_lancamento(
    lancamento_id: int,
    dados_lancamento: schemas.LancamentoUpdate,
    db: Session = Depends(get_db),
):
    lancamento = buscar_lancamento_ou_404(db, lancamento_id)
    dados = dados_lancamento.model_dump(exclude_unset=True)

    tipo_final = dados.get("tipo", lancamento.tipo)
    forma_pagamento_final = dados.get("forma_pagamento", lancamento.forma_pagamento)
    categoria_id_final = dados.get("categoria_id", lancamento.categoria_id)
    cartao_id_final = dados.get("cartao_id", lancamento.cartao_id)
    obter_categoria_compativel(db, categoria_id_final, tipo_final)
    validar_cartao_do_lancamento(db, forma_pagamento_final, cartao_id_final)

    for campo, valor in dados.items():
        setattr(lancamento, campo, valor)

    db.commit()

    return buscar_lancamento_ou_404(db, lancamento.id)


@router.delete("/{lancamento_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_lancamento(lancamento_id: int, db: Session = Depends(get_db)):
    lancamento = buscar_lancamento_ou_404(db, lancamento_id)

    db.delete(lancamento)
    db.commit()
