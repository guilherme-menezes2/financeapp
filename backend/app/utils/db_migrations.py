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
        colunas = set()
    else:
        colunas = {coluna["name"] for coluna in inspector.get_columns("lancamentos")}

    with engine.begin() as connection:
        if "ativos" in tabelas:
            definicao_ativos = connection.execute(
                text(
                    "SELECT sql FROM sqlite_master "
                    "WHERE type = 'table' AND name = 'ativos'"
                )
            ).scalar_one_or_none() or ""

            if (
                "ck_ativos_quantidade_positiva" in definicao_ativos
                or "ck_ativos_preco_medio_positivo" in definicao_ativos
            ):
                connection.execute(text("PRAGMA foreign_keys=OFF"))
                connection.execute(text("PRAGMA legacy_alter_table=ON"))
                connection.execute(text("ALTER TABLE ativos RENAME TO ativos_antigos"))
                connection.execute(
                    text(
                        """
                        CREATE TABLE ativos (
                            id INTEGER NOT NULL PRIMARY KEY,
                            ticker VARCHAR(20) NOT NULL,
                            nome VARCHAR(120),
                            tipo VARCHAR(40),
                            quantidade NUMERIC(18, 6) NOT NULL,
                            preco_medio NUMERIC(12, 2) NOT NULL,
                            data_inicial DATE NOT NULL,
                            moeda VARCHAR(10) NOT NULL DEFAULT 'BRL',
                            ultimo_preco NUMERIC(12, 2),
                            ultima_atualizacao DATETIME,
                            criado_em DATETIME NOT NULL,
                            atualizado_em DATETIME NOT NULL,
                            CONSTRAINT ck_ativos_quantidade_nao_negativa CHECK (quantidade >= 0),
                            CONSTRAINT ck_ativos_preco_medio_nao_negativo CHECK (preco_medio >= 0),
                            UNIQUE (ticker)
                        )
                        """
                    )
                )
                connection.execute(
                    text(
                        """
                        INSERT INTO ativos (
                            id, ticker, nome, tipo, quantidade, preco_medio, data_inicial,
                            moeda, ultimo_preco, ultima_atualizacao, criado_em, atualizado_em
                        )
                        SELECT
                            id, ticker, nome, tipo, quantidade, preco_medio, data_inicial,
                            moeda, ultimo_preco, ultima_atualizacao, criado_em, atualizado_em
                        FROM ativos_antigos
                        """
                    )
                )
                connection.execute(text("DROP TABLE ativos_antigos"))
                connection.execute(
                    text("CREATE UNIQUE INDEX ix_ativos_ticker ON ativos (ticker)")
                )
                connection.execute(
                    text("CREATE INDEX ix_ativos_id ON ativos (id)")
                )
                connection.execute(text("PRAGMA legacy_alter_table=OFF"))
                connection.execute(text("PRAGMA foreign_keys=ON"))

        if "movimentacoes_ativos" in tabelas:
            colunas_movimentacoes = {
                coluna["name"] for coluna in inspector.get_columns("movimentacoes_ativos")
            }
            definicao_movimentacoes = connection.execute(
                text(
                    "SELECT sql FROM sqlite_master "
                    "WHERE type = 'table' AND name = 'movimentacoes_ativos'"
                )
            ).scalar_one_or_none() or ""

            precisa_recriar_movimentacoes = (
                "fator_numerador" not in colunas_movimentacoes
                or "fator_denominador" not in colunas_movimentacoes
                or "ck_movimentacoes_ativos_quantidade_positiva" in definicao_movimentacoes
                or "ck_movimentacoes_ativos_preco_unitario_positivo" in definicao_movimentacoes
                or "ck_movimentacoes_ativos_valor_total_positivo" in definicao_movimentacoes
                or "split" not in definicao_movimentacoes
            )

            if precisa_recriar_movimentacoes:
                connection.execute(text("PRAGMA foreign_keys=OFF"))
                connection.execute(text("PRAGMA legacy_alter_table=ON"))
                connection.execute(
                    text("ALTER TABLE movimentacoes_ativos RENAME TO movimentacoes_ativos_antiga")
                )
                connection.execute(
                    text(
                        """
                        CREATE TABLE movimentacoes_ativos (
                            id INTEGER NOT NULL PRIMARY KEY,
                            ativo_id INTEGER NOT NULL,
                            tipo VARCHAR(20) NOT NULL,
                            quantidade NUMERIC(18, 6) NOT NULL DEFAULT 0,
                            preco_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
                            valor_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
                            preco_medio_antes NUMERIC(12, 2),
                            preco_medio_depois NUMERIC(12, 2),
                            lucro_prejuizo NUMERIC(14, 2),
                            fator_numerador INTEGER,
                            fator_denominador INTEGER,
                            data DATE NOT NULL,
                            observacao TEXT,
                            criado_em DATETIME NOT NULL,
                            FOREIGN KEY(ativo_id) REFERENCES ativos (id),
                            CONSTRAINT ck_movimentacoes_ativos_tipo CHECK (tipo in ('compra', 'venda', 'split')),
                            CONSTRAINT ck_movimentacoes_ativos_quantidade_nao_negativa CHECK (quantidade >= 0),
                            CONSTRAINT ck_movimentacoes_ativos_preco_unitario_nao_negativo CHECK (preco_unitario >= 0),
                            CONSTRAINT ck_movimentacoes_ativos_valor_total_nao_negativo CHECK (valor_total >= 0)
                        )
                        """
                    )
                )
                connection.execute(
                    text(
                        """
                        INSERT INTO movimentacoes_ativos (
                            id, ativo_id, tipo, quantidade, preco_unitario, valor_total,
                            preco_medio_antes, preco_medio_depois, lucro_prejuizo,
                            fator_numerador, fator_denominador, data, observacao, criado_em
                        )
                        SELECT
                            id, ativo_id, tipo, quantidade, preco_unitario, valor_total,
                            preco_medio_antes, preco_medio_depois, lucro_prejuizo,
                            NULL, NULL, data, observacao, criado_em
                        FROM movimentacoes_ativos_antiga
                        """
                    )
                )
                connection.execute(text("DROP TABLE movimentacoes_ativos_antiga"))
                connection.execute(
                    text("CREATE INDEX ix_movimentacoes_ativos_id ON movimentacoes_ativos (id)")
                )
                connection.execute(
                    text("CREATE INDEX ix_movimentacoes_ativos_data ON movimentacoes_ativos (data)")
                )
                connection.execute(text("PRAGMA legacy_alter_table=OFF"))
                connection.execute(text("PRAGMA foreign_keys=ON"))

        if "lancamentos" not in tabelas:
            return

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

        if "despesa_fixa" not in colunas:
            connection.execute(
                text("ALTER TABLE lancamentos ADD COLUMN despesa_fixa BOOLEAN")
            )
