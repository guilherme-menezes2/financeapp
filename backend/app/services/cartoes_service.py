from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.utils.errors import conflict, not_found


def normalizar_texto(valor: str) -> str:
    return " ".join(valor.strip().split())


def buscar_cartao_ou_404(db: Session, cartao_id: int) -> models.Cartao:
    cartao = db.query(models.Cartao).filter(models.Cartao.id == cartao_id).first()
    if cartao is None:
        raise not_found("Cartao nao encontrado.")
    return cartao


def existe_cartao_com_mesmo_nome(
    db: Session,
    nome: str,
    cartao_id_ignorado: int | None = None,
) -> bool:
    query = db.query(models.Cartao).filter(func.lower(models.Cartao.nome) == nome.lower())

    if cartao_id_ignorado is not None:
        query = query.filter(models.Cartao.id != cartao_id_ignorado)

    return query.first() is not None


def validar_cartao_unico(
    db: Session,
    nome: str,
    cartao_id_ignorado: int | None = None,
):
    if existe_cartao_com_mesmo_nome(db, nome, cartao_id_ignorado):
        raise conflict("Ja existe um cartao com este nome.")
