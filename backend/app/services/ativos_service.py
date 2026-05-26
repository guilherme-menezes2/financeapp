import os
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.services.yahoo_finance_client import YahooFinanceClient
from app.utils.errors import bad_request, conflict, not_found


def normalizar_ticker(ticker: str) -> str:
    return ticker.strip().upper()


def buscar_ativo_ou_404(db: Session, ativo_id: int) -> models.Ativo:
    ativo = db.query(models.Ativo).filter(models.Ativo.id == ativo_id).first()
    if ativo is None:
        raise not_found("Ativo nao encontrado.")
    return ativo


def existe_ativo_com_ticker(
    db: Session,
    ticker: str,
    ativo_id_ignorado: int | None = None,
) -> bool:
    query = db.query(models.Ativo).filter(func.lower(models.Ativo.ticker) == ticker.lower())

    if ativo_id_ignorado is not None:
        query = query.filter(models.Ativo.id != ativo_id_ignorado)

    return query.first() is not None


def validar_ticker_unico(
    db: Session,
    ticker: str,
    ativo_id_ignorado: int | None = None,
):
    if existe_ativo_com_ticker(db, ticker, ativo_id_ignorado):
        raise conflict("Ja existe um ativo cadastrado com este ticker.")


def calcular_resumo_carteira(ativos: list[models.Ativo]) -> dict:
    valor_investido_total = sum((ativo.valor_investido for ativo in ativos), Decimal("0"))
    patrimonio_total = sum(
        (ativo.valor_atual for ativo in ativos if ativo.valor_atual is not None),
        Decimal("0"),
    )
    lucro_prejuizo_total = patrimonio_total - valor_investido_total
    rentabilidade_percentual = Decimal("0")

    if valor_investido_total:
        rentabilidade_percentual = (lucro_prejuizo_total / valor_investido_total) * 100

    atualizacoes = [
        ativo.ultima_atualizacao for ativo in ativos if ativo.ultima_atualizacao is not None
    ]

    return {
        "patrimonio_total": patrimonio_total,
        "valor_investido_total": valor_investido_total,
        "lucro_prejuizo_total": lucro_prejuizo_total,
        "rentabilidade_percentual": rentabilidade_percentual,
        "quantidade_ativos": len(ativos),
        "ultima_atualizacao": max(atualizacoes) if atualizacoes else None,
    }


def criar_snapshot_carteira(db: Session) -> models.SnapshotCarteira:
    ativos = db.query(models.Ativo).all()
    resumo = calcular_resumo_carteira(ativos)
    hoje = date.today()

    snapshot = (
        db.query(models.SnapshotCarteira)
        .filter(models.SnapshotCarteira.data_referencia == hoje)
        .first()
    )

    if snapshot is None:
        snapshot = models.SnapshotCarteira(data_referencia=hoje)
        db.add(snapshot)

    snapshot.patrimonio_total = resumo["patrimonio_total"]
    snapshot.valor_investido_total = resumo["valor_investido_total"]
    snapshot.lucro_prejuizo_total = resumo["lucro_prejuizo_total"]
    snapshot.rentabilidade_percentual = resumo["rentabilidade_percentual"]
    snapshot.quantidade_ativos = resumo["quantidade_ativos"]

    return snapshot


def listar_snapshots_carteira(
    db: Session,
    limite: int = 90,
) -> list[models.SnapshotCarteira]:
    return (
        db.query(models.SnapshotCarteira)
        .order_by(models.SnapshotCarteira.data_referencia.desc())
        .limit(limite)
        .all()
    )[::-1]


def listar_movimentacoes_ativo(
    db: Session,
    ativo_id: int,
) -> list[models.MovimentacaoAtivo]:
    buscar_ativo_ou_404(db, ativo_id)
    return (
        db.query(models.MovimentacaoAtivo)
        .filter(models.MovimentacaoAtivo.ativo_id == ativo_id)
        .order_by(models.MovimentacaoAtivo.data.desc(), models.MovimentacaoAtivo.id.desc())
        .all()
    )


def buscar_movimentacao_ou_404(
    db: Session,
    movimentacao_id: int,
) -> models.MovimentacaoAtivo:
    movimentacao = (
        db.query(models.MovimentacaoAtivo)
        .filter(models.MovimentacaoAtivo.id == movimentacao_id)
        .first()
    )

    if movimentacao is None:
        raise not_found("Movimentacao de ativo nao encontrada.")

    return movimentacao


