import calendar
import html
import os
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.services.yahoo_finance_client import YahooFinanceClient, YahooProvento
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


def listar_movimentacoes_ordenadas(
    db: Session,
    ativo_id: int,
) -> list[models.MovimentacaoAtivo]:
    return (
        db.query(models.MovimentacaoAtivo)
        .filter(models.MovimentacaoAtivo.ativo_id == ativo_id)
        .order_by(models.MovimentacaoAtivo.data.asc(), models.MovimentacaoAtivo.id.asc())
        .all()
    )


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


def primeiro_dia_mes(data_referencia: date) -> date:
    return date(data_referencia.year, data_referencia.month, 1)


def ultimo_dia_mes(data_referencia: date) -> date:
    ultimo_dia = calendar.monthrange(data_referencia.year, data_referencia.month)[1]
    return date(data_referencia.year, data_referencia.month, ultimo_dia)


def listar_meses(inicio: date, fim: date) -> list[date]:
    meses = []
    mes_atual = primeiro_dia_mes(inicio)
    mes_fim = primeiro_dia_mes(fim)

    while mes_atual <= mes_fim:
        meses.append(mes_atual)
        if mes_atual.month == 12:
            mes_atual = date(mes_atual.year + 1, 1, 1)
        else:
            mes_atual = date(mes_atual.year, mes_atual.month + 1, 1)

    return meses


def obter_primeira_compra_carteira(db: Session) -> date | None:
    return (
        db.query(func.min(models.MovimentacaoAtivo.data))
        .filter(models.MovimentacaoAtivo.tipo == "compra")
        .scalar()
    )


def calcular_posicao_ativo_na_data(
    db: Session,
    ativo_id: int,
    data_referencia: date,
) -> dict:
    quantidade_atual = Decimal("0")
    preco_medio_atual = Decimal("0")

    for movimentacao in listar_movimentacoes_ordenadas(db, ativo_id):
        if movimentacao.data > data_referencia:
            break

        quantidade = Decimal(movimentacao.quantidade)
        preco_unitario = Decimal(movimentacao.preco_unitario)

        if movimentacao.tipo == "compra":
            valor_total = quantidade * preco_unitario
            nova_quantidade = quantidade_atual + quantidade
            preco_medio_atual = (
                ((quantidade_atual * preco_medio_atual) + valor_total) / nova_quantidade
                if nova_quantidade
                else Decimal("0")
            )
            quantidade_atual = nova_quantidade
        elif movimentacao.tipo == "venda":
            quantidade_atual = max(quantidade_atual - quantidade, Decimal("0"))
            if quantidade_atual == 0:
                preco_medio_atual = Decimal("0")
        elif movimentacao.tipo == "split":
            if not movimentacao.fator_numerador or not movimentacao.fator_denominador:
                continue
            fator = Decimal(movimentacao.fator_numerador) / Decimal(movimentacao.fator_denominador)
            if fator:
                quantidade_atual *= fator
                preco_medio_atual = preco_medio_atual / fator

    return {
        "quantidade": quantidade_atual,
        "preco_medio": preco_medio_atual,
        "valor_investido": quantidade_atual * preco_medio_atual,
    }


def calcular_fator_splits_posteriores(
    db: Session,
    ativo_id: int,
    data_referencia: date,
) -> Decimal:
    fator_acumulado = Decimal("1")
    splits = (
        db.query(models.MovimentacaoAtivo)
        .filter(
            models.MovimentacaoAtivo.ativo_id == ativo_id,
            models.MovimentacaoAtivo.tipo == "split",
            models.MovimentacaoAtivo.data > data_referencia,
        )
        .order_by(models.MovimentacaoAtivo.data.asc(), models.MovimentacaoAtivo.id.asc())
        .all()
    )

    for split in splits:
        if not split.fator_numerador or not split.fator_denominador:
            continue
        fator_acumulado *= Decimal(split.fator_numerador) / Decimal(split.fator_denominador)

    return fator_acumulado


