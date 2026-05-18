import { useEffect, useState } from "react";

import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import {
  atualizarCartao,
  criarCartao,
  excluirCartao,
  listarCartoes,
} from "../services/cartoesService.js";
import { formatarMoeda } from "../utils/formatters.js";

const formularioInicial = {
  nome: "",
  bandeira: "",
  limite: "",
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

function Cartoes() {
  const [cartoes, setCartoes] = useState([]);
  const [formData, setFormData] = useState(formularioInicial);
  const [cartaoEditando, setCartaoEditando] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  async function carregarCartoes() {
    try {
      setLoading(true);
      setErro("");
      const dados = await listarCartoes();
      setCartoes(dados);
    } catch (error) {
      setErro("Nao foi possivel carregar os cartoes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarCartoes();
  }, []);

  function atualizarCampo(campo, valor) {
    setFormData((dadosAtuais) => ({
      ...dadosAtuais,
      [campo]: valor,
    }));
  }

  function limparFormulario() {
    setFormData(formularioInicial);
    setCartaoEditando(null);
    setMensagem("");
    setErro("");
  }

  function iniciarEdicao(cartao) {
    setCartaoEditando(cartao);
    setFormData({
      nome: cartao.nome,
      bandeira: cartao.bandeira,
      limite: String(cartao.limite || ""),
    });
    setMensagem("");
    setErro("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!formData.nome.trim()) {
      setErro("Informe o nome do cartao.");
      return;
    }

    if (!formData.bandeira.trim()) {
      setErro("Informe a bandeira do cartao.");
      return;
    }

    if (formData.limite === "" || Number(formData.limite) < 0) {
      setErro("Informe um limite maior ou igual a zero.");
      return;
    }

    const payload = {
      nome: formData.nome.trim(),
      bandeira: formData.bandeira.trim(),
      limite: Number(formData.limite),
    };

    try {
      setSalvando(true);
      setErro("");
      setMensagem("");

      if (cartaoEditando) {
        await atualizarCartao(cartaoEditando.id, payload);
        setMensagem("Cartao atualizado com sucesso.");
      } else {
        await criarCartao(payload);
        setMensagem("Cartao criado com sucesso.");
      }

      setFormData(formularioInicial);
      setCartaoEditando(null);
      await carregarCartoes();
    } catch (error) {
      setErro(
        extrairMensagemErro(
          error,
          cartaoEditando ? "Nao foi possivel atualizar o cartao." : "Nao foi possivel criar o cartao."
        )
      );
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(cartao) {
    const confirmou = window.confirm(`Deseja excluir o cartao "${cartao.nome}"?`);

    if (!confirmou) {
      return;
    }

    try {
      setExcluindoId(cartao.id);
      setErro("");
      setMensagem("");
      await excluirCartao(cartao.id);
      setMensagem("Cartao excluido com sucesso.");

      if (cartaoEditando?.id === cartao.id) {
        limparFormulario();
      }

      await carregarCartoes();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Nao foi possivel excluir o cartao."));
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <section className="page">
      <PageHeader
        title="Cartoes"
        description="Cadastre os cartoes usados em lancamentos no credito."
      />

      <form className="panel category-form" onSubmit={handleSubmit}>
        <div className="panel-header">
          <div>
            <h2>{cartaoEditando ? "Editar cartao" : "Novo cartao"}</h2>
            <span>Use nomes claros para identificar os lancamentos no credito.</span>
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
              placeholder="Ex.: Nubank"
              onChange={(event) => atualizarCampo("nome", event.target.value)}
            />
          </label>

          <label>
            Bandeira
            <input
              type="text"
              value={formData.bandeira}
              placeholder="Ex.: Mastercard"
              onChange={(event) => atualizarCampo("bandeira", event.target.value)}
            />
          </label>

          <label>
            Limite
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.limite}
              placeholder="0.00"
              onChange={(event) => atualizarCampo("limite", event.target.value)}
            />
          </label>
        </div>

        <div className="form-actions">
          {cartaoEditando ? (
            <button className="button" type="button" onClick={limparFormulario}>
              Cancelar edicao
            </button>
          ) : null}
          <button className="button primary" type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : cartaoEditando ? "Salvar alteracoes" : "Criar cartao"}
          </button>
        </div>
      </form>

      {loading ? <LoadingState message="Carregando cartoes..." /> : null}

      {!loading ? (
        <section className="panel table-panel">
          {cartoes.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Bandeira</th>
                    <th>Limite</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {cartoes.map((cartao) => (
                    <tr key={cartao.id}>
                      <td data-label="Nome">
                        <strong>{cartao.nome}</strong>
                      </td>
                      <td data-label="Bandeira">{cartao.bandeira}</td>
                      <td data-label="Limite">{formatarMoeda(cartao.limite)}</td>
                      <td data-label="Acoes">
                        <div className="table-actions">
                          <button className="button small" type="button" onClick={() => iniciarEdicao(cartao)}>
                            Editar
                          </button>
                          <button
                            className="button small danger"
                            type="button"
                            disabled={excluindoId === cartao.id}
                            onClick={() => handleExcluir(cartao)}
                          >
                            {excluindoId === cartao.id ? "Excluindo..." : "Excluir"}
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
              <h2>Nenhum cartao cadastrado</h2>
              <p>Crie um cartao para vincular aos lancamentos no credito.</p>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}

export default Cartoes;
