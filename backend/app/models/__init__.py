from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class Categoria(Base):
    __tablename__ = "categorias"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False, index=True)
    tipo = Column(String(20), nullable=False)
    cor = Column(String(20), nullable=True)
    despesa_fixa = Column(Boolean, nullable=False, default=False)
    criado_em = Column(DateTime, nullable=False, default=datetime.utcnow)

    lancamentos = relationship("Lancamento", back_populates="categoria")

    __table_args__ = (
        CheckConstraint("tipo in ('receita', 'despesa')", name="ck_categorias_tipo"),
        CheckConstraint(
            "tipo = 'despesa' or despesa_fixa = 0",
            name="ck_categorias_despesa_fixa_apenas_despesa",
        ),
        UniqueConstraint("nome", "tipo", name="uq_categorias_nome_tipo"),
    )


class Cartao(Base):
    __tablename__ = "cartoes"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False, unique=True, index=True)
    bandeira = Column(String(50), nullable=False)
    limite = Column(Numeric(12, 2), nullable=False)
    criado_em = Column(DateTime, nullable=False, default=datetime.utcnow)

    lancamentos = relationship("Lancamento", back_populates="cartao")

    __table_args__ = (
        CheckConstraint("limite >= 0", name="ck_cartoes_limite_nao_negativo"),
    )


class Ativo(Base):
    __tablename__ = "ativos"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(20), nullable=False, unique=True, index=True)
    nome = Column(String(120), nullable=True)
    tipo = Column(String(40), nullable=True)
    quantidade = Column(Numeric(18, 6), nullable=False)
    preco_medio = Column(Numeric(12, 2), nullable=False)
    data_inicial = Column(Date, nullable=False)
    moeda = Column(String(10), nullable=False, default="BRL")
    ultimo_preco = Column(Numeric(12, 2), nullable=True)
    ultima_atualizacao = Column(DateTime, nullable=True)
    criado_em = Column(DateTime, nullable=False, default=datetime.utcnow)
    atualizado_em = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    cotacoes = relationship("CotacaoAtivo", back_populates="ativo", cascade="all, delete-orphan")
    proventos = relationship("ProventoAtivo", back_populates="ativo", cascade="all, delete-orphan")
    movimentacoes = relationship("MovimentacaoAtivo", back_populates="ativo", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("quantidade >= 0", name="ck_ativos_quantidade_nao_negativa"),
        CheckConstraint("preco_medio >= 0", name="ck_ativos_preco_medio_nao_negativo"),
    )

    @property
    def valor_investido(self):
        return self.quantidade * self.preco_medio

    @property
    def valor_atual(self):
        if self.ultimo_preco is None:
            return None

        return self.quantidade * self.ultimo_preco

    @property
    def lucro_prejuizo(self):
        if self.valor_atual is None:
            return None

        return self.valor_atual - self.valor_investido

    @property
    def rentabilidade_percentual(self):
        if self.lucro_prejuizo is None or not self.valor_investido:
            return None

        return (self.lucro_prejuizo / self.valor_investido) * 100


class CotacaoAtivo(Base):
    __tablename__ = "cotacoes_ativos"

    id = Column(Integer, primary_key=True, index=True)
    ativo_id = Column(Integer, ForeignKey("ativos.id"), nullable=False)
    ticker = Column(String(20), nullable=False, index=True)
    preco = Column(Numeric(12, 2), nullable=False)
    variacao = Column(Numeric(12, 2), nullable=True)
    variacao_percentual = Column(Numeric(12, 4), nullable=True)
    volume = Column(Numeric(20, 2), nullable=True)
    data_referencia = Column(DateTime, nullable=False)
    fonte = Column(String(40), nullable=False, default="yahoo_finance")
    criado_em = Column(DateTime, nullable=False, default=datetime.utcnow)

    ativo = relationship("Ativo", back_populates="cotacoes")


class ProventoAtivo(Base):
    __tablename__ = "proventos_ativos"

    id = Column(Integer, primary_key=True, index=True)
    ativo_id = Column(Integer, ForeignKey("ativos.id"), nullable=False)
    ticker = Column(String(20), nullable=False, index=True)
    tipo = Column(String(40), nullable=True)
    data_com = Column(Date, nullable=True)
    data_pagamento = Column(Date, nullable=True)
    valor_por_cota = Column(Numeric(12, 6), nullable=False)
    quantidade_base = Column(Numeric(18, 6), nullable=True)
    valor_estimado = Column(Numeric(12, 2), nullable=True)
    fonte = Column(String(40), nullable=False, default="yahoo_finance")
    criado_em = Column(DateTime, nullable=False, default=datetime.utcnow)

    ativo = relationship("Ativo", back_populates="proventos")