def atualizar_cache_cotacoes_historicas_ativo(
    db: Session,
    ativo: models.Ativo,
    data_inicio: date,
    data_fim: date,
) -> int:
    precos = YahooFinanceClient().buscar_precos_historicos(
        ativo.ticker,
        data_inicio,
        data_fim,
    )
    criados = 0

    for preco in precos:
        cotacao = (
            db.query(models.CotacaoHistoricaAtivo)
            .filter(
                models.CotacaoHistoricaAtivo.ativo_id == ativo.id,
                models.CotacaoHistoricaAtivo.data_referencia == preco.data_referencia,
            )
            .first()
        )

        if cotacao is None:
            cotacao = models.CotacaoHistoricaAtivo(
                ativo_id=ativo.id,
                ticker=ativo.ticker,
                data_referencia=preco.data_referencia,
                fonte="yahoo_finance",
            )
            db.add(cotacao)
            criados += 1

        cotacao.ticker = ativo.ticker
        cotacao.preco_fechamento = preco.fechamento

    return criados


def ativo_tem_cache_historico(
    db: Session,
    ativo_id: int,
    data_inicio: date,
    data_fim: date,
) -> bool:
    return (
        db.query(models.CotacaoHistoricaAtivo.id)
        .filter(
            models.CotacaoHistoricaAtivo.ativo_id == ativo_id,
            models.CotacaoHistoricaAtivo.data_referencia >= data_inicio,
            models.CotacaoHistoricaAtivo.data_referencia <= data_fim,
        )
        .first()
        is not None
    )


def obter_ultima_cotacao_historica_no_mes(
    db: Session,
    ativo_id: int,
    data_mes: date,
) -> models.CotacaoHistoricaAtivo | None:
    inicio_mes = primeiro_dia_mes(data_mes)
    fim_mes = min(ultimo_dia_mes(data_mes), date.today())

    return (
        db.query(models.CotacaoHistoricaAtivo)
        .filter(
            models.CotacaoHistoricaAtivo.ativo_id == ativo_id,
            models.CotacaoHistoricaAtivo.data_referencia >= inicio_mes,
            models.CotacaoHistoricaAtivo.data_referencia <= fim_mes,
        )
        .order_by(models.CotacaoHistoricaAtivo.data_referencia.desc())
        .first()
    )


def calcular_evolucao_real_carteira(
    db: Session,
    atualizar_cache: bool = False,
) -> dict:
    data_primeira_compra = obter_primeira_compra_carteira(db)
    agora = datetime.utcnow()
    if data_primeira_compra is None:
        return {
            "dados": [],
            "avisos": ["Cadastre movimentacoes de compra para calcular a evolucao da carteira."],
            "atualizado_em": agora,
        }

    hoje = date.today()
    ativos = db.query(models.Ativo).order_by(models.Ativo.ticker.asc()).all()
    avisos = []
    cotacoes_ausentes: dict[str, list[str]] = {}

    for ativo in ativos:
        tem_compra = (
            db.query(models.MovimentacaoAtivo.id)
            .filter(
                models.MovimentacaoAtivo.ativo_id == ativo.id,
                models.MovimentacaoAtivo.tipo == "compra",
            )
            .first()
            is not None
        )
        if not tem_compra:
            continue

        if atualizar_cache or not ativo_tem_cache_historico(db, ativo.id, data_primeira_compra, hoje):
            try:
                atualizar_cache_cotacoes_historicas_ativo(db, ativo, data_primeira_compra, hoje)
                db.flush()
            except HTTPException as error:
                avisos.append(f"{ativo.ticker}: {error.detail}")
            except Exception:
                avisos.append(f"{ativo.ticker}: nao foi possivel atualizar cotacoes historicas.")

    dados = []
    for mes in listar_meses(data_primeira_compra, hoje):
        patrimonio_total = Decimal("0")
        valor_investido_total = Decimal("0")
        quantidade_ativos = 0
        data_referencia_mes = None

        for ativo in ativos:
            cotacao = obter_ultima_cotacao_historica_no_mes(db, ativo.id, mes)
            data_posicao = cotacao.data_referencia if cotacao else min(ultimo_dia_mes(mes), hoje)
            posicao = calcular_posicao_ativo_na_data(db, ativo.id, data_posicao)
            quantidade = posicao["quantidade"]

            if quantidade <= 0:
                continue
            if cotacao is None:
                cotacoes_ausentes.setdefault(ativo.ticker, []).append(mes.strftime("%Y-%m"))
                continue

            fator_splits_posteriores = calcular_fator_splits_posteriores(
                db,
                ativo.id,
                cotacao.data_referencia,
            )
            preco_fechamento_ajustado = Decimal(cotacao.preco_fechamento) * fator_splits_posteriores

            patrimonio_total += quantidade * preco_fechamento_ajustado
            valor_investido_total += posicao["valor_investido"]
            quantidade_ativos += 1
            if data_referencia_mes is None or cotacao.data_referencia > data_referencia_mes:
                data_referencia_mes = cotacao.data_referencia

        lucro_prejuizo_total = patrimonio_total - valor_investido_total
        rentabilidade_percentual = (
            (lucro_prejuizo_total / valor_investido_total) * Decimal("100")
            if valor_investido_total
            else Decimal("0")
        )

        dados.append(
            {
                "mes": mes.strftime("%Y-%m"),
                "data_referencia": data_referencia_mes,
                "patrimonio_total": patrimonio_total,
                "valor_investido_total": valor_investido_total,
                "lucro_prejuizo_total": lucro_prejuizo_total,
                "rentabilidade_percentual": rentabilidade_percentual,
                "quantidade_ativos": quantidade_ativos,
            }
        )

    for ticker, meses_ausentes in cotacoes_ausentes.items():
        if not meses_ausentes:
            continue

        primeiro_mes = meses_ausentes[0]
        ultimo_mes = meses_ausentes[-1]
        periodo = primeiro_mes if primeiro_mes == ultimo_mes else f"{primeiro_mes} a {ultimo_mes}"
        avisos.append(
            f"{ticker}: Yahoo Finance nao retornou cotacoes historicas para {periodo}; "
            "esses meses foram calculados sem esse ativo."
        )

    return {
        "dados": dados,
        "avisos": sorted(set(avisos)),
        "atualizado_em": agora,
    }


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


