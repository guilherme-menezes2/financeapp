import json
import os
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from decimal import Decimal
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.utils.errors import bad_request, external_service_error


@dataclass
class YahooQuote:
    ticker: str
    nome: str | None
    tipo: str | None
    moeda: str | None
    preco: Decimal
    variacao: Decimal | None
    variacao_percentual: Decimal | None
    volume: Decimal | None


@dataclass
class YahooProvento:
    ticker: str
    tipo: str
    data_pagamento: datetime
    valor_por_cota: Decimal


@dataclass
class YahooSplit:
    ticker: str
    data_evento: datetime
    numerador: int
    denominador: int


@dataclass
class YahooPrecoHistorico:
    ticker: str
    data_referencia: date
    fechamento: Decimal


def decimal_ou_none(valor) -> Decimal | None:
    if valor is None:
        return None

    return Decimal(str(valor))


class YahooFinanceClient:
    def __init__(self):
        self.base_url = os.getenv(
            "YAHOO_FINANCE_BASE_URL",
            "https://query1.finance.yahoo.com/v8/finance/chart",
        ).rstrip("/")
        self.timeout = int(os.getenv("YAHOO_FINANCE_TIMEOUT_SECONDS", "10"))

    def buscar_cotacao(self, ticker: str) -> YahooQuote:
        simbolos = self._simbolos_para_tentar(ticker)
        ultimo_erro = None

        for simbolo in simbolos:
            try:
                resultado = self._buscar_resultado(simbolo, "range=1d&interval=1d")
                return self._converter_resultado(resultado, ticker)
            except ValueError as error:
                ultimo_erro = str(error)
                continue

        mensagem = ultimo_erro or "Ticker nao encontrado no Yahoo Finance."
        raise bad_request(mensagem)

    def buscar_proventos(self, ticker: str) -> list[YahooProvento]:
        simbolos = self._simbolos_para_tentar(ticker)
        ultimo_erro = None

        for simbolo in simbolos:
            try:
                resultado = self._buscar_resultado(
                    simbolo,
                    "range=10y&interval=1d&events=div",
                )
                return self._converter_proventos(resultado, ticker)
            except ValueError as error:
                ultimo_erro = str(error)
                continue

        mensagem = ultimo_erro or "Ticker nao encontrado no Yahoo Finance."
        raise bad_request(mensagem)

    def buscar_splits(self, ticker: str) -> list[YahooSplit]:
        simbolos = self._simbolos_para_tentar(ticker)
        ultimo_erro = None

        for simbolo in simbolos:
            try:
                resultado = self._buscar_resultado(
                    simbolo,
                    "range=10y&interval=1mo&events=split",
                )
                return self._converter_splits(resultado, ticker)
            except ValueError as error:
                ultimo_erro = str(error)
                continue

        mensagem = ultimo_erro or "Ticker nao encontrado no Yahoo Finance."
        raise bad_request(mensagem)

    def buscar_precos_historicos(
        self,
        ticker: str,
        data_inicio: date,
        data_fim: date,
    ) -> list[YahooPrecoHistorico]:
        simbolos = self._simbolos_para_tentar(ticker)
        ultimo_erro = None
        inicio_timestamp = int(
            datetime.combine(data_inicio, time.min, tzinfo=timezone.utc).timestamp()
        )
        fim_timestamp = int(
            datetime.combine(data_fim, time.max, tzinfo=timezone.utc).timestamp()
        )

        for simbolo in simbolos:
            try:
                resultado = self._buscar_resultado(
                    simbolo,
                    f"period1={inicio_timestamp}&period2={fim_timestamp}&interval=1d",
                )
                return self._converter_precos_historicos(resultado, ticker)
            except ValueError as error:
                ultimo_erro = str(error)
                continue

        mensagem = ultimo_erro or "Ticker nao encontrado no Yahoo Finance."
        raise bad_request(mensagem)

    def _simbolos_para_tentar(self, ticker: str) -> list[str]:
        ticker_normalizado = ticker.strip().upper()
        simbolos = [ticker_normalizado]

        if "." not in ticker_normalizado and "=" not in ticker_normalizado:
            simbolos.append(f"{ticker_normalizado}.SA")

        return simbolos

    def _buscar_resultado(self, simbolo: str, query_string: str) -> dict:
        simbolo_url = quote(simbolo, safe="")
        url = f"{self.base_url}/{simbolo_url}?{query_string}"
        request = Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "financeapp/1.0",
            },
        )

        try:
            with urlopen(request, timeout=self.timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            if error.code in (400, 404):
                raise ValueError("Ticker nao encontrado no Yahoo Finance.") from error
            if error.code == 429:
                raise external_service_error("Limite de requisicoes do Yahoo Finance atingido.")
            raise external_service_error("Erro ao consultar o Yahoo Finance.") from error
        except URLError as error:
            raise external_service_error("Nao foi possivel conectar ao Yahoo Finance.") from error
        except TimeoutError as error:
            raise external_service_error("Tempo limite ao consultar o Yahoo Finance.") from error
        except json.JSONDecodeError as error:
            raise external_service_error("O Yahoo Finance retornou uma resposta invalida.") from error

        chart = payload.get("chart") or {}
        erro = chart.get("error")
        if erro:
            descricao = erro.get("description") or "Ticker nao encontrado no Yahoo Finance."
            raise ValueError(descricao)

        resultados = chart.get("result") or []
        if not resultados:
            raise ValueError("Ticker nao encontrado no Yahoo Finance.")

        return resultados[0]

    def _converter_resultado(self, resultado: dict, ticker_original: str) -> YahooQuote:
        meta = resultado.get("meta") or {}
        indicadores = resultado.get("indicators") or {}
        quote = (indicadores.get("quote") or [{}])[0]

        preco = decimal_ou_none(meta.get("regularMarketPrice"))
        if preco is None:
            fechamento = quote.get("close") or []
            preco = next((decimal_ou_none(valor) for valor in reversed(fechamento) if valor is not None), None)

        if preco is None:
            raise ValueError("O Yahoo Finance nao retornou preco atual para este ticker.")

        fechamento_anterior = decimal_ou_none(meta.get("chartPreviousClose"))
        variacao = None
        variacao_percentual = None

        if fechamento_anterior is not None and fechamento_anterior:
            variacao = preco - fechamento_anterior
            variacao_percentual = (variacao / fechamento_anterior) * Decimal("100")

        volume = decimal_ou_none(meta.get("regularMarketVolume"))
        if volume is None:
            volumes = quote.get("volume") or []
            volume = next((decimal_ou_none(valor) for valor in reversed(volumes) if valor is not None), None)

        return YahooQuote(
            ticker=str(meta.get("symbol") or ticker_original).upper(),
            nome=meta.get("longName") or meta.get("shortName") or meta.get("symbol"),
            tipo=meta.get("instrumentType"),
            moeda=meta.get("currency"),
            preco=preco,
            variacao=variacao,
            variacao_percentual=variacao_percentual,
            volume=volume,
        )

    def _converter_proventos(self, resultado: dict, ticker_original: str) -> list[YahooProvento]:
        meta = resultado.get("meta") or {}
        eventos = resultado.get("events") or {}
        dividendos = eventos.get("dividends") or {}
        ticker = str(meta.get("symbol") or ticker_original).upper()

        proventos = []
        for evento in dividendos.values():
            valor = decimal_ou_none(evento.get("amount"))
            data_timestamp = evento.get("date")

            if valor is None or data_timestamp is None:
                continue

            proventos.append(
                YahooProvento(
                    ticker=ticker,
                    tipo="dividendo",
                    data_pagamento=datetime.fromtimestamp(data_timestamp, tz=timezone.utc),
                    valor_por_cota=valor,
                )
            )

        return sorted(proventos, key=lambda provento: provento.data_pagamento, reverse=True)

    def _converter_splits(self, resultado: dict, ticker_original: str) -> list[YahooSplit]:
        meta = resultado.get("meta") or {}
        eventos = resultado.get("events") or {}
        splits = eventos.get("splits") or {}
        ticker = str(meta.get("symbol") or ticker_original).upper()

        eventos_split = []
        for evento in splits.values():
            data_timestamp = evento.get("date")
            numerador = evento.get("numerator")
            denominador = evento.get("denominator")

            if data_timestamp is None or numerador is None or denominador is None:
                continue

            try:
                numerador = int(numerador)
                denominador = int(denominador)
            except (TypeError, ValueError):
                continue

            if numerador <= 0 or denominador <= 0:
                continue

            eventos_split.append(
                YahooSplit(
                    ticker=ticker,
                    data_evento=datetime.fromtimestamp(data_timestamp, tz=timezone.utc),
                    numerador=numerador,
                    denominador=denominador,
                )
            )

        return sorted(eventos_split, key=lambda evento: evento.data_evento, reverse=True)

    def _converter_precos_historicos(
        self,
        resultado: dict,
        ticker_original: str,
    ) -> list[YahooPrecoHistorico]:
        meta = resultado.get("meta") or {}
        ticker = str(meta.get("symbol") or ticker_original).upper()
        timestamps = resultado.get("timestamp") or []
        indicadores = resultado.get("indicators") or {}
        quote = (indicadores.get("quote") or [{}])[0]
        fechamentos = quote.get("close") or []

        precos = []
        for timestamp, fechamento in zip(timestamps, fechamentos):
            fechamento_decimal = decimal_ou_none(fechamento)
            if timestamp is None or fechamento_decimal is None:
                continue

            precos.append(
                YahooPrecoHistorico(
                    ticker=ticker,
                    data_referencia=datetime.fromtimestamp(timestamp, tz=timezone.utc).date(),
                    fechamento=fechamento_decimal,
                )
            )

        return sorted(precos, key=lambda preco: preco.data_referencia)
