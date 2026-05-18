from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.utils.errors import conflict, not_found


def normalizar_nome(nome: str) -> str:
    return " ".join(nome.strip().split())


def buscar_categoria_ou_404(db: Session, categoria_id: int) -> models.Categoria:
    categoria = db.query(models.Categoria).filter(models.Categoria.id == categoria_id).first()
    if categoria is None:
        raise not_found("Categoria nao encontrada.")
    return categoria


def existe_categoria_com_mesmo_nome_e_tipo(
    db: Session,
    nome: str,
    tipo: schemas.TipoLancamento,
    categoria_id_ignorada: int | None = None,
) -> bool:
    query = db.query(models.Categoria).filter(
        func.lower(models.Categoria.nome) == nome.lower(),
        models.Categoria.tipo == tipo,
    )

    if categoria_id_ignorada is not None:
        query = query.filter(models.Categoria.id != categoria_id_ignorada)

    return query.first() is not None


def validar_categoria_unica(
    db: Session,
    nome: str,
    tipo: schemas.TipoLancamento,
    categoria_id_ignorada: int | None = None,
):
    if existe_categoria_com_mesmo_nome_e_tipo(db, nome, tipo, categoria_id_ignorada):
        raise conflict("Ja existe uma categoria com este nome e tipo.")
