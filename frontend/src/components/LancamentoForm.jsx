import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import ErrorState from "./ErrorState.jsx";
import LoadingState from "./LoadingState.jsx";
import { listarCategorias } from "../services/categoriasService.js";
import {
  atualizarLancamento,
  criarLancamento,
  obterLancamento,
} from "../services/lancamentosService.js";

const valoresIniciais = {
  tipo: "despesa",
  descricao: "",
  valor: "",
  data: "",
  categoria_id: "",
  observacao: "",
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

function validarFormulario(formData) {
  if (!formData.descricao.trim()) {
    return "Informe a descricao.";
  }

  if (!formData.valor || Number(formData.valor) <= 0) {
    return "Informe um valor maior que zero.";
  }

  if (!formData.data) {
    return "Informe a data.";
  }

  if (!formData.categoria_id) {
    return "Selecione uma categoria.";
  }

  return "";
}

function montarPayload(formData) {
  return {
    tipo: formData.tipo,
    descricao: formData.descricao.trim(),
    valor: Number(formData.valor),
    data: formData.data,
    categoria_id: Number(formData.categoria_id),
    observacao: formData.observacao.trim() || null,
  };
}

function LancamentoForm({ lancamentoId }) {
  const navigate = useNavigate();
  const editando = Boolean(lancamentoId);
  const [formData, setFormData] = useState(valoresIniciais);
  const [categorias, setCategorias] = useState([]);
  const [loadingInicial, setLoadingInicial] = useState(editando);
  const [loadingCategorias, setLoadingCategorias] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregarLancamento() {
      if (!editando) {
        return;
      }

      try {
        setLoadingInicial(true);
        setErro("");
        const lancamento = await obterLancamento(lancamentoId);
        setFormData({
          tipo: lancamento.tipo,
          descricao: lancamento.descricao || "",
          valor: String(lancamento.valor || ""),
          data: lancamento.data || "",
          categoria_id: String(lancamento.categoria_id || ""),
          observacao: lancamento.observacao || "",
        });
      } catch (error) {
        setErro("Nao foi possivel carregar o lancamento para edicao.");
      } finally {
        setLoadingInicial(false);
      }
    }

    carregarLancamento();
  }, [editando, lancamentoId]);

  useEffect(() => {
    async function carregarCategoriasCompativeis() {
      try {
        setLoadingCategorias(true);
        const dados = await listarCategorias({ tipo: formData.tipo });
        setCategorias(dados);

        if (
          formData.categoria_id &&
          !dados.some((categoria) => String(categoria.id) === String(formData.categoria_id))
        ) {
          setFormData((dadosAtuais) => ({ ...dadosAtuais, categoria_id: "" }));
        }
      } catch (error) {
        setCategorias([]);
        setErro("Nao foi possivel carregar as categorias.");
      } finally {
        setLoadingCategorias(false);
      }
    }

    carregarCategoriasCompativeis();
  }, [formData.tipo]);

  function atualizarCampo(campo, valor) {
    setFormData((dadosAtuais) => ({
      ...dadosAtuais,
      [campo]: valor,
      ...(campo === "tipo" ? { categoria_id: "" } : {}),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const erroValidacao = validarFormulario(formData);
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }

    try {
      setSalvando(true);
      setErro("");
      const payload = montarPayload(formData);

      if (editando) {
        await atualizarLancamento(lancamentoId, payload);
      } else {
        await criarLancamento(payload);
      }

      navigate("/lancamentos");
    } catch (error) {
      setErro(
        extrairMensagemErro(
          error,
          editando
            ? "Nao foi possivel atualizar o lancamento."
            : "Nao foi possivel criar o lancamento."
        )
      );
    } finally {
      setSalvando(false);
    }
  }

  if (loadingInicial) {
    return <LoadingState message="Carregando dados do lancamento..." />;
  }

  return (
    <form className="panel form-card" onSubmit={handleSubmit}>
      {erro ? <ErrorState message={erro} /> : null}

      <div className="form-grid">
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
          Categoria
          <select
            value={formData.categoria_id}
            disabled={loadingCategorias}
            onChange={(event) => atualizarCampo("categoria_id", event.target.value)}
          >
            <option value="">
              {loadingCategorias ? "Carregando categorias..." : "Selecione"}
            </option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="form-grid-wide">
          Descricao
          <input
            type="text"
            value={formData.descricao}
            placeholder="Ex.: Compra no mercado"
            onChange={(event) => atualizarCampo("descricao", event.target.value)}
          />
        </label>

        <label>
          Valor
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={formData.valor}
            placeholder="0.00"
            onChange={(event) => atualizarCampo("valor", event.target.value)}
          />
        </label>

        <label>
          Data
          <input
            type="date"
            value={formData.data}
            onChange={(event) => atualizarCampo("data", event.target.value)}
          />
        </label>

        <label className="form-grid-wide">
          Observacao
          <textarea
            rows="4"
            value={formData.observacao}
            placeholder="Opcional"
            onChange={(event) => atualizarCampo("observacao", event.target.value)}
          />
        </label>
      </div>

      <div className="form-actions">
        <Link className="button" to="/lancamentos">
          Cancelar
        </Link>
        <button className="button primary" type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar lancamento"}
        </button>
      </div>
    </form>
  );
}

export default LancamentoForm;
