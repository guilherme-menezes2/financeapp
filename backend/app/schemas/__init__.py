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
                {"nome": "Salario", "tipo": "receita", "cor": "#16a34a"},
                {"nome": "Mercado", "tipo": "despesa", "cor": "#f97316"},
            ]
        }
    )


class CategoriaUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=100)
    tipo: TipoLancamento | None = None
    cor: str | None = Field(default=None, max_length=20)

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
                {"nome": "Supermercado", "tipo": "despesa", "cor": "#dc2626"}
            ]
        }
    )


class CategoriaResponse(CategoriaBase):
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