def recalcular_movimentacoes_e_posicao(
    ativo: models.Ativo,
    movimentacoes: list[models.MovimentacaoAtivo],
) -> None:
    quantidade_atual = Decimal("0")
    preco_medio_atual = Decimal("0")

    for movimentacao in movimentacoes:
        quantidade = Decimal(movimentacao.quantidade)
        preco_unitario = Decimal(movimentacao.preco_unitario)
        valor_total = quantidade * preco_unitario

        movimentacao.valor_total = Decimal("0") if movimentacao.tipo == "split" else valor_total
        movimentacao.preco_medio_antes = preco_medio_atual

        if movimentacao.tipo == "compra":
            nova_quantidade = quantidade_atual + quantidade
            novo_preco_medio = (
                ((quantidade_atual * preco_medio_atual) + valor_total) / nova_quantidade
                if nova_quantidade
                else Decimal("0")
            )
            movimentacao.lucro_prejuizo = None
        elif movimentacao.tipo == "venda":
            if quantidade > quantidade_atual:
                raise bad_request(
                    f"A movimentacao em {movimentacao.data} deixa a posicao do ativo negativa."
                )

            nova_quantidade = quantidade_atual - quantidade
            novo_preco_medio = preco_medio_atual if nova_quantidade else Decimal("0")
            movimentacao.lucro_prejuizo = (
                (preco_unitario - preco_medio_atual) * quantidade
                if quantidade_atual
                else Decimal("0")
            )
        elif movimentacao.tipo == "split":
            if quantidade_atual <= 0:
                raise bad_request(
                    f"O split em {movimentacao.data} nao pode ser aplicado sem posicao anterior."
                )

            if not movimentacao.fator_numerador or not movimentacao.fator_denominador:
                raise bad_request("Split exige fator numerador e denominador.")

            fator = Decimal(movimentacao.fator_numerador) / Decimal(movimentacao.fator_denominador)
            nova_quantidade = quantidade_atual * fator
            novo_preco_medio = (
                preco_medio_atual / fator
                if fator
                else Decimal("0")
            )
            movimentacao.quantidade = Decimal("0")
            movimentacao.preco_unitario = Decimal("0")
            movimentacao.valor_total = Decimal("0")
            movimentacao.lucro_prejuizo = None
        else:
            raise bad_request("Tipo de movimentacao deve ser compra, venda ou split.")

        movimentacao.preco_medio_depois = novo_preco_medio
        quantidade_atual = nova_quantidade
        preco_medio_atual = novo_preco_medio

    ativo.quantidade = quantidade_atual
    ativo.preco_medio = preco_medio_atual


