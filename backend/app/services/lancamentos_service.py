from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.services.categorias_service import buscar_categoria_ou_404
from app.services.cartoes_service import buscar_cartao_ou_404
from app.utils.errors import bad_request, not_found


def buscar_lancamento_ou_404(db: Session, lancamento_id: int) -> models.Lancamento:
    lancamento = (
        db.query(models.Lancamento)
        .options(
            joinedload(models.Lancamento.categoria),
            joinedload(models.Lancamento.cartao),
        )
        .filter(models.Lancamento.id == lancamento_id)
        .first()
    )

    if lancamento is None:
        raise not_found("Lancamento nao encontrado.")

    return lancamento


def validar_categoria_compativel(
    categoria: models.Categoria,
    tipo_lancamento: schemas.TipoLancamento,
):
    if categoria.tipo != tipo_lancamento:
        raise bad_request("A categoria precisa ser compativel com o tipo do lancamento.")


def obter_categoria_compativel(
    db: Session,
    categoria_id: int,
    tipo_lancamento: schemas.TipoLancamento,
) -> models.Categoria:
    categoria = buscar_categoria_ou_404(db, categoria_id)
    validar_categoria_compativel(categoria, tipo_lancamento)
    return categoria


def validar_cartao_do_lancamento(
    db: Session,
    forma_pagamento: schemas.FormaPagamento,
    cartao_id: int | None,
):
    if forma_pagamento == "credito":
        if cartao_id is None:
            raise bad_request("Selecione um cartao para lancamentos no credito.")

        buscar_cartao_ou_404(db, cartao_id)
        return

    if cartao_id is not None:
        raise bad_request("Cartao deve ser informado apenas para lancamentos no credito.")
