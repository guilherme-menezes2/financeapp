from sqlalchemy import inspect, text

from app.database import engine


def aplicar_migracoes_sqlite():
    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    tabelas = inspector.get_table_names()
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