def obter_quantidade_ativo_na_data(
    db: Session,
    ativo_id: int,
    data_referencia: date,
) -> Decimal:
    quantidade = Decimal("0")

    for movimentacao in listar_movimentacoes_ordenadas(db, ativo_id):
        if movimentacao.data > data_referencia:
            break

        if movimentacao.tipo == "compra":
            quantidade += Decimal(movimentacao.quantidade)
        elif movimentacao.tipo == "venda":
            quantidade -= Decimal(movimentacao.quantidade)
        elif movimentacao.tipo == "split":
            if not movimentacao.fator_numerador or not movimentacao.fator_denominador:
                continue
            fator = Decimal(movimentacao.fator_numerador) / Decimal(movimentacao.fator_denominador)
            quantidade *= fator

    return max(quantidade, Decimal("0"))


def obter_fator_splits_posteriores(
    db: Session,
    ativo_id: int,
    data_referencia: date,
) -> Decimal:
    fator_total = Decimal("1")

    for movimentacao in listar_movimentacoes_ordenadas(db, ativo_id):
        if movimentacao.tipo != "split":
            continue
        if movimentacao.data <= data_referencia:
            continue
        if not movimentacao.fator_numerador or not movimentacao.fator_denominador:
            continue

        fator_total *= Decimal(movimentacao.fator_numerador) / Decimal(movimentacao.fator_denominador)

    return fator_total


def listar_splits_posteriores(
    db: Session,
    ativo_id: int,
    data_referencia: date,
) -> list[models.MovimentacaoAtivo]:
    return [
        movimentacao
        for movimentacao in listar_movimentacoes_ordenadas(db, ativo_id)
        if movimentacao.tipo == "split" and movimentacao.data > data_referencia
    ]


def calcular_mediana_decimal(valores: list[Decimal]) -> Decimal | None:
    if not valores:
        return None

    valores_ordenados = sorted(valores)
    meio = len(valores_ordenados) // 2

    if len(valores_ordenados) % 2 == 1:
        return valores_ordenados[meio]

    return (valores_ordenados[meio - 1] + valores_ordenados[meio]) / 2


def ajustar_valor_por_cota_com_splits(
    db: Session,
    ativo_id: int,
    data_com: date,
    valor_por_cota: Decimal,
    proventos_yahoo,
) -> Decimal:
    splits_posteriores = listar_splits_posteriores(db, ativo_id, data_com)
    if not splits_posteriores:
        return valor_por_cota

    fator_ajuste = Decimal("1")
    for split in splits_posteriores:
        if not split.fator_numerador or not split.fator_denominador:
            continue
        fator_ajuste *= Decimal(split.fator_numerador) / Decimal(split.fator_denominador)

    if fator_ajuste == Decimal("1"):
        return valor_por_cota

    ultima_data_split = max(split.data for split in splits_posteriores)
    referencias = [
        Decimal(provento.valor_por_cota)
        for provento in proventos_yahoo
        if obter_data_com_yahoo(provento) >= ultima_data_split
    ]
    mediana_referencia = calcular_mediana_decimal(referencias)
    if mediana_referencia is None:
        return valor_por_cota * fator_ajuste

    limite_valor_ajustado = mediana_referencia * ((fator_ajuste + Decimal("1")) / Decimal("2"))
    if valor_por_cota <= limite_valor_ajustado:
        return valor_por_cota * fator_ajuste

    return valor_por_cota


