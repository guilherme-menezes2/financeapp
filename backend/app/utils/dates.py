from datetime import date, timedelta

from app.utils.errors import bad_request


def validar_periodo(data_inicio: date | None, data_fim: date | None):
    if data_inicio and data_fim and data_inicio > data_fim:
        raise bad_request("A data_inicio nao pode ser maior que a data_fim.")


def primeiro_dia_do_mes(data_referencia: date) -> date:
    return date(data_referencia.year, data_referencia.month, 1)


def somar_meses(data_referencia: date, quantidade: int) -> date:
    mes_indexado = data_referencia.year * 12 + data_referencia.month - 1 + quantidade
    ano = mes_indexado // 12
    mes = mes_indexado % 12 + 1
    return date(ano, mes, 1)


def ultimo_dia_do_mes(data_referencia: date) -> date:
    return somar_meses(primeiro_dia_do_mes(data_referencia), 1) - timedelta(days=1)
