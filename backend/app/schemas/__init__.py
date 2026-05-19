from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


TipoLancamento = Literal["receita", "despesa"]
FormaPagamento = Literal["credito", "debito", "boleto", "pix"]


class CategoriaBase(BaseModel):
    nome: str = Field(..., min_length=1, max_length=100)
    tipo: TipoLancamento
    cor: str | None = Field(default=None, max_length=20)
    despesa_fixa: bool = False

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, nome: str) -> str:
        nome_normalizado = " ".join(nome.strip().split())
        if not nome_normalizado:
            raise ValueError("O nome da categoria e obrigatorio.")
        return nome_normalizado


class CategoriaCreate(CategoriaBase):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"nome": "Salario", "tipo": "receita", "cor": "#16a34a", "despesa_fixa": False},
                {"nome": "Mercado", "tipo": "despesa", "cor": "#f97316", "despesa_fixa": False},
            ]
        }
    )


class CategoriaUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=100)
    tipo: TipoLancamento | None = None
    cor: str | None = Field(default=None, max_length=20)
    despesa_fixa: bool | None = None

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, nome: str | None) -> str | None:
        if nome is None:
            return nome

        nome_normalizado = " ".join(nome.strip().split())
        if not nome_normalizado:
            raise ValueError("O nome da categoria e obrigatorio.")
        return nome_normalizado

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"nome": "Supermercado", "tipo": "despesa", "cor": "#dc2626", "despesa_fixa": False}
            ]
        }
    )


class CategoriaResponse(CategoriaBase):
    id: int
    criado_em: datetime

    model_config = ConfigDict(from_attributes=True)


class CartaoBase(BaseModel):
    nome: str = Field(..., min_length=1, max_length=100)
    bandeira: str = Field(..., min_length=1, max_length=50)
    limite: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)

    @field_validator("nome", "bandeira")
    @classmethod
    def validar_texto_obrigatorio(cls, valor: str) -> str:
        valor_normalizado = " ".join(valor.strip().split())
        if not valor_normalizado:
            raise ValueError("O campo e obrigatorio.")
        return valor_normalizado


class CartaoCreate(CartaoBase):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"nome": "Nubank", "bandeira": "Mastercard", "limite": "3500.00"}
            ]
        }
    )


class CartaoUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=100)
    bandeira: str | None = Field(default=None, min_length=1, max_length=50)
    limite: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)

    @field_validator("nome", "bandeira")
    @classmethod
    def validar_texto_obrigatorio(cls, valor: str | None) -> str | None:
        if valor is None:
            return valor

        valor_normalizado = " ".join(valor.strip().split())
        if not valor_normalizado:
            raise ValueError("O campo e obrigatorio.")
        return valor_normalizado


class CartaoResponse(CartaoBase):
    id: int
    criado_em: datetime

    model_config = ConfigDict(from_attributes=True)


class LancamentoBase(BaseModel):
    tipo: TipoLancamento
    forma_pagamento: FormaPagamento = "pix"
    descricao: str = Field(..., min_length=1, max_length=150)
    valor: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    data: date
    categoria_id: int = Field(..., gt=0)
    cartao_id: int | None = Field(default=None, gt=0)
    despesa_fixa: bool | None = None
    observacao: str | None = None

    @field_validator("descricao")
    @classmethod
    def validar_descricao(cls, descricao: str) -> str:
        descricao_normalizada = " ".join(descricao.strip().split())
        if not descricao_normalizada:
            raise ValueError("A descricao do lancamento e obrigatoria.")
        return descricao_normalizada


class LancamentoCreate(LancamentoBase):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "tipo": "despesa",
                    "forma_pagamento": "pix",
                    "descricao": "Compra no mercado",
                    "valor": "250.75",
                    "data": "2026-05-18",
                    "categoria_id": 1,
                    "cartao_id": None,
                    "despesa_fixa": None,
                    "observacao": "Compra mensal",
                }
            ]
        }
    )


class LancamentoUpdate(BaseModel):
    tipo: TipoLancamento | None = None
    forma_pagamento: FormaPagamento | None = None
    descricao: str | None = Field(default=None, min_length=1, max_length=150)
    valor: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    data: date | None = None
    categoria_id: int | None = Field(default=None, gt=0)
    cartao_id: int | None = Field(default=None, gt=0)
    despesa_fixa: bool | None = None
    observacao: str | None = None

    @field_validator("descricao")
    @classmethod
    def validar_descricao(cls, descricao: str | None) -> str | None:
        if descricao is None:
            return descricao

        descricao_normalizada = " ".join(descricao.strip().split())
        if not descricao_normalizada:
            raise ValueError("A descricao do lancamento e obrigatoria.")
        return descricao_normalizada


class LancamentoResponse(BaseModel):
    id: int
    tipo: TipoLancamento
    forma_pagamento: FormaPagamento
    descricao: str
    valor: Decimal
    data: date
    categoria_id: int
    categoria_nome: str
    categoria_cor: str | None
    categoria_despesa_fixa: bool
    cartao_id: int | None
    cartao_nome: str | None
    cartao_bandeira: str | None
    despesa_fixa: bool | None
    observacao: str | None
    criado_em: datetime
    atualizado_em: datetime

    model_config = ConfigDict(from_attributes=True)


class ResumoMesAtual(BaseModel):
    receitas: Decimal
    despesas: Decimal
    saldo: Decimal


class ResumoPorCategoria(BaseModel):
    categoria: str
    total: Decimal


class FluxoMensalItem(BaseModel):
    mes: str
    receitas: Decimal
    despesas: Decimal
    saldo: Decimal


class ResumoFinanceiroResponse(BaseModel):
    total_receitas: Decimal
    total_despesas: Decimal
    saldo: Decimal
    quantidade_lancamentos: int
    mes_atual: ResumoMesAtual
    despesas_por_categoria: list[ResumoPorCategoria]
    receitas_por_categoria: list[ResumoPorCategoria]
    fluxo_mensal: list[FluxoMensalItem]