def normalizar_valor_por_cota_por_contexto(
    valor_por_cota: Decimal,
    referencias: list[Decimal],
) -> Decimal:
    mediana_referencia = calcular_mediana_decimal([valor for valor in referencias if valor > 0])
    if mediana_referencia is None or mediana_referencia <= 0:
        return valor_por_cota

    margem_tolerancia = Decimal("0.35")
    fator_decimal = Decimal("10")

    if valor_por_cota <= mediana_referencia / Decimal("5"):
        candidato = valor_por_cota * fator_decimal
        diferenca_relativa = abs(candidato - mediana_referencia) / mediana_referencia
        if diferenca_relativa <= margem_tolerancia:
            return candidato

    if valor_por_cota >= mediana_referencia * Decimal("5"):
        candidato = valor_por_cota / fator_decimal
        diferenca_relativa = abs(candidato - mediana_referencia) / mediana_referencia
        if diferenca_relativa <= margem_tolerancia:
            return candidato

    return valor_por_cota


def ajustar_valor_por_cota_por_contexto(
    db: Session,
    ativo_id: int,
    proventos_yahoo,
    indice_atual: int,
    data_com_atual: date,
    valor_por_cota: Decimal,
) -> Decimal:
    fator_split_atual = obter_fator_splits_posteriores(db, ativo_id, data_com_atual)
    indices_contexto = []
    if indice_atual - 1 >= 0:
        indices_contexto.append(indice_atual - 1)
    if indice_atual - 2 >= 0:
        indices_contexto.append(indice_atual - 2)
    if indice_atual + 1 < len(proventos_yahoo):
        indices_contexto.append(indice_atual + 1)
    if indice_atual + 2 < len(proventos_yahoo):
        indices_contexto.append(indice_atual + 2)

    referencias = []
    for indice in indices_contexto:
        provento_contexto = proventos_yahoo[indice]
        data_com_contexto = obter_data_com_yahoo(provento_contexto)
        fator_split_contexto = obter_fator_splits_posteriores(db, ativo_id, data_com_contexto)
        if fator_split_contexto != fator_split_atual:
            continue
        referencias.append(
            ajustar_valor_por_cota_com_splits(
                db,
                ativo_id,
                data_com_contexto,
                Decimal(provento_contexto.valor_por_cota),
                proventos_yahoo,
            )
        )

    return normalizar_valor_por_cota_por_contexto(valor_por_cota, referencias)


def obter_data_com_yahoo(provento) -> date:
    return provento.data_pagamento.date()


def ativo_eh_fii(ativo: models.Ativo) -> bool:
    tipo = (ativo.tipo or "").strip().lower()
    ticker = (ativo.ticker or "").strip().upper()
    return tipo == "fii" or ticker.endswith("11")


def limpar_html(texto: str) -> str:
    sem_tags = re.sub(r"<[^>]+>", "", texto)
    return " ".join(html.unescape(sem_tags).split())


def buscar_proventos_complementares_stockanalysis(ticker: str) -> list[YahooProvento]:
    url = f"https://stockanalysis.com/quote/bvmf/{ticker.upper()}/dividend/"
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})

    try:
        with urlopen(request, timeout=20) as response:
            conteudo = response.read().decode("utf-8", errors="ignore")
    except (HTTPError, URLError, TimeoutError):
        return []

    proventos = []
    for linha in re.findall(r"<tr[^>]*>(.*?)</tr>", conteudo, flags=re.DOTALL | re.IGNORECASE):
        colunas = [
            limpar_html(coluna)
            for coluna in re.findall(r"<td[^>]*>(.*?)</td>", linha, flags=re.DOTALL | re.IGNORECASE)
        ]
        if len(colunas) < 2:
            continue

        try:
            data_provento = datetime.strptime(colunas[0], "%b %d, %Y").replace(tzinfo=timezone.utc)
            valor = Decimal(colunas[1].replace("BRL", "").strip())
        except (ValueError, ArithmeticError):
            continue

        proventos.append(
            YahooProvento(
                ticker=ticker.upper(),
                tipo="dividendo",
                data_pagamento=data_provento,
                valor_por_cota=valor,
            )
        )

    return sorted(proventos, key=lambda provento: provento.data_pagamento, reverse=True)


def combinar_proventos_por_data_e_valor(*listas_proventos: list[YahooProvento]) -> list[YahooProvento]:
    mapa = {}

    for lista in listas_proventos:
        for provento in lista:
            chave = (obter_data_com_yahoo(provento), Decimal(provento.valor_por_cota).quantize(Decimal("0.000001")))
            mapa[chave] = provento

    return sorted(mapa.values(), key=lambda provento: provento.data_pagamento, reverse=True)


