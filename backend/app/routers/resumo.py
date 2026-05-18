from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.services.resumo_service import obter_resumo_financeiro
from app.utils.dates import validar_periodo


router = APIRouter(prefix="/resumo", tags=["Resumo"])


@router.get("", response_model=schemas.ResumoFinanceiroResponse)
def obter_resumo(
    data_inicio: date | None = Query(default=None),
    data_fim: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    validar_periodo(data_inicio, data_fim)
    return obter_resumo_financeiro(db, data_inicio, data_fim)
