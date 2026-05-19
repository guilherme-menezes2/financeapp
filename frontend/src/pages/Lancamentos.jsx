import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { listarCategorias } from "../services/categoriasService.js";
import { excluirLancamento, listarLancamentos } from "../services/lancamentosService.js";
import { formatarData, formatarMoeda } from "../utils/formatters.js";

const filtrosIniciais = {
  tipo: "",
  forma_pagamento: "",
  despesa_fixa: "",
  categoria_id: "",
  data_inicio: "",
  data_fim: "",
  texto: "",
};

const labelsFormaPagamento = {
  credito: "Credito",
  debito: "Debito",
  boleto: "Boleto",
  pix: "Pix",
};

function montarParametros(filtros) {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, valor]) => valor !== "")
  );
}

function Lancamentos() {
  const [lancamentos, setLancamentos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [filtros, setFiltros] = useState(filtrosIniciais);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [excluindoId, setExcluindoId] = useState(null);

  const parametros = useMemo(() => montarParametros(filtros), [filtros]);

  async function carregarLancamentos() {
    try {
      setLoading(true);
      setErro("");
      const dados = await listarLancamentos(parametros);
      setLancamentos(dados);
    } catch (error) {
      setErro("Nao foi possivel carregar os lancamentos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function carregarCategorias() {
      try {
        const dados = await listarCategorias();
        setCategorias(dados);
      } catch (error) {
        setCategorias([]);
      }
    }

    carregarCategorias();
  }, []);

  useEffect(() => {
    carregarLancamentos();
  }, [parametros]);

  function atualizarFiltro(campo, valor) {
    setFiltros((filtrosAtuais) => ({
      ...filtrosAtuais,
      [campo]: valor,
    }));
  }

  function limparFiltros() {
    setFiltros(filtrosIniciais);
  }

  async function handleExcluir(lancamento) {
    const confirmou = window.confirm(
      `Deseja excluir o lancamento "${lancamento.descricao}"?`
    );

    if (!confirmou) {
      return;
    }

    try {
      setExcluindoId(lancamento.id);
      setErro("");
      await excluirLancamento(lancamento.id);
      await carregarLancamentos();
    } catch (error) {
      setErro("Nao foi possivel excluir o lancamento.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <section className="page">
      <PageHeader
        title="Lancamentos"
        description="Consulte, filtre e gerencie receitas e despesas cadastradas."
        action={
          <Link className="button primary" to="/lancamentos/novo">
            Novo lancamento
          </Link>
        }
      />

      <section className="panel filters-panel">
        <label>
          Tipo
          <select value={filtros.tipo} onChange={(event) => atualizarFiltro("tipo", event.target.value)}>
            <option value="">Todos</option>
            <option value="receita">Receita</option>
            <option value="despesa">Despesa</option>
          </select>
        </label>

        <label>
          Pagamento
          <select
            value={filtros.forma_pagamento}
            onChange={(event) => atualizarFiltro("forma_pagamento", event.target.value)}
          >
            <option value="">Todos</option>
            <option value="credito">Credito</option>
            <option value="debito">Debito</option>
            <option value="boleto">Boleto</option>
            <option value="pix">Pix</option>
          </select>
        </label>

        <label>
          Despesa fixa
          <select
            value={filtros.despesa_fixa}
            onChange={(event) => atualizarFiltro("despesa_fixa", event.target.value)}
          >
            <option value="">Todas</option>
            <option value="true">Sim</option>
            <option value="false">Nao</option>
          </select>
        </label>

        <label>
          Categoria
          <select
            value={filtros.categoria_id}
            onChange={(event) => atualizarFiltro("categoria_id", event.target.value)}
          >
            <option value="">Todas</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </select>
        </label>

        <label>
          Data inicio
          <input
            type="date"
            value={filtros.data_inicio}
            onChange={(event) => atualizarFiltro("data_inicio", event.target.value)}
          />
        </label>

        <label>
          Data fim
          <input
            type="date"
            value={filtros.data_fim}
            onChange={(event) => atualizarFiltro("data_fim", event.target.value)}
          />
        </label>

        <label className="search-field">
          Busca
          <input
            type="search"
            placeholder="Buscar por descricao"
            value={filtros.texto}
            onChange={(event) => atualizarFiltro("texto", event.target.value)}
          />
        </label>

        <button className="button" type="button" onClick={limparFiltros}>
          Limpar
        </button>
      </section>

      {loading ? <LoadingState message="Carregando lancamentos..." /> : null}
      {erro ? <ErrorState message={erro} /> : null}

      {!loading && !erro ? (
        <section className="panel table-panel">
          {lancamentos.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Descricao</th>
                    <th>Tipo</th>
                    <th>Pagamento</th>
                    <th>Valor</th>
                    <th>Data</th>
                    <th>Categoria</th>
                    <th>Despesa fixa</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.map((lancamento) => {
                    const ehReceita = lancamento.tipo === "receita";
                    const valorFormatado = `${ehReceita ? "+" : "-"} ${formatarMoeda(lancamento.valor)}`;

                    return (
                      <tr key={lancamento.id}>
                        <td data-label="Descricao">
                          <strong>{lancamento.descricao}</strong>
                          {lancamento.observacao ? <span>{lancamento.observacao}</span> : null}
                        </td>
                        <td data-label="Tipo">
                          <span className={`type-pill ${ehReceita ? "income" : "expense"}`}>
                            {ehReceita ? "Receita" : "Despesa"}
                          </span>
                        </td>
                        <td data-label="Pagamento">
                          <strong>{labelsFormaPagamento[lancamento.forma_pagamento] || "Pix"}</strong>
                          {lancamento.forma_pagamento === "credito" && lancamento.cartao_nome ? (
                            <span>
                              {lancamento.cartao_nome} - {lancamento.cartao_bandeira}
                            </span>
                          ) : null}
                        </td>
                        <td data-label="Valor" className={ehReceita ? "value-income" : "value-expense"}>
                          {valorFormatado}
                        </td>
                        <td data-label="Data">{formatarData(lancamento.data)}</td>
                        <td data-label="Categoria">
                          <span className="category-chip">
                            <span
                              className="category-color"
                              style={{ backgroundColor: lancamento.categoria_cor || "#94a3b8" }}
                            />
                            {lancamento.categoria_nome}
                          </span>
                        </td>
                        <td data-label="Despesa fixa">
                          {lancamento.tipo === "despesa" ? (lancamento.categoria_despesa_fixa ? "Sim" : "Nao") : "-"}
                        </td>
                        <td data-label="Acoes">
                          <div className="table-actions">
                            <Link className="button small" to={`/lancamentos/${lancamento.id}/editar`}>
                              Editar
                            </Link>
                            <button
                              className="button small danger"
                              type="button"
                              disabled={excluindoId === lancamento.id}
                              onClick={() => handleExcluir(lancamento)}
                            >
                              {excluindoId === lancamento.id ? "Excluindo..." : "Excluir"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-dashboard">
              <h2>Nenhum lancamento encontrado</h2>
              <p>Ajuste os filtros ou cadastre um novo lancamento para comecar.</p>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}

export default Lancamentos;
