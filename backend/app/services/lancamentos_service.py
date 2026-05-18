from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.services.categorias_service import buscar_categoria_ou_404
from app.utils.errors import bad_request, not_found


def buscar_lancamento_ou_404(db: Session, lancamento_id: int) -> models.Lancamento:
    lancamento = (
        db.query(models.Lancamento)
        .options(joinedload(models.Lancamento.categoria))
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