def existe_split_mesmo_evento(
    db: Session,
    ativo_id: int,
    data_evento: date,
    fator_numerador: int,
    fator_denominador: int,
) -> bool:
    return (
        db.query(models.MovimentacaoAtivo)
        .filter(
            models.MovimentacaoAtivo.ativo_id == ativo_id,
            models.MovimentacaoAtivo.tipo == "split",
            models.MovimentacaoAtivo.data == data_evento,
            models.MovimentacaoAtivo.fator_numerador == fator_numerador,
            models.MovimentacaoAtivo.fator_denominador == fator_denominador,
        )
        .first()
        is not None
    )


def remover_splits_yahoo(db: Session, ativo: models.Ativo) -> int:
    splits = (
        db.query(models.MovimentacaoAtivo)
        .filter(
            models.MovimentacaoAtivo.ativo_id == ativo.id,
            models.MovimentacaoAtivo.tipo == "split",
            models.MovimentacaoAtivo.observacao.like("Split importado do Yahoo Finance%"),
        )
        .all()
    )

    for split in splits:
        db.delete(split)

    return len(splits)


def recalcular_proventos_existentes_ativo(
    db: Session,
    ativo: models.Ativo,
) -> None:
    proventos = (
        db.query(models.ProventoAtivo)
        .filter(models.ProventoAtivo.ativo_id == ativo.id)
        .all()
    )

    for provento in proventos:
        data_base = provento.data_com or provento.data_pagamento
        if data_base is None or data_base < ativo.data_inicial:
            db.delete(provento)
            continue

        quantidade_base = obter_quantidade_ativo_na_data(db, ativo.id, data_base)
        if quantidade_base <= 0:
            db.delete(provento)
            continue

        provento.quantidade_base = quantidade_base
        provento.valor_estimado = provento.valor_por_cota * quantidade_base


def ativo_possui_splits(db: Session, ativo_id: int) -> bool:
    return (
        db.query(models.MovimentacaoAtivo.id)
        .filter(
            models.MovimentacaoAtivo.ativo_id == ativo_id,
            models.MovimentacaoAtivo.tipo == "split",
        )
        .first()
        is not None
    )


def sincronizar_eventos_historicos_ativo(
    db: Session,
    ativo: models.Ativo,
    incluir_splits_automaticos: bool = True,
    reimportar_proventos: bool = False,
) -> None:
    recalcular_movimentacoes_e_posicao(ativo, listar_movimentacoes_ordenadas(db, ativo.id))
    resultado_splits = None

    if incluir_splits_automaticos:
        resultado_splits = atualizar_splits_ativo(db, ativo)
        recalcular_movimentacoes_e_posicao(ativo, listar_movimentacoes_ordenadas(db, ativo.id))

    if (
        reimportar_proventos
        or ativo_possui_splits(db, ativo.id)
        or (
        resultado_splits and (resultado_splits["splits_criados"] or resultado_splits["splits_removidos"])
        )
    ):
        atualizar_proventos_ativo(db, ativo)
    else:
        recalcular_proventos_existentes_ativo(db, ativo)


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
    quantidade: Decimal | None,
    preco_unitario: Decimal | None,
    data_movimentacao: date,
    fator_numerador: int | None = None,
    fator_denominador: int | None = None,
    observacao: str | None = None,
    sincronizar_splits_automaticos: bool = True,
    sincronizar_historico: bool = True,
) -> models.MovimentacaoAtivo:
    if tipo == "split":
        if fator_numerador is None or fator_denominador is None:
            raise bad_request("Informe o fator numerador e denominador do split.")
        if fator_numerador <= 0 or fator_denominador <= 0:
            raise bad_request("O fator do split deve ser maior que zero.")
        if obter_quantidade_ativo_na_data(db, ativo.id, data_movimentacao) <= 0:
            raise bad_request("Nao e possivel registrar split sem posicao do ativo na data informada.")
        quantidade_movimentacao = Decimal("0")
        preco_movimentacao = Decimal("0")
    else:
        if quantidade is None or preco_unitario is None:
            raise bad_request("Compra e venda exigem quantidade e preco unitario.")
        quantidade_movimentacao = quantidade
        preco_movimentacao = preco_unitario

    movimentacao = models.MovimentacaoAtivo(
        ativo_id=ativo.id,
        tipo=tipo,
        quantidade=quantidade_movimentacao,
        preco_unitario=preco_movimentacao,
        valor_total=quantidade_movimentacao * preco_movimentacao,
        fator_numerador=fator_numerador,
        fator_denominador=fator_denominador,
        data=data_movimentacao,
        observacao=observacao,
    )

    db.add(movimentacao)
    db.flush()

    if sincronizar_historico:
        sincronizar_eventos_historicos_ativo(
            db,
            ativo,
            incluir_splits_automaticos=sincronizar_splits_automaticos and tipo != "split",
            reimportar_proventos=tipo == "split",
        )
    return movimentacao


