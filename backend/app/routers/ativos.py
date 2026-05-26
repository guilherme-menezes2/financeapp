from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services.ativos_service import (
    atualizar_cotacao_ativo,
    atualizar_proventos_ativo,
    atualizar_proventos_todos_ativos,
    atualizar_todos_ativos,
    buscar_ativo_ou_404,
    calcular_resumo_carteira,
    criar_snapshot_carteira,
    criar_movimentacao_ativo,
    excluir_movimentacao_ativo,
    buscar_movimentacao_ou_404,
    listar_movimentacoes_ativo,
    listar_proventos,
    listar_snapshots_carteira,
    normalizar_ticker,
    remover_proventos_antes_da_data_inicial,
    validar_ticker_unico,
)


router = APIRouter(prefix="/ativos", tags=["Ativos"])


@router.get("/resumo", response_model=schemas.CarteiraResumoResponse)
def obter_resumo_carteira(db: Session = Depends(get_db)):
    ativos = db.query(models.Ativo).all()
    return calcular_resumo_carteira(ativos)


@router.post("/atualizar", response_model=schemas.AtualizacaoAtivosResponse)
def atualizar_cotacoes_ativos(
    force: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    return atualizar_todos_ativos(db, force)


@router.get("/proventos", response_model=list[schemas.ProventoAtivoResponse])
def listar_todos_proventos(db: Session = Depends(get_db)):
    return listar_proventos(db)


@router.post("/proventos/atualizar", response_model=schemas.AtualizacaoProventosResponse)
def atualizar_proventos_ativos(db: Session = Depends(get_db)):
    return atualizar_proventos_todos_ativos(db)


@router.get("/snapshots", response_model=list[schemas.SnapshotCarteiraResponse])
def listar_snapshots(
    limite: int = Query(default=90, ge=1, le=365),
    db: Session = Depends(get_db),
):
    return listar_snapshots_carteira(db, limite)


@router.post("/snapshots", response_model=schemas.SnapshotCarteiraResponse)
def registrar_snapshot(db: Session = Depends(get_db)):
    snapshot = criar_snapshot_carteira(db)
    db.commit()
    db.refresh(snapshot)
    return snapshot


@router.delete("/movimentacoes/{movimentacao_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_movimentacao(movimentacao_id: int, db: Session = Depends(get_db)):
    movimentacao = buscar_movimentacao_ou_404(db, movimentacao_id)
    excluir_movimentacao_ativo(db, movimentacao)
    db.commit()


@router.get("", response_model=list[schemas.AtivoResponse])
def listar_ativos(
    ticker: str | None = Query(default=None),
    tipo: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(models.Ativo)

    if ticker:
        query = query.filter(models.Ativo.ticker.contains(normalizar_ticker(ticker)))
    if tipo:
        query = query.filter(models.Ativo.tipo == tipo.strip().lower())

    return query.order_by(models.Ativo.ticker.asc()).all()


@router.get("/{ativo_id}", response_model=schemas.AtivoResponse)
def obter_ativo(ativo_id: int, db: Session = Depends(get_db)):
    return buscar_ativo_ou_404(db, ativo_id)


@router.get("/{ativo_id}/proventos", response_model=list[schemas.ProventoAtivoResponse])
def listar_proventos_ativo(ativo_id: int, db: Session = Depends(get_db)):
    buscar_ativo_ou_404(db, ativo_id)
    return listar_proventos(db, ativo_id)


@router.get("/{ativo_id}/movimentacoes", response_model=list[schemas.MovimentacaoAtivoResponse])
def listar_movimentacoes(ativo_id: int, db: Session = Depends(get_db)):
    return listar_movimentacoes_ativo(db, ativo_id)


@router.post(
    "/{ativo_id}/movimentacoes",
    response_model=schemas.MovimentacaoAtivoResponse,
    status_code=status.HTTP_201_CREATED,
)
def criar_movimentacao(
    ativo_id: int,
    movimentacao: schemas.MovimentacaoAtivoCreate,
    db: Session = Depends(get_db),
):
    ativo = buscar_ativo_ou_404(db, ativo_id)
    nova_movimentacao = criar_movimentacao_ativo(
        db=db,
        ativo=ativo,
        tipo=movimentacao.tipo,
        quantidade=movimentacao.quantidade,
        preco_unitario=movimentacao.preco_unitario,
        data_movimentacao=movimentacao.data,
        observacao=movimentacao.observacao,
    )
    db.commit()
    db.refresh(nova_movimentacao)
    return nova_movimentacao


@router.post("/{ativo_id}/atualizar", response_model=schemas.AtivoResponse)
def atualizar_cotacao_ativo_endpoint(
    ativo_id: int,
    force: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    ativo = buscar_ativo_ou_404(db, ativo_id)
    atualizar_cotacao_ativo(db, ativo, force)
    db.commit()
    db.refresh(ativo)
    return ativo


@router.post("/{ativo_id}/proventos/atualizar", response_model=schemas.AtualizacaoProventoAtivoResponse)
def atualizar_proventos_ativo_endpoint(ativo_id: int, db: Session = Depends(get_db)):
    ativo = buscar_ativo_ou_404(db, ativo_id)
    resultado = atualizar_proventos_ativo(db, ativo)
    db.commit()
    return resultado


@router.post("", response_model=schemas.AtivoResponse, status_code=status.HTTP_201_CREATED)
def criar_ativo(ativo: schemas.AtivoCreate, db: Session = Depends(get_db)):
    ticker = normalizar_ticker(ativo.ticker)
    validar_ticker_unico(db, ticker)

    novo_ativo = models.Ativo(
        ticker=ticker,
        nome=ativo.nome or ticker,
        tipo=ativo.tipo.lower() if ativo.tipo else None,
        quantidade=ativo.quantidade,
        preco_medio=ativo.preco_medio,
        data_inicial=ativo.data_inicial,
        moeda="BRL",
    )

    db.add(novo_ativo)
    db.commit()
    db.refresh(novo_ativo)
    return novo_ativo


@router.put("/{ativo_id}", response_model=schemas.AtivoResponse)
def atualizar_ativo(
    ativo_id: int,
    dados_ativo: schemas.AtivoUpdate,
    db: Session = Depends(get_db),
):
    ativo = buscar_ativo_ou_404(db, ativo_id)
    dados = dados_ativo.model_dump(exclude_unset=True)

    novo_ticker = normalizar_ticker(dados["ticker"]) if "ticker" in dados else ativo.ticker
    validar_ticker_unico(db, novo_ticker, ativo_id)

    if "ticker" in dados:
        ativo.ticker = novo_ticker
        if not ativo.nome:
            ativo.nome = novo_ticker
    if "nome" in dados:
        ativo.nome = dados["nome"] or novo_ticker
    if "tipo" in dados:
        ativo.tipo = dados["tipo"].lower() if dados["tipo"] else None
    if "quantidade" in dados:
        ativo.quantidade = dados["quantidade"]
    if "preco_medio" in dados:
        ativo.preco_medio = dados["preco_medio"]
    if "data_inicial" in dados:
        ativo.data_inicial = dados["data_inicial"]
        remover_proventos_antes_da_data_inicial(db, ativo)

    db.commit()
    db.refresh(ativo)
    return ativo


@router.delete("/{ativo_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_ativo(ativo_id: int, db: Session = Depends(get_db)):
    ativo = buscar_ativo_ou_404(db, ativo_id)
    db.delete(ativo)
    db.commit()