class SnapshotCarteira(Base):
    __tablename__ = "snapshots_carteira"

    id = Column(Integer, primary_key=True, index=True)
    data_referencia = Column(Date, nullable=False, unique=True, index=True)
    patrimonio_total = Column(Numeric(14, 2), nullable=False)
    valor_investido_total = Column(Numeric(14, 2), nullable=False)
    lucro_prejuizo_total = Column(Numeric(14, 2), nullable=False)
    rentabilidade_percentual = Column(Numeric(12, 4), nullable=False)
    quantidade_ativos = Column(Integer, nullable=False, default=0)
    criado_em = Column(DateTime, nullable=False, default=datetime.utcnow)


class MovimentacaoAtivo(Base):
    __tablename__ = "movimentacoes_ativos"

    id = Column(Integer, primary_key=True, index=True)
    ativo_id = Column(Integer, ForeignKey("ativos.id"), nullable=False)
    tipo = Column(String(20), nullable=False)
    quantidade = Column(Numeric(18, 6), nullable=False, default=0)
    preco_unitario = Column(Numeric(12, 2), nullable=False, default=0)
    valor_total = Column(Numeric(14, 2), nullable=False, default=0)
    preco_medio_antes = Column(Numeric(12, 2), nullable=True)
    preco_medio_depois = Column(Numeric(12, 2), nullable=True)
    lucro_prejuizo = Column(Numeric(14, 2), nullable=True)
    fator_numerador = Column(Integer, nullable=True)
    fator_denominador = Column(Integer, nullable=True)
    data = Column(Date, nullable=False, index=True)
    observacao = Column(Text, nullable=True)
    criado_em = Column(DateTime, nullable=False, default=datetime.utcnow)

    ativo = relationship("Ativo", back_populates="movimentacoes")

    __table_args__ = (
        CheckConstraint("tipo in ('compra', 'venda', 'split')", name="ck_movimentacoes_ativos_tipo"),
        CheckConstraint("quantidade >= 0", name="ck_movimentacoes_ativos_quantidade_nao_negativa"),
        CheckConstraint(
            "preco_unitario >= 0",
            name="ck_movimentacoes_ativos_preco_unitario_nao_negativo",
        ),
        CheckConstraint("valor_total >= 0", name="ck_movimentacoes_ativos_valor_total_nao_negativo"),
    )


class Lancamento(Base):
    __tablename__ = "lancamentos"

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String(20), nullable=False)
    forma_pagamento = Column(String(20), nullable=False, default="pix")
    descricao = Column(String(150), nullable=False)
    valor = Column(Numeric(12, 2), nullable=False)
    data = Column(Date, nullable=False, index=True)
    categoria_id = Column(Integer, ForeignKey("categorias.id"), nullable=False)
    cartao_id = Column(Integer, ForeignKey("cartoes.id"), nullable=True)
    despesa_fixa = Column(Boolean, nullable=True)
    observacao = Column(Text, nullable=True)
    criado_em = Column(DateTime, nullable=False, default=datetime.utcnow)
    atualizado_em = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    categoria = relationship("Categoria", back_populates="lancamentos")
    cartao = relationship("Cartao", back_populates="lancamentos")

    __table_args__ = (
        CheckConstraint("tipo in ('receita', 'despesa')", name="ck_lancamentos_tipo"),
        CheckConstraint(
            "forma_pagamento in ('credito', 'debito', 'boleto', 'pix')",
            name="ck_lancamentos_forma_pagamento",
        ),
        CheckConstraint("valor > 0", name="ck_lancamentos_valor_positivo"),
    )

    @property
    def categoria_nome(self):
        return self.categoria.nome if self.categoria else None

    @property
    def categoria_cor(self):
        return self.categoria.cor if self.categoria else None

    @property
    def categoria_despesa_fixa(self):
        if self.despesa_fixa is not None:
            return bool(self.despesa_fixa)

        return bool(self.categoria.despesa_fixa) if self.categoria else False

    @property
    def cartao_nome(self):
        return self.cartao.nome if self.cartao else None

    @property
    def cartao_bandeira(self):
        return self.cartao.bandeira if self.cartao else None
