from datetime import date
from decimal import Decimal

from app import models
from app.database import Base, SessionLocal, engine


SEED_MARKER = "[seed]"


CATEGORIAS = [
    {"nome": "Salario", "tipo": "receita", "cor": "#16a34a"},
    {"nome": "Venda extra", "tipo": "receita", "cor": "#2563eb"},
    {"nome": "Reembolso", "tipo": "receita", "cor": "#0f766e"},
    {"nome": "Supermercado", "tipo": "despesa", "cor": "#f97316"},
    {"nome": "Conta de energia", "tipo": "despesa", "cor": "#f59e0b"},
    {"nome": "Internet", "tipo": "despesa", "cor": "#7c3aed"},
    {"nome": "Aluguel", "tipo": "despesa", "cor": "#dc2626"},
    {"nome": "Combustivel", "tipo": "despesa", "cor": "#0891b2"},
    {"nome": "Farmacia", "tipo": "despesa", "cor": "#db2777"},
    {"nome": "Restaurante", "tipo": "despesa", "cor": "#ea580c"},
]

CARTOES = [
    {"nome": "Nubank", "bandeira": "Mastercard", "limite": Decimal("3500.00")},
    {"nome": "Inter", "bandeira": "Visa", "limite": Decimal("5000.00")},
    {"nome": "Itau", "bandeira": "Elo", "limite": Decimal("4200.00")},
]


def primeiro_dia_do_mes(data_referencia):
    return date(data_referencia.year, data_referencia.month, 1)


def somar_meses(data_referencia, quantidade):
    mes_indexado = data_referencia.year * 12 + data_referencia.month - 1 + quantidade
    ano = mes_indexado // 12
    mes = mes_indexado % 12 + 1
    return date(ano, mes, 1)


def data_no_mes(mes_base, dia):
    return date(mes_base.year, mes_base.month, dia)


def criar_categorias(db):
    categorias_por_chave = {}

    for categoria in CATEGORIAS:
        existente = (
            db.query(models.Categoria)
            .filter(
                models.Categoria.nome == categoria["nome"],
                models.Categoria.tipo == categoria["tipo"],
            )
            .first()
        )

        if existente is None:
            existente = models.Categoria(**categoria)
            db.add(existente)
            db.flush()

        categorias_por_chave[(existente.nome, existente.tipo)] = existente

    return categorias_por_chave


def criar_cartoes(db):
    cartoes_por_nome = {}

    for cartao in CARTOES:
        existente = (
            db.query(models.Cartao)
            .filter(models.Cartao.nome == cartao["nome"])
            .first()
        )

        if existente is None:
            existente = models.Cartao(**cartao)
            db.add(existente)
            db.flush()

        cartoes_por_nome[existente.nome] = existente

    return cartoes_por_nome


def criar_lancamentos_exemplo(db, categorias, cartoes):
    db.query(models.Lancamento).filter(models.Lancamento.observacao == SEED_MARKER).delete()

    hoje = date.today()
    inicio_mes_atual = primeiro_dia_do_mes(hoje)
    lancamentos = []

    for indice in range(6):
        mes = somar_meses(inicio_mes_atual, -5 + indice)
        variacao = Decimal(indice * 75)

        lancamentos.extend(
            [
                {
                    "tipo": "receita",
                    "forma_pagamento": "pix",
                    "descricao": "Salario mensal",
                    "valor": Decimal("5000.00") + variacao,
                    "data": data_no_mes(mes, 5),
                    "categoria": categorias[("Salario", "receita")],
                },
                {
                    "tipo": "receita",
                    "forma_pagamento": "pix",
                    "descricao": "Venda extra",
                    "valor": Decimal("450.00") + Decimal(indice * 20),
                    "data": data_no_mes(mes, 12),
                    "categoria": categorias[("Venda extra", "receita")],
                },
                {
                    "tipo": "despesa",
                    "forma_pagamento": "boleto",
                    "descricao": "Aluguel",
                    "valor": Decimal("1800.00"),
                    "data": data_no_mes(mes, 7),
                    "categoria": categorias[("Aluguel", "despesa")],
                },
                {
                    "tipo": "despesa",
                    "forma_pagamento": "debito",
                    "descricao": "Compras no supermercado",
                    "valor": Decimal("720.00") + Decimal(indice * 35),
                    "data": data_no_mes(mes, 10),
                    "categoria": categorias[("Supermercado", "despesa")],
                },
                {
                    "tipo": "despesa",
                    "forma_pagamento": "boleto",
                    "descricao": "Conta de energia",
                    "valor": Decimal("210.00") + Decimal(indice * 8),
                    "data": data_no_mes(mes, 15),
                    "categoria": categorias[("Conta de energia", "despesa")],
                },
                {
                    "tipo": "despesa",
                    "forma_pagamento": "boleto",
                    "descricao": "Internet residencial",
                    "valor": Decimal("120.00"),
                    "data": data_no_mes(mes, 18),
                    "categoria": categorias[("Internet", "despesa")],
                },
                {
                    "tipo": "despesa",
                    "forma_pagamento": "credito",
                    "descricao": "Combustivel",
                    "valor": Decimal("320.00") + Decimal(indice * 12),
                    "data": data_no_mes(mes, 21),
                    "categoria": categorias[("Combustivel", "despesa")],
                    "cartao": cartoes["Nubank"],
                },
                {
                    "tipo": "despesa",
                    "forma_pagamento": "credito",
                    "descricao": "Restaurante",
                    "valor": Decimal("180.00") + Decimal(indice * 10),
                    "data": data_no_mes(mes, 24),
                    "categoria": categorias[("Restaurante", "despesa")],
                    "cartao": cartoes["Inter"],
                },
            ]
        )

        if indice % 2 == 0:
            lancamentos.append(
                {
                    "tipo": "receita",
                    "forma_pagamento": "pix",
                    "descricao": "Reembolso",
                    "valor": Decimal("180.00") + Decimal(indice * 15),
                    "data": data_no_mes(mes, 20),
                    "categoria": categorias[("Reembolso", "receita")],
                }
            )

        if indice % 2 == 1:
            lancamentos.append(
                {
                    "tipo": "despesa",
                    "forma_pagamento": "debito",
                    "descricao": "Compra na farmacia",
                    "valor": Decimal("95.00") + Decimal(indice * 7),
                    "data": data_no_mes(mes, 26),
                    "categoria": categorias[("Farmacia", "despesa")],
                }
            )

    for lancamento in lancamentos:
        db.add(
            models.Lancamento(
                tipo=lancamento["tipo"],
                forma_pagamento=lancamento["forma_pagamento"],
                descricao=lancamento["descricao"],
                valor=lancamento["valor"],
                data=lancamento["data"],
                categoria_id=lancamento["categoria"].id,
                cartao_id=lancamento.get("cartao").id if lancamento.get("cartao") else None,
                observacao=SEED_MARKER,
            )
        )

    return len(lancamentos)


def main():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        categorias = criar_categorias(db)
        cartoes = criar_cartoes(db)
        total_lancamentos = criar_lancamentos_exemplo(db, categorias, cartoes)
        db.commit()

        print("Seed concluido com sucesso.")
        print(f"Categorias disponiveis: {len(categorias)}")
        print(f"Cartoes disponiveis: {len(cartoes)}")
        print(f"Lancamentos de exemplo criados: {total_lancamentos}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
