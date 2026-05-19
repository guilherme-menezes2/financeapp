from sqlalchemy import inspect, text

from app.database import engine


def aplicar_migracoes_sqlite():
    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    tabelas = inspector.get_table_names()
    if "categorias" in tabelas:
        colunas_categorias = {
            coluna["name"] for coluna in inspector.get_columns("categorias")
        }

        if "despesa_fixa" not in colunas_categorias:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "ALTER TABLE categorias "
                        "ADD COLUMN despesa_fixa BOOLEAN NOT NULL DEFAULT 0"
                    )
                )

    if "lancamentos" not in tabelas:
        return
    colunas = {coluna["name"] for coluna in inspector.get_columns("lancamentos")}

    with engine.begin() as connection:
        if "forma_pagamento" not in colunas:
            connection.execute(
                text(
                    "ALTER TABLE lancamentos "
                    "ADD COLUMN forma_pagamento VARCHAR(20) NOT NULL DEFAULT 'pix'"
                )
            )

        if "cartao_id" not in colunas:
            connection.execute(
                text("ALTER TABLE lancamentos ADD COLUMN cartao_id INTEGER")
            )
