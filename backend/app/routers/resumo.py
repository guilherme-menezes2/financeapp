from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.services.resumo_service import obter_resumo_financeiro
from app.utils.dates import validar_periodo
from app.utils.errors import bad_request


router = APIRouter(prefix="/resumo", tags=["Resumo"])


@router.get("", response_model=schemas.ResumoFinanceiroResponse)
def obter_resumo(
    ultimos_meses: int | None = Query(default=None, ge=1, le=12),
    data_inicio: date | None = Query(default=None),
    data_fim: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    if ultimos_meses is not None and (data_inicio is not None or data_fim is not None):
        raise bad_request("Use ultimos_meses ou periodo personalizado, nao ambos.")

    validar_periodo(data_inicio, data_fim)
    return obter_resumo_financeiro(db, data_inicio, data_fim, ultimos_meses)
