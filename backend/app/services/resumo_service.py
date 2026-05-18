from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.utils.dates import primeiro_dia_do_mes, somar_meses, ultimo_dia_do_mes


def decimal_zero() -> Decimal:
    return Decimal("0.00")


def aplicar_filtro_periodo(query, data_inicio: date | None, data_fim: date | None):
    if data_inicio is not None:
        query = query.filter(models.Lancamento.data >= data_inicio)
    if data_fim is not None:
        query = query.filter(models.Lancamento.data <= data_fim)
    return query


def soma_por_tipo(
    db: Session,
    tipo: schemas.TipoLancamento,
    data_inicio: date | None = None,
    data_fim: date | None = None,
) -> Decimal:
    query = db.query(func.coalesce(func.sum(models.Lancamento.valor), 0)).filter(
        models.Lancamento.tipo == tipo
    )
    query = aplicar_filtro_periodo(query, data_inicio, data_fim)
    return Decimal(query.scalar() or 0)


def soma_por_tipo_em_periodo_seguro(
    db: Session,
    tipo: schemas.TipoLancamento,
    data_inicio: date,
    data_fim: date,
) -> Decimal:
    if data_inicio > data_fim:
        return decimal_zero()

    return soma_por_tipo(db, tipo, data_inicio, data_fim)


def contar_lancamentos(
    db: Session,
    data_inicio: date | None = None,
    data_fim: date | None = None,
) -> int:
    query = db.query(func.count(models.Lancamento.id))
    query = aplicar_filtro_periodo(query, data_inicio, data_fim)
    return int(query.scalar() or 0)


def resumo_por_categoria(
    db: Session,
    tipo: schemas.TipoLancamento,
    data_inicio: date | None = None,
    data_fim: date | None = None,
) -> list[schemas.ResumoPorCategoria]:
    query = (
        db.query(
            models.Categoria.nome.label("categoria"),
            func.coalesce(func.sum(models.Lancamento.valor), 0).label("total"),
        )
        .join(models.Categoria, models.Categoria.id == models.Lancamento.categoria_id)
        .filter(models.Lancamento.tipo == tipo)
        .group_by(models.Categoria.id, models.Categoria.nome)
        .order_by(func.sum(models.Lancamento.valor).desc())
    )
    query = aplicar_filtro_periodo(query, data_inicio, data_fim)

    return [
        schemas.ResumoPorCategoria(categoria=linha.categoria, total=Decimal(linha.total or 0))
        for linha in query.all()
    ]


def calcular_fluxo_mensal(
    db: Session,
    data_inicio: date | None = None,
    data_fim: date | None = None,
) -> list[schemas.FluxoMensalItem]:
    hoje = date.today()
    inicio_fluxo = somar_meses(primeiro_dia_do_mes(hoje), -5)
    fim_fluxo = ultimo_dia_do_mes(hoje)

    inicio_consulta = max(inicio_fluxo, data_inicio) if data_inicio else inicio_fluxo
    fim_consulta = min(fim_fluxo, data_fim) if data_fim else fim_fluxo

    totais_por_mes = {
        somar_meses(inicio_fluxo, indice).strftime("%Y-%m"): {
            "receitas": decimal_zero(),
            "despesas": decimal_zero(),
        }
        for indice in range(6)
    }

    if inicio_consulta > fim_consulta:
        return montar_fluxo_mensal_response(totais_por_mes)

    mes_sql = func.strftime("%Y-%m", models.Lancamento.data)
    query = (
        db.query(
            mes_sql.label("mes"),
            models.Lancamento.tipo.label("tipo"),
            func.coalesce(func.sum(models.Lancamento.valor), 0).label("total"),
        )
        .filter(models.Lancamento.data >= inicio_consulta)
        .filter(models.Lancamento.data <= fim_consulta)
        .group_by(mes_sql, models.Lancamento.tipo)
    )

    for linha in query.all():
        if linha.mes not in totais_por_mes:
            continue

        chave = "receitas" if linha.tipo == "receita" else "despesas"
        totais_por_mes[linha.mes][chave] = Decimal(linha.total or 0)

    return montar_fluxo_mensal_response(totais_por_mes)


def montar_fluxo_mensal_response(totais_por_mes: dict) -> list[schemas.FluxoMensalItem]:
    return [
        schemas.FluxoMensalItem(
            mes=mes,
            receitas=valores["receitas"],
            despesas=valores["despesas"],
            saldo=valores["receitas"] - valores["despesas"],
        )
        for mes, valores in totais_por_mes.items()
    ]


def obter_resumo_financeiro(
    db: Session,
    data_inicio: date | None = None,
    data_fim: date | None = None,
) -> schemas.ResumoFinanceiroResponse:
    hoje = date.today()
    inicio_mes_atual = primeiro_dia_do_mes(hoje)
    fim_mes_atual = ultimo_dia_do_mes(hoje)
    inicio_mes_filtrado = max(inicio_mes_atual, data_inicio) if data_inicio else inicio_mes_atual
    fim_mes_filtrado = min(fim_mes_atual, data_fim) if data_fim else fim_mes_atual

    total_receitas = soma_por_tipo(db, "receita", data_inicio, data_fim)
    total_despesas = soma_por_tipo(db, "despesa", data_inicio, data_fim)
    receitas_mes_atual = soma_por_tipo_em_periodo_seguro(
        db, "receita", inicio_mes_filtrado, fim_mes_filtrado
    )
    despesas_mes_atual = soma_por_tipo_em_periodo_seguro(
        db, "despesa", inicio_mes_filtrado, fim_mes_filtrado
    )

    return schemas.ResumoFinanceiroResponse(
        total_receitas=total_receitas,
        total_despesas=total_despesas,
        saldo=total_receitas - total_despesas,
        quantidade_lancamentos=contar_lancamentos(db, data_inicio, data_fim),
        mes_atual=schemas.ResumoMesAtual(
            receitas=receitas_mes_atual,
            despesas=despesas_mes_atual,
            saldo=receitas_mes_atual - despesas_mes_atual,
        ),
        despesas_por_categoria=resumo_por_categoria(db, "despesa", data_inicio, data_fim),
        receitas_por_categoria=resumo_por_categoria(db, "receita", data_inicio, data_fim),
        fluxo_mensal=calcular_fluxo_mensal(db, data_inicio, data_fim),
    )