def atualizar_movimentacao_ativo(
    db: Session,
    movimentacao: models.MovimentacaoAtivo,
    tipo: str,
    quantidade: Decimal | None,
    preco_unitario: Decimal | None,
    data_movimentacao: date,
    fator_numerador: int | None = None,
    fator_denominador: int | None = None,
    observacao: str | None = None,
    sincronizar_splits_automaticos: bool = True,
) -> models.MovimentacaoAtivo:
    ativo = buscar_ativo_ou_404(db, movimentacao.ativo_id)
    tipo_anterior = movimentacao.tipo
    movimentacao.tipo = tipo
    if tipo == "split":
        if fator_numerador is None or fator_denominador is None:
            raise bad_request("Informe o fator numerador e denominador do split.")
        if fator_numerador <= 0 or fator_denominador <= 0:
            raise bad_request("O fator do split deve ser maior que zero.")
        movimentacao.quantidade = Decimal("0")
        movimentacao.preco_unitario = Decimal("0")
        movimentacao.fator_numerador = fator_numerador
        movimentacao.fator_denominador = fator_denominador
    else:
        if quantidade is None or preco_unitario is None:
            raise bad_request("Compra e venda exigem quantidade e preco unitario.")
        movimentacao.quantidade = quantidade
        movimentacao.preco_unitario = preco_unitario
        movimentacao.fator_numerador = None
        movimentacao.fator_denominador = None
    movimentacao.data = data_movimentacao
    movimentacao.observacao = observacao
    db.flush()
    sincronizar_eventos_historicos_ativo(
        db,
        ativo,
        incluir_splits_automaticos=sincronizar_splits_automaticos and tipo != "split",
        reimportar_proventos=tipo == "split" or tipo_anterior == "split",
    )
    return movimentacao


def excluir_movimentacao_ativo(
    db: Session,
    movimentacao: models.MovimentacaoAtivo,
) -> None:
    ativo = buscar_ativo_ou_404(db, movimentacao.ativo_id)
    db.delete(movimentacao)
    db.flush()
    sincronizar_eventos_historicos_ativo(
        db,
        ativo,
        incluir_splits_automaticos=movimentacao.tipo != "split",
        reimportar_proventos=movimentacao.tipo == "split",
    )


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


def atualizar_splits_ativo(db: Session, ativo: models.Ativo) -> dict:
    splits_yahoo = YahooFinanceClient().buscar_splits(ativo.ticker)
    removidos = remover_splits_yahoo(db, ativo)
    db.flush()
    recalcular_movimentacoes_e_posicao(ativo, listar_movimentacoes_ordenadas(db, ativo.id))
    criados = 0
    ignorados = removidos

    for split in sorted(splits_yahoo, key=lambda evento: evento.data_evento):
        data_evento = split.data_evento.date()
        if data_evento < ativo.data_inicial:
            ignorados += 1
            continue
        if obter_quantidade_ativo_na_data(db, ativo.id, data_evento) <= 0:
            ignorados += 1
            continue
        if existe_split_mesmo_evento(
            db,
            ativo.id,
            data_evento,
            split.numerador,
            split.denominador,
        ):
            ignorados += 1
            continue

        criar_movimentacao_ativo(
            db=db,
            ativo=ativo,
            tipo="split",
            quantidade=None,
            preco_unitario=None,
            data_movimentacao=data_evento,
            fator_numerador=split.numerador,
            fator_denominador=split.denominador,
            observacao=f"Split importado do Yahoo Finance ({split.numerador}:{split.denominador})",
            sincronizar_splits_automaticos=False,
            sincronizar_historico=False,
        )
        criados += 1

    recalcular_movimentacoes_e_posicao(ativo, listar_movimentacoes_ordenadas(db, ativo.id))

    return {
        "ticker": ativo.ticker,
        "splits_encontrados": len(splits_yahoo),
        "splits_criados": criados,
        "splits_ignorados": ignorados,
        "splits_removidos": removidos,
    }


