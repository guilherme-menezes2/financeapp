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
        return bool(self.categoria.despesa_fixa) if self.categoria else False

    @property
    def cartao_nome(self):
        return self.cartao.nome if self.cartao else None

    @property
    def cartao_bandeira(self):
        return self.cartao.bandeira if self.cartao else None
