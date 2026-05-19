import { useEffect, useMemo, useState } from "react";

import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import {
  atualizarCategoria,
  criarCategoria,
  excluirCategoria,
  listarCategorias,
} from "../services/categoriasService.js";

const formularioInicial = {
  nome: "",
  tipo: "despesa",
  cor: "#64748b",
  despesa_fixa: false,
};

function extrairMensagemErro(error, fallback) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail) && detail.length) {
    return detail[0]?.msg || fallback;
  }

  return fallback;
}

function Categorias() {
  const [categorias, setCategorias] = useState([]);
  const [formData, setFormData] = useState(formularioInicial);
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [categoriaEditando, setCategoriaEditando] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const categoriasFiltradas = useMemo(() => {
    if (!tipoFiltro) {
      return categorias;
    }

    return categorias.filter((categoria) => categoria.tipo === tipoFiltro);
  }, [categorias, tipoFiltro]);

  async function carregarCategorias() {
    try {
      setLoading(true);
      setErro("");
      const dados = await listarCategorias();
      setCategorias(dados);
    } catch (error) {
      setErro("Nao foi possivel carregar as categorias.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarCategorias();
  }, []);

  function atualizarCampo(campo, valor) {
    setFormData((dadosAtuais) => ({
      ...dadosAtuais,
      [campo]: valor,
      ...(campo === "tipo" && valor === "receita" ? { despesa_fixa: false } : {}),
    }));
  }

  function limparFormulario() {
    setFormData(formularioInicial);
    setCategoriaEditando(null);
    setMensagem("");
    setErro("");
  }

  function iniciarEdicao(categoria) {
    setCategoriaEditando(categoria);
    setFormData({
      nome: categoria.nome,
      tipo: categoria.tipo,
      cor: categoria.cor || "#64748b",
      despesa_fixa: Boolean(categoria.despesa_fixa),
    });
    setMensagem("");
    setErro("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!formData.nome.trim()) {
      setErro("Informe o nome da categoria.");
      return;
    }

    if (!formData.tipo) {
      setErro("Informe o tipo da categoria.");
      return;
    }

    const payload = {
      nome: formData.nome.trim(),
      tipo: formData.tipo,
      cor: formData.cor || null,
      despesa_fixa: formData.tipo === "despesa" ? Boolean(formData.despesa_fixa) : false,
    };

    try {
      setSalvando(true);
      setErro("");
      setMensagem("");

      if (categoriaEditando) {
        await atualizarCategoria(categoriaEditando.id, payload);
        setMensagem("Categoria atualizada com sucesso.");
      } else {
        await criarCategoria(payload);
        setMensagem("Categoria criada com sucesso.");
      }

      setFormData(formularioInicial);
      setCategoriaEditando(null);
      await carregarCategorias();
    } catch (error) {
      setErro(
        extrairMensagemErro(
          error,
          categoriaEditando
            ? "Nao foi possivel atualizar a categoria."
            : "Nao foi possivel criar a categoria."
        )
      );
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(categoria) {
    const confirmou = window.confirm(`Deseja excluir a categoria "${categoria.nome}"?`);

    if (!confirmou) {
      return;
    }

    try {
      setExcluindoId(categoria.id);
      setErro("");
      setMensagem("");
      await excluirCategoria(categoria.id);
      setMensagem("Categoria excluida com sucesso.");

      if (categoriaEditando?.id === categoria.id) {
        limparFormulario();
      }

      await carregarCategorias();
    } catch (error) {
      setErro(
        extrairMensagemErro(
          error,
          "Nao foi possivel excluir a categoria."
        )
      );
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <section className="page">
      <PageHeader
        title="Categorias"
        description="Organize receitas e despesas por categoria."
      />

      <form className="panel category-form" onSubmit={handleSubmit}>
        <div className="panel-header">
          <div>
            <h2>{categoriaEditando ? "Editar categoria" : "Nova categoria"}</h2>
            <span>Use nomes claros para facilitar os filtros e o dashboard.</span>
          </div>
        </div>

        {erro ? <ErrorState message={erro} /> : null}
        {mensagem ? <div className="state-box success">{mensagem}</div> : null}

        <div className="category-form-grid">
          <label>
            Nome
            <input
              type="text"
              value={formData.nome}
              placeholder="Ex.: Mercado"
              onChange={(event) => atualizarCampo("nome", event.target.value)}
            />
          </label>

          <label>
            Tipo
            <select
              value={formData.tipo}
              onChange={(event) => atualizarCampo("tipo", event.target.value)}
            >
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
            </select>
          </label>

          <label>
            Cor
            <div className="color-input-row">
              <input
                type="color"
                value={formData.cor || "#64748b"}
                onChange={(event) => atualizarCampo("cor", event.target.value)}
              />
              <input
                type="text"
                value={formData.cor || ""}
                placeholder="#64748b"
                onChange={(event) => atualizarCampo("cor", event.target.value)}
              />
            </div>
          </label>

          {formData.tipo === "despesa" ? (
            <label>
              Despesa fixa
              <span className="checkbox-row">
                <input
                  type="checkbox"
                  checked={formData.despesa_fixa}
                  onChange={(event) => atualizarCampo("despesa_fixa", event.target.checked)}
                />
                Marcar como despesa fixa
              </span>
            </label>
          ) : null}
        </div>

        <div className="form-actions">
          {categoriaEditando ? (
            <button className="button" type="button" onClick={limparFormulario}>
              Cancelar edicao
            </button>
          ) : null}
          <button className="button primary" type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : categoriaEditando ? "Salvar alteracoes" : "Criar categoria"}
          </button>
        </div>
      </form>

      <section className="panel filters-panel category-filter-panel">
        <label>
          Filtrar por tipo
          <select value={tipoFiltro} onChange={(event) => setTipoFiltro(event.target.value)}>
            <option value="">Todas</option>
            <option value="receita">Receitas</option>
            <option value="despesa">Despesas</option>
          </select>
        </label>
      </section>

      {loading ? <LoadingState message="Carregando categorias..." /> : null}

      {!loading ? (
        <section className="panel table-panel">
          {categoriasFiltradas.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Despesa fixa</th>
                    <th>Cor</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {categoriasFiltradas.map((categoria) => (
                    <tr key={categoria.id}>
                      <td data-label="Nome">
                        <strong>{categoria.nome}</strong>
                      </td>
                      <td data-label="Tipo">
                        <span className={`type-pill ${categoria.tipo === "receita" ? "income" : "expense"}`}>
                          {categoria.tipo === "receita" ? "Receita" : "Despesa"}
                        </span>
                      </td>
                      <td data-label="Despesa fixa">
                        {categoria.tipo === "despesa" ? (categoria.despesa_fixa ? "Sim" : "Nao") : "-"}
                      </td>
                      <td data-label="Cor">
                        <span className="category-chip">
                          <span
                            className="category-color"
                            style={{ backgroundColor: categoria.cor || "#94a3b8" }}
                          />
                          {categoria.cor || "Sem cor"}
                        </span>
                      </td>
                      <td data-label="Acoes">
                        <div className="table-actions">
                          <button className="button small" type="button" onClick={() => iniciarEdicao(categoria)}>
                            Editar
                          </button>
                          <button
                            className="button small danger"
                            type="button"
                            disabled={excluindoId === categoria.id}
                            onClick={() => handleExcluir(categoria)}
                          >
                            {excluindoId === categoria.id ? "Excluindo..." : "Excluir"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-dashboard">
              <h2>Nenhuma categoria encontrada</h2>
              <p>Crie uma categoria para classificar seus lancamentos.</p>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}

export default Categorias;