def atualizar_splits_todos_ativos(db: Session) -> dict:
    ativos = db.query(models.Ativo).order_by(models.Ativo.ticker.asc()).all()
    atualizados = []
    falhas = []
    total_criados = 0

    for ativo in ativos:
        try:
            resultado = atualizar_splits_ativo(db, ativo)
            db.commit()
            atualizados.append(resultado)
            total_criados += resultado["splits_criados"]
        except HTTPException as error:
            db.rollback()
            falhas.append({"ticker": ativo.ticker, "erro": error.detail})
        except Exception:
            db.rollback()
            falhas.append({"ticker": ativo.ticker, "erro": "Erro inesperado ao atualizar splits."})

    return {
        "total_ativos": len(ativos),
        "atualizados": len(atualizados),
        "falhas": len(falhas),
        "total_splits_criados": total_criados,
        "resultados": atualizados,
        "erros": falhas,
    }


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

    resultado_splits = atualizar_splits_todos_ativos(db) if ativos else None

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
        "splits_atualizados": resultado_splits["atualizados"] if resultado_splits else 0,
        "splits_falhas": resultado_splits["falhas"] if resultado_splits else 0,
        "splits_criados": resultado_splits["total_splits_criados"] if resultado_splits else 0,
        "splits_erros": resultado_splits["erros"] if resultado_splits else [],
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
    if ativo_eh_fii(ativo):
        proventos_complementares = buscar_proventos_complementares_stockanalysis(ativo.ticker)
        proventos_yahoo = combinar_proventos_por_data_e_valor(proventos_yahoo, proventos_complementares)

    removidos = remover_proventos_yahoo(db, ativo)
    db.flush()
    proventos_validos = [
        provento
        for provento in proventos_yahoo
        if obter_data_com_yahoo(provento) >= ativo.data_inicial
    ]
    criados = 0
    ignorados_por_quantidade = 0

    for indice, provento_yahoo in enumerate(proventos_validos):
        data_com = obter_data_com_yahoo(provento_yahoo)
        valor_por_cota = provento_yahoo.valor_por_cota
        quantidade_base = obter_quantidade_ativo_na_data(db, ativo.id, data_com)

        if quantidade_base <= 0:
            ignorados_por_quantidade += 1
            continue

        valor_por_cota_ajustado = ajustar_valor_por_cota_com_splits(
            db,
            ativo.id,
            data_com,
            valor_por_cota,
            proventos_validos,
        )
        valor_por_cota_ajustado = ajustar_valor_por_cota_por_contexto(
            db,
            ativo.id,
            proventos_validos,
            indice,
            data_com,
            valor_por_cota_ajustado,
        )

        provento = models.ProventoAtivo(
            ativo_id=ativo.id,
            ticker=ativo.ticker,
            tipo=provento_yahoo.tipo,
            data_com=data_com,
            data_pagamento=None,
            valor_por_cota=valor_por_cota_ajustado,
            quantidade_base=quantidade_base,
            valor_estimado=valor_por_cota_ajustado * quantidade_base,
            fonte="yahoo_finance",
        )
        db.add(provento)
        criados += 1

    return {
        "ticker": ativo.ticker,
        "proventos_encontrados": len(proventos_yahoo),
        "proventos_validos": len(proventos_validos),
        "proventos_ignorados": (len(proventos_yahoo) - len(proventos_validos)) + ignorados_por_quantidade,
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
