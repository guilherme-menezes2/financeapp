from datetime import datetime

from sqlalchemy import CheckConstraint, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class Categoria(Base):
    __tablename__ = "categorias"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False, index=True)
    tipo = Column(String(20), nullable=False)
    cor = Column(String(20), nullable=True)
    criado_em = Column(DateTime, nullable=False, default=datetime.utcnow)

    lancamentos = relationship("Lancamento", back_populates="categoria")

    __table_args__ = (
        CheckConstraint("tipo in ('receita', 'despesa')", name="ck_categorias_tipo"),
        UniqueConstraint("nome", "tipo", name="uq_categorias_nome_tipo"),
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
    observacao = Column(Text, nullable=True)
    criado_em = Column(DateTime, nullable=False, default=datetime.utcnow)
    atualizado_em = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    categoria = relationship("Categoria", back_populates="lancamentos")

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