def criar_movimentacao_ativo(
    db: Session,
    ativo: models.Ativo,
    tipo: str,
    quantidade: Decimal,
    preco_unitario: Decimal,
    data_movimentacao: date,
    observacao: str | None = None,
) -> models.MovimentacaoAtivo:
    preco_medio_antes = ativo.preco_medio
    quantidade_antes = ativo.quantidade
    valor_total = quantidade * preco_unitario
    lucro_prejuizo = None
    ultima_movimentacao = (
        db.query(models.MovimentacaoAtivo)
        .filter(models.MovimentacaoAtivo.ativo_id == ativo.id)
        .order_by(models.MovimentacaoAtivo.data.desc(), models.MovimentacaoAtivo.id.desc())
        .first()
    )

    if ultima_movimentacao and data_movimentacao < ultima_movimentacao.data:
        raise bad_request(
            "Cadastre movimentacoes em ordem cronologica para manter o preco medio consistente."
        )

    if tipo == "compra":
        nova_quantidade = quantidade_antes + quantidade
        novo_preco_medio = (
            ((quantidade_antes * preco_medio_antes) + valor_total) / nova_quantidade
            if nova_quantidade
            else preco_unitario
        )
    elif tipo == "venda":
        if quantidade >= quantidade_antes:
            raise bad_request(
                "Nao e permitido vender quantidade igual ou maior que a posicao atual do ativo."
            )

        nova_quantidade = quantidade_antes - quantidade
        novo_preco_medio = preco_medio_antes
        lucro_prejuizo = (preco_unitario - preco_medio_antes) * quantidade
    else:
        raise bad_request("Tipo de movimentacao deve ser compra ou venda.")

    movimentacao = models.MovimentacaoAtivo(
        ativo_id=ativo.id,
        tipo=tipo,
        quantidade=quantidade,
        preco_unitario=preco_unitario,
        valor_total=valor_total,
        preco_medio_antes=preco_medio_antes,
        preco_medio_depois=novo_preco_medio,
        lucro_prejuizo=lucro_prejuizo,
        data=data_movimentacao,
        observacao=observacao,
    )

    ativo.quantidade = nova_quantidade
    ativo.preco_medio = novo_preco_medio
    db.add(movimentacao)
    return movimentacao


def excluir_movimentacao_ativo(
    db: Session,
    movimentacao: models.MovimentacaoAtivo,
) -> None:
    ativo = buscar_ativo_ou_404(db, movimentacao.ativo_id)
    ultima_movimentacao = (
        db.query(models.MovimentacaoAtivo)
        .filter(models.MovimentacaoAtivo.ativo_id == ativo.id)
        .order_by(models.MovimentacaoAtivo.data.desc(), models.MovimentacaoAtivo.id.desc())
        .first()
    )

    if ultima_movimentacao and ultima_movimentacao.id != movimentacao.id:
        raise bad_request(
            "Para manter a posicao consistente, exclua primeiro as movimentacoes mais recentes."
        )

    if movimentacao.tipo == "compra":
        if movimentacao.quantidade >= ativo.quantidade:
            raise bad_request(
                "Nao e possivel excluir esta compra porque a posicao atual ficaria negativa."
            )

        nova_quantidade = ativo.quantidade - movimentacao.quantidade
        custo_atual = ativo.quantidade * ativo.preco_medio
        custo_removido = movimentacao.quantidade * movimentacao.preco_unitario

        if nova_quantidade:
            ativo.preco_medio = (custo_atual - custo_removido) / nova_quantidade
        else:
            ativo.preco_medio = movimentacao.preco_medio_antes or ativo.preco_medio

        ativo.quantidade = nova_quantidade
    elif movimentacao.tipo == "venda":
        ativo.quantidade = ativo.quantidade + movimentacao.quantidade
        ativo.preco_medio = movimentacao.preco_medio_antes or ativo.preco_medio

    db.delete(movimentacao)


def atualizar_cotacao_ativo(
    db: Session,
    ativo: models.Ativo,
    force: bool = True,
) -> models.Ativo:
    if not force and cotacao_em_cache(ativo):
        return ativo

    quote = YahooFinanceClient().buscar_cotacao(ativo.ticker)
    agora = datetime.utcnow()

    ativo.ultimo_preco = quote.preco
    ativo.ultima_atualizacao = agora
    ativo.moeda = quote.moeda or ativo.moeda or "BRL"

    if quote.nome and (not ativo.nome or ativo.nome == ativo.ticker):
        ativo.nome = quote.nome
    if quote.tipo and not ativo.tipo:
        ativo.tipo = quote.tipo.lower()

    cotacao = models.CotacaoAtivo(
        ativo_id=ativo.id,
        ticker=ativo.ticker,
        preco=quote.preco,
        variacao=quote.variacao,
        variacao_percentual=quote.variacao_percentual,
        volume=quote.volume,
        data_referencia=agora,
        fonte="yahoo_finance",
    )

    db.add(cotacao)
    return ativo


def atualizar_todos_ativos(db: Session, force: bool = True) -> dict:
    ativos = db.query(models.Ativo).order_by(models.Ativo.ticker.asc()).all()
    atualizados = []
    falhas = []

    for ativo in ativos:
        try:
            atualizar_cotacao_ativo(db, ativo, force)
            db.commit()
            db.refresh(ativo)
            atualizados.append(ativo.ticker)
        except HTTPException as error:
            db.rollback()
            falhas.append({"ticker": ativo.ticker, "erro": error.detail})
        except Exception:
            db.rollback()
            falhas.append({"ticker": ativo.ticker, "erro": "Erro inesperado ao atualizar ativo."})

    if atualizados:
        try:
            criar_snapshot_carteira(db)
            db.commit()
        except Exception:
            db.rollback()

    resultado_proventos = atualizar_proventos_todos_ativos(db) if ativos else None

    return {
        "total_ativos": len(ativos),
        "atualizados": len(atualizados),
        "falhas": len(falhas),
        "tickers_atualizados": atualizados,
        "erros": falhas,
        "proventos_atualizados": resultado_proventos["atualizados"] if resultado_proventos else 0,
        "proventos_falhas": resultado_proventos["falhas"] if resultado_proventos else 0,
        "proventos_criados": resultado_proventos["total_proventos_criados"] if resultado_proventos else 0,
        "proventos_erros": resultado_proventos["erros"] if resultado_proventos else [],
    }


def listar_proventos(db: Session, ativo_id: int | None = None) -> list[models.ProventoAtivo]:
    data_referencia = func.coalesce(
        models.ProventoAtivo.data_com,
        models.ProventoAtivo.data_pagamento,
    )
    query = (
        db.query(models.ProventoAtivo)
        .join(models.Ativo)
        .filter(data_referencia >= models.Ativo.data_inicial)
    )

    if ativo_id is not None:
        query = query.filter(models.ProventoAtivo.ativo_id == ativo_id)

    return query.order_by(data_referencia.desc()).all()


def remover_proventos_antes_da_data_inicial(db: Session, ativo: models.Ativo) -> int:
    data_referencia = func.coalesce(
        models.ProventoAtivo.data_com,
        models.ProventoAtivo.data_pagamento,
    )
    proventos_antigos = (
        db.query(models.ProventoAtivo)
        .filter(
            models.ProventoAtivo.ativo_id == ativo.id,
            data_referencia < ativo.data_inicial,
        )
        .all()
    )

    for provento in proventos_antigos:
        db.delete(provento)

    return len(proventos_antigos)


def remover_proventos_yahoo(db: Session, ativo: models.Ativo) -> int:
    proventos = (
        db.query(models.ProventoAtivo)
        .filter(
            models.ProventoAtivo.ativo_id == ativo.id,
            models.ProventoAtivo.fonte == "yahoo_finance",
        )
        .all()
    )

    for provento in proventos:
        db.delete(provento)

    return len(proventos)


def atualizar_proventos_ativo(db: Session, ativo: models.Ativo) -> dict:
    proventos_yahoo = YahooFinanceClient().buscar_proventos(ativo.ticker)
    removidos = remover_proventos_yahoo(db, ativo)
    proventos_validos = [
        provento
        for provento in proventos_yahoo
        if (provento.data_pagamento.date() - timedelta(days=1)) >= ativo.data_inicial
    ]
    criados = 0

    for provento_yahoo in proventos_validos:
        data_com = provento_yahoo.data_pagamento.date() - timedelta(days=1)
        valor_por_cota = provento_yahoo.valor_por_cota

        provento = models.ProventoAtivo(
            ativo_id=ativo.id,
            ticker=ativo.ticker,
            tipo=provento_yahoo.tipo,
            data_com=data_com,
            data_pagamento=None,
            valor_por_cota=valor_por_cota,
            quantidade_base=ativo.quantidade,
            valor_estimado=valor_por_cota * ativo.quantidade,
            fonte="yahoo_finance",
        )
        db.add(provento)
        criados += 1

    return {
        "ticker": ativo.ticker,
        "proventos_encontrados": len(proventos_yahoo),
        "proventos_validos": len(proventos_validos),
        "proventos_ignorados": len(proventos_yahoo) - len(proventos_validos),
        "proventos_criados": criados,
        "proventos_removidos": removidos,
        "proventos_ajustados": 0,
    }


def atualizar_proventos_todos_ativos(db: Session) -> dict:
    ativos = db.query(models.Ativo).order_by(models.Ativo.ticker.asc()).all()
    atualizados = []
    falhas = []
    total_criados = 0

    for ativo in ativos:
        try:
            resultado = atualizar_proventos_ativo(db, ativo)
            db.commit()
            atualizados.append(resultado)
            total_criados += resultado["proventos_criados"]
        except HTTPException as error:
            db.rollback()
            falhas.append({"ticker": ativo.ticker, "erro": error.detail})
        except Exception:
            db.rollback()
            falhas.append({"ticker": ativo.ticker, "erro": "Erro inesperado ao atualizar proventos."})

    return {
        "total_ativos": len(ativos),
        "atualizados": len(atualizados),
        "falhas": len(falhas),
        "total_proventos_criados": total_criados,
        "resultados": atualizados,
        "erros": falhas,
    }


def cotacao_em_cache(ativo: models.Ativo) -> bool:
    if ativo.ultima_atualizacao is None:
        return False

    cache_minutos = int(os.getenv("INVESTIMENTOS_CACHE_MINUTES", "30"))
    limite_cache = datetime.utcnow() - timedelta(minutes=cache_minutos)
    return ativo.ultima_atualizacao >= limite_cache
