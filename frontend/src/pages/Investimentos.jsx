import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SummaryCard from "../components/SummaryCard.jsx";
import {
  atualizarAtivo,
  atualizarCotacaoAtivo,
  atualizarCotacoesAtivos,
  atualizarMovimentacaoAtivo,
  atualizarProventosAtivos,
  criarMovimentacaoAtivo,
  criarAtivo,
  excluirMovimentacaoAtivo,
  excluirAtivo,
  listarAtivos,
  listarMovimentacoesAtivo,
  listarProventos,
  listarSnapshotsCarteira,
  obterResumoCarteira,
  registrarSnapshotCarteira,
} from "../services/ativosService.js";
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarMoedaPrecisa,
  formatarPercentual,
} from "../utils/formatters.js";

const formularioInicial = {
  ticker: "",
  nome: "",
  tipo: "",
  data_inicial: new Date().toISOString().slice(0, 10),
};

const movimentacaoInicial = {
  tipo: "compra",
  quantidade: "",
  preco_unitario: "",
  fator_numerador: "",
  fator_denominador: "",
  data: new Date().toISOString().slice(0, 10),
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

const pageConfig = {
  carteira: {
    title: "Carteira",
    description: "Acompanhe patrimonio, preco atual e resultado consolidado dos ativos.",
  },
  ativos: {
    title: "Ativos",
    description: "Cadastre ativos e acompanhe a posicao atual de cada ticker.",
  },
  proventos: {
    title: "Proventos",
    description: "Consulte dividendos e rendimentos encontrados no Yahoo Finance.",
  },
  evolucao: {
    title: "Evolucao",
    description: "Acompanhe snapshots e historico da carteira de investimentos.",
  },
};

function Investimentos({ view = "carteira" }) {
  const [ativos, setAtivos] = useState([]);
  const [proventos, setProventos] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [formData, setFormData] = useState(formularioInicial);
  const [movimentacaoData, setMovimentacaoData] = useState(movimentacaoInicial);
  const [ativoEditando, setAtivoEditando] = useState(null);
  const [ativoSelecionado, setAtivoSelecionado] = useState(null);
  const [movimentacaoEditando, setMovimentacaoEditando] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMovimentacoes, setLoadingMovimentacoes] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvandoMovimentacao, setSalvandoMovimentacao] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [atualizandoProventos, setAtualizandoProventos] = useState(false);
  const [registrandoSnapshot, setRegistrandoSnapshot] = useState(false);
  const [atualizandoId, setAtualizandoId] = useState(null);
  const [excluindoId, setExcluindoId] = useState(null);
  const [excluindoMovimentacaoId, setExcluindoMovimentacaoId] = useState(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const temAtivos = ativos.length > 0;
  const configPagina = pageConfig[view] || pageConfig.carteira;
  const mostrarResumo = view === "carteira";
  const mostrarFormularioAtivos = view === "ativos";
  const mostrarTabelaAtivos = view === "carteira" || view === "ativos";
  const mostrarProventos = view === "proventos";
  const mostrarEvolucao = view === "evolucao";

  const resumoNormalizado = useMemo(
    () => ({
      patrimonio_total: resumo?.patrimonio_total ?? 0,
      valor_investido_total: resumo?.valor_investido_total ?? 0,
      lucro_prejuizo_total: resumo?.lucro_prejuizo_total ?? 0,
      rentabilidade_percentual: resumo?.rentabilidade_percentual ?? 0,
      quantidade_ativos: resumo?.quantidade_ativos ?? 0,
      ultima_atualizacao: resumo?.ultima_atualizacao ?? null,
    }),
    [resumo]
  );

  const totalProventos = useMemo(
    () => proventos.reduce((total, provento) => total + Number(provento.valor_estimado || 0), 0),
    [proventos]
  );

  const ultimoSnapshot = snapshots.length ? snapshots[snapshots.length - 1] : null;

  const dadosEvolucao = useMemo(
    () =>
      snapshots.map((snapshot) => ({
        data: snapshot.data_referencia,
        patrimonio: Number(snapshot.patrimonio_total || 0),
        investido: Number(snapshot.valor_investido_total || 0),
        resultado: Number(snapshot.lucro_prejuizo_total || 0),
        rentabilidade: Number(snapshot.rentabilidade_percentual || 0),
        quantidade_ativos: Number(snapshot.quantidade_ativos || 0),
      })),
    [snapshots]
  );

  const resumoEvolucao = useMemo(() => {
    if (!dadosEvolucao.length) {
      return {
        patrimonioInicial: 0,
        patrimonioFinal: 0,
        variacaoPatrimonio: 0,
        variacaoPercentual: 0,
        melhorResultado: 0,
      };
    }

    const primeiro = dadosEvolucao[0];
    const ultimo = dadosEvolucao[dadosEvolucao.length - 1];
    const variacaoPatrimonio = ultimo.patrimonio - primeiro.patrimonio;
    const variacaoPercentual = primeiro.patrimonio
      ? (variacaoPatrimonio / primeiro.patrimonio) * 100
      : 0;
    const melhorResultado = dadosEvolucao.reduce(
      (maior, item) => Math.max(maior, item.resultado),
      dadosEvolucao[0].resultado
    );

    return {
      patrimonioInicial: primeiro.patrimonio,
      patrimonioFinal: ultimo.patrimonio,
      variacaoPatrimonio,
      variacaoPercentual,
      melhorResultado,
    };
  }, [dadosEvolucao]);

  const totalLucroRealizado = useMemo(
    () =>
      movimentacoes
        .filter((movimentacao) => movimentacao.tipo === "venda")
        .reduce((total, movimentacao) => total + Number(movimentacao.lucro_prejuizo || 0), 0),
    [movimentacoes]
  );

  const movimentacaoEhSplit = movimentacaoData.tipo === "split";

  async function carregarCarteira() {
    try {
      setLoading(true);
      setErro("");
      const [ativosData, resumoData, proventosData, snapshotsData] = await Promise.all([
        listarAtivos(),
        obterResumoCarteira(),
        listarProventos(),
        listarSnapshotsCarteira(),
      ]);
      setAtivos(ativosData);
      setResumo(resumoData);
      setProventos(proventosData);
      setSnapshots(snapshotsData);
      if (ativoSelecionado) {
        const ativoAtualizado = ativosData.find((ativo) => ativo.id === ativoSelecionado.id);
        setAtivoSelecionado(ativoAtualizado || null);
      }
    } catch (error) {
      setErro("Nao foi possivel carregar a carteira.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarCarteira();
  }, []);

  function atualizarCampo(campo, valor) {
    setFormData((dadosAtuais) => ({
      ...dadosAtuais,
      [campo]: campo === "ticker" ? valor.toUpperCase() : valor,
    }));
  }

  function atualizarCampoMovimentacao(campo, valor) {
    setMovimentacaoData((dadosAtuais) => ({
      ...dadosAtuais,
      [campo]: valor,
    }));
  }

  function limparFormulario() {
    setFormData(formularioInicial);
    setAtivoEditando(null);
    setErro("");
    setMensagem("");
  }

  async function selecionarAtivo(ativo) {
    try {
      setAtivoSelecionado(ativo);
      limparFormularioMovimentacao();
      setLoadingMovimentacoes(true);
      setErro("");
      setMensagem("");
      const dados = await listarMovimentacoesAtivo(ativo.id);
      setMovimentacoes(dados);
    } catch (error) {
      setMovimentacoes([]);
      setErro("Nao foi possivel carregar as movimentacoes do ativo.");
    } finally {
      setLoadingMovimentacoes(false);
    }
  }

  function iniciarEdicao(ativo) {
    setAtivoEditando(ativo);
    setFormData({
      ticker: ativo.ticker,
      nome: ativo.nome || "",
      tipo: ativo.tipo || "",
      data_inicial: ativo.data_inicial || formularioInicial.data_inicial,
    });
    setErro("");
    setMensagem("");
  }

  function montarPayload() {
    return {
      ticker: formData.ticker.trim().toUpperCase(),
      nome: formData.nome.trim() || null,
      tipo: formData.tipo.trim() || null,
      data_inicial: formData.data_inicial,
    };
  }

  function validarFormulario() {
    if (!formData.ticker.trim()) {
      return "Informe o ticker do ativo.";
    }

    if (!formData.data_inicial) {
      return "Informe a data inicial.";
    }

    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const erroValidacao = validarFormulario();
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }

    try {
      setSalvando(true);
      setErro("");
      setMensagem("");

      const payload = montarPayload();
      if (ativoEditando) {
        await atualizarAtivo(ativoEditando.id, payload);
        setMensagem("Ativo atualizado com sucesso.");
      } else {
        await criarAtivo(payload);
        setMensagem("Ativo cadastrado com sucesso.");
      }

      setFormData(formularioInicial);
      setAtivoEditando(null);
      await carregarCarteira();
    } catch (error) {
      setErro(
        extrairMensagemErro(
          error,
          ativoEditando ? "Nao foi possivel atualizar o ativo." : "Nao foi possivel cadastrar o ativo."
        )
      );
    } finally {
      setSalvando(false);
    }
  }

  async function handleAtualizarTodos() {
    try {
      setAtualizando(true);
      setErro("");
      setMensagem("");
      const resultado = await atualizarCotacoesAtivos();
      await carregarCarteira();

      const resumoProventos = `${resultado.proventos_criados || 0} provento(s) salvo(s)`;
      const resumoSplits = `${resultado.splits_criados || 0} split(s) salvo(s)`;
      if (resultado.falhas) {
        setMensagem(
          `${resultado.atualizados} ativo(s) atualizado(s). ${resultado.falhas} ativo(s) ficaram pendentes. ${resumoSplits}. ${resumoProventos}.`
        );
      } else if (resultado.splits_falhas || resultado.proventos_falhas) {
        setMensagem(
          `${resultado.atualizados} ativo(s) atualizado(s) com sucesso. ${resumoSplits}. ${resumoProventos}. ${resultado.splits_falhas || 0} ativo(s) ficaram pendentes nos splits e ${resultado.proventos_falhas || 0} nos proventos.`
        );
      } else {
        setMensagem(`${resultado.atualizados} ativo(s) atualizado(s) com sucesso. ${resumoSplits}. ${resumoProventos}.`);
      }
    } catch (error) {
      setErro(extrairMensagemErro(error, "Nao foi possivel atualizar a carteira."));
    } finally {
      setAtualizando(false);
    }
  }

  async function handleAtualizarAtivo(ativo) {
    try {
      setAtualizandoId(ativo.id);
      setErro("");
      setMensagem("");
      await atualizarCotacaoAtivo(ativo.id);
      setMensagem(`Cotacao de ${ativo.ticker} atualizada.`);
      await carregarCarteira();
    } catch (error) {
      setErro(extrairMensagemErro(error, `Nao foi possivel atualizar ${ativo.ticker}.`));
    } finally {
      setAtualizandoId(null);
    }
  }

  function validarMovimentacao() {
    if (!ativoSelecionado) {
      return "Selecione um ativo.";
    }

    if (movimentacaoData.tipo === "split") {
      if (!movimentacaoData.fator_numerador || Number(movimentacaoData.fator_numerador) <= 0) {
        return "Informe um fator numerador maior que zero.";
      }

      if (!movimentacaoData.fator_denominador || Number(movimentacaoData.fator_denominador) <= 0) {
        return "Informe um fator denominador maior que zero.";
      }
    } else {
      if (!movimentacaoData.quantidade || Number(movimentacaoData.quantidade) <= 0) {
        return "Informe uma quantidade maior que zero.";
      }

      if (!movimentacaoData.preco_unitario || Number(movimentacaoData.preco_unitario) <= 0) {
        return "Informe um preco unitario maior que zero.";
      }
    }

    if (!movimentacaoData.data) {
      return "Informe a data da movimentacao.";
    }

    return "";
  }

  function iniciarEdicaoMovimentacao(movimentacao) {
    setMovimentacaoEditando(movimentacao);
    setMovimentacaoData({
      tipo: movimentacao.tipo,
      quantidade: movimentacao.tipo === "split" ? "" : String(movimentacao.quantidade),
      preco_unitario: movimentacao.tipo === "split" ? "" : String(movimentacao.preco_unitario),
      fator_numerador: movimentacao.fator_numerador ? String(movimentacao.fator_numerador) : "",
      fator_denominador: movimentacao.fator_denominador ? String(movimentacao.fator_denominador) : "",
      data: movimentacao.data,
      observacao: movimentacao.observacao || "",
    });
    setErro("");
    setMensagem("");
  }

  function limparFormularioMovimentacao() {
    setMovimentacaoEditando(null);
    setMovimentacaoData(movimentacaoInicial);
  }

  async function handleCriarMovimentacao(event) {
    event.preventDefault();

    const erroValidacao = validarMovimentacao();
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }

    try {
      setSalvandoMovimentacao(true);
      setErro("");
      setMensagem("");
      const payload = {
        tipo: movimentacaoData.tipo,
        quantidade: movimentacaoData.tipo === "split" ? null : Number(movimentacaoData.quantidade),
        preco_unitario: movimentacaoData.tipo === "split" ? null : Number(movimentacaoData.preco_unitario),
        fator_numerador: movimentacaoData.tipo === "split" ? Number(movimentacaoData.fator_numerador) : null,
        fator_denominador: movimentacaoData.tipo === "split" ? Number(movimentacaoData.fator_denominador) : null,
        data: movimentacaoData.data,
        observacao: movimentacaoData.observacao.trim() || null,
      };

      if (movimentacaoEditando) {
        await atualizarMovimentacaoAtivo(movimentacaoEditando.id, payload);
        setMensagem("Movimentacao atualizada com sucesso.");
      } else {
        await criarMovimentacaoAtivo(ativoSelecionado.id, payload);
        setMensagem("Movimentacao registrada com sucesso.");
      }

      limparFormularioMovimentacao();
      await carregarCarteira();
      const movimentacoesAtualizadas = await listarMovimentacoesAtivo(ativoSelecionado.id);
      setMovimentacoes(movimentacoesAtualizadas);
    } catch (error) {
      setErro(
        extrairMensagemErro(
          error,
          movimentacaoEditando
            ? "Nao foi possivel atualizar a movimentacao."
            : "Nao foi possivel registrar a movimentacao."
        )
      );
    } finally {
      setSalvandoMovimentacao(false);
    }
  }

  async function handleExcluirMovimentacao(movimentacao) {
    const confirmou = window.confirm("Deseja excluir esta movimentacao?");

    if (!confirmou) {
      return;
    }

    try {
      setExcluindoMovimentacaoId(movimentacao.id);
      setErro("");
      setMensagem("");
      await excluirMovimentacaoAtivo(movimentacao.id);
      setMensagem("Movimentacao excluida com sucesso.");
      if (movimentacaoEditando?.id === movimentacao.id) {
        limparFormularioMovimentacao();
      }
      await carregarCarteira();
      const movimentacoesAtualizadas = await listarMovimentacoesAtivo(ativoSelecionado.id);
      setMovimentacoes(movimentacoesAtualizadas);
    } catch (error) {
      setErro(extrairMensagemErro(error, "Nao foi possivel excluir a movimentacao."));
    } finally {
      setExcluindoMovimentacaoId(null);
    }
  }

  async function handleAtualizarProventos() {
    try {
      setAtualizandoProventos(true);
      setErro("");
      setMensagem("");
      const resultado = await atualizarProventosAtivos();
      await carregarCarteira();
      const removidos = (resultado.resultados || []).reduce(
        (total, item) => total + Number(item.proventos_removidos || 0),
        0
      );
      const ajustados = (resultado.resultados || []).reduce(
        (total, item) => total + Number(item.proventos_ajustados || 0),
        0
      );

      if (resultado.falhas) {
        setMensagem(
          `${resultado.total_proventos_criados} novo(s) provento(s) salvo(s). ${ajustados} data(s) ajustada(s). ${removidos} antigo(s) removido(s). ${resultado.falhas} ativo(s) ficaram pendentes.`
        );
      } else if (resultado.total_proventos_criados) {
        setMensagem(`${resultado.total_proventos_criados} novo(s) provento(s) salvo(s). ${ajustados} data(s) ajustada(s). ${removidos} antigo(s) removido(s).`);
      } else if (ajustados) {
        setMensagem(`${ajustados} data(s) com foram ajustada(s) a partir do Yahoo Finance.`);
      } else if (removidos) {
        setMensagem(`${removidos} provento(s) anterior(es) a data inicial foram removidos.`);
      } else {
        setMensagem("Nenhum provento novo encontrado para os ativos cadastrados.");
      }
    } catch (error) {
      setErro(extrairMensagemErro(error, "Nao foi possivel atualizar os proventos."));
    } finally {
      setAtualizandoProventos(false);
    }
  }

  async function handleRegistrarSnapshot() {
    try {
      setRegistrandoSnapshot(true);
      setErro("");
      setMensagem("");
      await registrarSnapshotCarteira();
      await carregarCarteira();
      setMensagem("Snapshot da carteira registrado com sucesso.");
    } catch (error) {
      setErro(extrairMensagemErro(error, "Nao foi possivel registrar o snapshot da carteira."));
    } finally {
      setRegistrandoSnapshot(false);
    }
  }

  async function handleExcluir(ativo) {
    const confirmou = window.confirm(`Deseja excluir o ativo "${ativo.ticker}"?`);

    if (!confirmou) {
      return;
    }

    try {
      setExcluindoId(ativo.id);
      setErro("");
      setMensagem("");
      await excluirAtivo(ativo.id);
      setMensagem("Ativo excluido com sucesso.");

      if (ativoEditando?.id === ativo.id) {
        limparFormulario();
      }
      if (ativoSelecionado?.id === ativo.id) {
        setAtivoSelecionado(null);
        setMovimentacoes([]);
        limparFormularioMovimentacao();
      }

      await carregarCarteira();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Nao foi possivel excluir o ativo."));
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <section className="page">
      <PageHeader
        title={configPagina.title}
        description={configPagina.description}
        action={
          <div className="page-actions">
            {view === "proventos" ? (
              <button className="button primary" type="button" disabled={atualizandoProventos || !temAtivos} onClick={handleAtualizarProventos}>
                {atualizandoProventos ? "Buscando..." : "Atualizar proventos"}
              </button>
            ) : null}
            {view === "evolucao" ? (
              <button className="button primary" type="button" disabled={registrandoSnapshot || !temAtivos} onClick={handleRegistrarSnapshot}>
                {registrandoSnapshot ? "Registrando..." : "Registrar snapshot"}
              </button>
            ) : null}
            {view === "carteira" ? (
              <button className="button primary" type="button" disabled={atualizando || !temAtivos} onClick={handleAtualizarTodos}>
                {atualizando ? "Atualizando..." : "Atualizar agora"}
              </button>
            ) : null}
          </div>
        }
      />

      {erro ? <ErrorState message={erro} /> : null}
      {mensagem ? <div className="state-box success">{mensagem}</div> : null}

      {mostrarResumo ? (
        <>
          <div className="summary-grid">
            <SummaryCard label="Patrimonio total" value={formatarMoeda(resumoNormalizado.patrimonio_total)} tone="balance" />
            <SummaryCard label="Valor investido" value={formatarMoeda(resumoNormalizado.valor_investido_total)} />
            <SummaryCard
              label="Lucro ou prejuizo"
              value={formatarMoeda(resumoNormalizado.lucro_prejuizo_total)}
              tone={Number(resumoNormalizado.lucro_prejuizo_total) >= 0 ? "income" : "expense"}
            />
            <SummaryCard
              label="Rentabilidade"
              value={formatarPercentual(resumoNormalizado.rentabilidade_percentual)}
              tone={Number(resumoNormalizado.rentabilidade_percentual) >= 0 ? "income" : "expense"}
            />
          </div>

          <section className="panel investment-status-panel">
            <div>
              <span className="insight-kicker">Carteira</span>
              <strong>{resumoNormalizado.quantidade_ativos} ativo(s) cadastrado(s)</strong>
            </div>
            <div>
              <span className="insight-kicker">Ultima atualizacao</span>
              <strong>{resumoNormalizado.ultima_atualizacao ? formatarDataHora(resumoNormalizado.ultima_atualizacao) : "Sem cotacoes"}</strong>
            </div>
          </section>

          <section className="investment-overview-grid">
            <article className="panel investment-overview-card">
            <span className="insight-kicker">Ativos</span>
            <strong>{resumoNormalizado.quantidade_ativos} posicao(oes)</strong>
              <p>Cadastre ativos e registre compras ou vendas no historico de movimentacoes.</p>
              <Link className="button small" to="/investimentos/ativos">
                Gerenciar ativos
              </Link>
            </article>

            <article className="panel investment-overview-card">
              <span className="insight-kicker">Proventos</span>
              <strong>{formatarMoeda(totalProventos)}</strong>
              <p>Veja dividendos e rendimentos encontrados para os ativos cadastrados.</p>
              <Link className="button small" to="/investimentos/proventos">
                Ver proventos
              </Link>
            </article>

            <article className="panel investment-overview-card">
              <span className="insight-kicker">Evolucao</span>
              <strong>{ultimoSnapshot ? formatarData(ultimoSnapshot.data_referencia) : "Sem snapshot"}</strong>
              <p>Acompanhe o historico do patrimonio a partir dos snapshots da carteira.</p>
              <Link className="button small" to="/investimentos/evolucao">
                Ver evolucao
              </Link>
            </article>
          </section>
        </>
      ) : null}

      {mostrarFormularioAtivos ? (
        <form className="panel investment-form" onSubmit={handleSubmit}>
        <div className="panel-header">
            <div>
            <h2>{ativoEditando ? "Editar ativo" : "Novo ativo"}</h2>
            <span>Cadastre o ativo e registre a posicao apenas pelas movimentacoes.</span>
          </div>
        </div>

        <div className="investment-form-grid">
          <label>
            Ticker
            <input
              type="text"
              value={formData.ticker}
              placeholder="Ex.: PETR4, MXRF11, AAPL"
              onChange={(event) => atualizarCampo("ticker", event.target.value)}
            />
          </label>

          <label>
            Nome
            <input
              type="text"
              value={formData.nome}
              placeholder="Opcional"
              onChange={(event) => atualizarCampo("nome", event.target.value)}
            />
          </label>

          <label>
            Tipo
            <input
              type="text"
              value={formData.tipo}
              placeholder="Ex.: acao, fii, etf"
              onChange={(event) => atualizarCampo("tipo", event.target.value)}
            />
          </label>

          <label>
            Data inicial
            <input
              type="date"
              value={formData.data_inicial}
              onChange={(event) => atualizarCampo("data_inicial", event.target.value)}
            />
          </label>
        </div>

        <div className="form-actions">
          {ativoEditando ? (
            <button className="button" type="button" onClick={limparFormulario}>
              Cancelar edicao
            </button>
          ) : null}
          <button className="button primary" type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : ativoEditando ? "Salvar alteracoes" : "Cadastrar ativo"}
          </button>
        </div>
        </form>
      ) : null}

      {loading ? <LoadingState message="Carregando carteira..." /> : null}

      {!loading && mostrarTabelaAtivos ? (
        <section className="panel table-panel">
          {ativos.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ativo</th>
                    <th>Quantidade</th>
                    <th>Preco medio</th>
                    <th>Preco atual</th>
                    <th>Investido</th>
                    <th>Valor atual</th>
                    <th>Resultado</th>
                    <th>{view === "ativos" ? "Acoes" : "Atalhos"}</th>
                  </tr>
                </thead>
                <tbody>
                  {ativos.map((ativo) => {
                    const resultado = Number(ativo.lucro_prejuizo || 0);
                    const temCotacao = ativo.ultimo_preco !== null && ativo.ultimo_preco !== undefined;

                    return (
                      <tr key={ativo.id}>
                        <td data-label="Ativo">
                          <strong>{ativo.ticker}</strong>
                          <span>{ativo.nome || ativo.tipo || "Sem nome"}</span>
                        </td>
                        <td data-label="Quantidade">{Number(ativo.quantidade).toLocaleString("pt-BR")}</td>
                        <td data-label="Preco medio">{formatarMoeda(ativo.preco_medio)}</td>
                        <td data-label="Preco atual">
                          {temCotacao ? (
                            <>
                              <strong>{formatarMoeda(ativo.ultimo_preco)}</strong>
                              <span>{ativo.ultima_atualizacao ? formatarDataHora(ativo.ultima_atualizacao) : ""}</span>
                            </>
                          ) : (
                            <span className="muted">Pendente</span>
                          )}
                        </td>
                        <td data-label="Investido">{formatarMoeda(ativo.valor_investido)}</td>
                        <td data-label="Valor atual">{temCotacao ? formatarMoeda(ativo.valor_atual) : "-"}</td>
                        <td data-label="Resultado">
                          {temCotacao ? (
                            <>
                              <strong className={resultado >= 0 ? "value-income" : "value-expense"}>
                                {formatarMoeda(ativo.lucro_prejuizo)}
                              </strong>
                              <span>{formatarPercentual(ativo.rentabilidade_percentual)}</span>
                            </>
                          ) : (
                            <span className="muted">Atualize a cotacao</span>
                          )}
                        </td>
                        <td data-label="Acoes">
                          <div className="table-actions">
                            <button
                              className="button small"
                              type="button"
                              disabled={atualizandoId === ativo.id}
                              onClick={() => handleAtualizarAtivo(ativo)}
                            >
                              {atualizandoId === ativo.id ? "Atualizando..." : "Atualizar"}
                            </button>
                            {view === "ativos" ? (
                              <>
                                <button className="button small" type="button" onClick={() => iniciarEdicao(ativo)}>
                                  Editar
                                </button>
                                <button className="button small" type="button" onClick={() => selecionarAtivo(ativo)}>
                                  Movimentacoes
                                </button>
                                <button
                                  className="button small danger"
                                  type="button"
                                  disabled={excluindoId === ativo.id}
                                  onClick={() => handleExcluir(ativo)}
                                >
                                  {excluindoId === ativo.id ? "Excluindo..." : "Excluir"}
                                </button>
                              </>
                            ) : (
                              <Link className="button small" to="/investimentos/ativos">
                                Gerenciar
                              </Link>
                            )}
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
              <h2>Nenhum ativo cadastrado</h2>
              <p>Cadastre seu primeiro ativo para acompanhar a posicao e atualizar cotacoes.</p>
            </div>
          )}
        </section>
      ) : null}

      {!loading && mostrarFormularioAtivos && ativoSelecionado ? (
        <section className="panel investment-movements-panel">
          <div className="panel-header">
            <div>
              <h2>Movimentacoes de {ativoSelecionado.ticker}</h2>
              <span>
                Posicao atual: {Number(ativoSelecionado.quantidade).toLocaleString("pt-BR")} cota(s) a{" "}
                {formatarMoeda(ativoSelecionado.preco_medio)}
              </span>
            </div>
            <strong className={totalLucroRealizado >= 0 ? "value-income" : "value-expense"}>
              {formatarMoeda(totalLucroRealizado)}
            </strong>
          </div>

          <form className="movement-form-grid" onSubmit={handleCriarMovimentacao}>
            <label>
              Tipo
              <select
                value={movimentacaoData.tipo}
                onChange={(event) => atualizarCampoMovimentacao("tipo", event.target.value)}
              >
                <option value="compra">Compra</option>
                <option value="venda">Venda</option>
                <option value="split">Split</option>
              </select>
            </label>

            {!movimentacaoEhSplit ? (
              <>
                <label>
                  Quantidade
                  <input
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    value={movimentacaoData.quantidade}
                    placeholder="0"
                    onChange={(event) => atualizarCampoMovimentacao("quantidade", event.target.value)}
                  />
                </label>

                <label>
                  Preco unitario
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={movimentacaoData.preco_unitario}
                    placeholder="0.00"
                    onChange={(event) => atualizarCampoMovimentacao("preco_unitario", event.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Fator numerador
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={movimentacaoData.fator_numerador}
                    placeholder="10"
                    onChange={(event) => atualizarCampoMovimentacao("fator_numerador", event.target.value)}
                  />
                </label>

                <label>
                  Fator denominador
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={movimentacaoData.fator_denominador}
                    placeholder="1"
                    onChange={(event) => atualizarCampoMovimentacao("fator_denominador", event.target.value)}
                  />
                </label>
              </>
            )}

            <label>
              Data
              <input
                type="date"
                value={movimentacaoData.data}
                onChange={(event) => atualizarCampoMovimentacao("data", event.target.value)}
              />
            </label>

            <label>
              Observacao
              <input
                type="text"
                value={movimentacaoData.observacao}
                placeholder="Opcional"
                onChange={(event) => atualizarCampoMovimentacao("observacao", event.target.value)}
              />
            </label>

            <button className="button primary" type="submit" disabled={salvandoMovimentacao}>
              {salvandoMovimentacao ? "Salvando..." : movimentacaoEditando ? "Salvar movimentacao" : "Adicionar"}
            </button>
            {movimentacaoEditando ? (
              <button className="button" type="button" onClick={limparFormularioMovimentacao}>
                Cancelar
              </button>
            ) : null}
          </form>

          {loadingMovimentacoes ? <LoadingState message="Carregando movimentacoes..." /> : null}

          {!loadingMovimentacoes ? (
            movimentacoes.length ? (
              <div className="table-scroll movement-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Tipo</th>
                      <th>Quantidade</th>
                      <th>Preco unitario</th>
                      <th>Total</th>
                      <th>Preco medio</th>
                      <th>Lucro/prejuizo</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentacoes.map((movimentacao) => {
                      const ehVenda = movimentacao.tipo === "venda";
                      const ehSplit = movimentacao.tipo === "split";
                      const resultado = Number(movimentacao.lucro_prejuizo || 0);
                      const fatorSplit =
                        movimentacao.fator_numerador && movimentacao.fator_denominador
                          ? `${movimentacao.fator_numerador}:${movimentacao.fator_denominador}`
                          : "-";

                      return (
                        <tr key={movimentacao.id}>
                          <td data-label="Data">{formatarData(movimentacao.data)}</td>
                          <td data-label="Tipo">
                            <span className={`type-pill ${ehSplit ? "neutral" : ehVenda ? "expense" : "income"}`}>
                              {ehSplit ? `Split ${fatorSplit}` : ehVenda ? "Venda" : "Compra"}
                            </span>
                          </td>
                          <td data-label="Quantidade">
                            {ehSplit ? "-" : Number(movimentacao.quantidade).toLocaleString("pt-BR")}
                          </td>
                          <td data-label="Preco unitario">
                            {ehSplit ? fatorSplit : formatarMoeda(movimentacao.preco_unitario)}
                          </td>
                          <td data-label="Total">{ehSplit ? "-" : formatarMoeda(movimentacao.valor_total)}</td>
                          <td data-label="Preco medio">
                            {formatarMoeda(movimentacao.preco_medio_antes)} {"->"}{" "}
                            {formatarMoeda(movimentacao.preco_medio_depois)}
                          </td>
                          <td
                            data-label="Lucro/prejuizo"
                            className={resultado >= 0 ? "value-income" : "value-expense"}
                          >
                            {ehVenda ? formatarMoeda(movimentacao.lucro_prejuizo) : "-"}
                          </td>
                          <td data-label="Acoes">
                            <div className="table-actions">
                              <button
                                className="button small"
                                type="button"
                                onClick={() => iniciarEdicaoMovimentacao(movimentacao)}
                              >
                                Editar
                              </button>
                              <button
                                className="button small danger"
                                type="button"
                                disabled={excluindoMovimentacaoId === movimentacao.id}
                                onClick={() => handleExcluirMovimentacao(movimentacao)}
                              >
                                {excluindoMovimentacaoId === movimentacao.id ? "Excluindo..." : "Excluir"}
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
                <h2>Nenhuma movimentacao cadastrada</h2>
                <p>Adicione uma compra ou venda para acompanhar o historico deste ativo.</p>
              </div>
            )
          ) : null}
        </section>
      ) : null}

      {mostrarProventos ? (
        <article className="panel table-panel">
          <div className="panel-header">
            <div>
              <h2>Proventos</h2>
              <span>Dividendos e rendimentos encontrados no Yahoo Finance.</span>
            </div>
            <strong className="panel-total income">{formatarMoeda(totalProventos)}</strong>
          </div>
          {proventos.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ativo</th>
                    <th>Tipo</th>
                    <th>Data com</th>
                    <th>Valor por cota</th>
                    <th>Quantidade</th>
                    <th>Total estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {proventos.map((provento) => (
                    <tr key={provento.id}>
                      <td data-label="Ativo">
                        <strong>{provento.ticker}</strong>
                        <span>{provento.fonte}</span>
                      </td>
                      <td data-label="Tipo">{provento.tipo || "Provento"}</td>
                      <td data-label="Data com">
                        {provento.data_com ? formatarData(provento.data_com) : "-"}
                      </td>
                      <td data-label="Valor por cota">{formatarMoedaPrecisa(provento.valor_por_cota)}</td>
                      <td data-label="Quantidade">
                        {provento.quantidade_base ? Number(provento.quantidade_base).toLocaleString("pt-BR") : "-"}
                      </td>
                      <td data-label="Total estimado">
                        <strong className="value-income">{formatarMoeda(provento.valor_estimado)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-dashboard">
              <h2>Nenhum provento encontrado</h2>
              <p>Use o botao Atualizar proventos. Alguns ativos podem nao ter eventos disponiveis no Yahoo Finance.</p>
            </div>
          )}
        </article>
      ) : null}

      {mostrarEvolucao ? (
        <>
          {dadosEvolucao.length ? (
            <div className="summary-grid">
              <SummaryCard
                label="Patrimonio inicial"
                value={formatarMoeda(resumoEvolucao.patrimonioInicial)}
              />
              <SummaryCard
                label="Patrimonio atual"
                value={formatarMoeda(resumoEvolucao.patrimonioFinal)}
                tone="balance"
              />
              <SummaryCard
                label="Variacao no periodo"
                value={formatarMoeda(resumoEvolucao.variacaoPatrimonio)}
                tone={resumoEvolucao.variacaoPatrimonio >= 0 ? "income" : "expense"}
              />
              <SummaryCard
                label="Variacao percentual"
                value={formatarPercentual(resumoEvolucao.variacaoPercentual)}
                tone={resumoEvolucao.variacaoPercentual >= 0 ? "income" : "expense"}
              />
            </div>
          ) : null}

          <article className="panel evolution-panel">
            <div className="panel-header">
              <div>
                <h2>Evolucao da carteira</h2>
                <span>Historico gerado a partir dos snapshots da carteira.</span>
              </div>
              <button className="button small" type="button" disabled={registrandoSnapshot || !temAtivos} onClick={handleRegistrarSnapshot}>
                {registrandoSnapshot ? "Registrando..." : "Registrar snapshot"}
              </button>
            </div>
            {dadosEvolucao.length ? (
              <div className="chart-frame evolution-chart-frame">
                <ResponsiveContainer width="100%" height={380}>
                  <LineChart data={dadosEvolucao} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="data"
                      tickFormatter={formatarData}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(valor) => formatarMoeda(valor)}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={88}
                    />
                    <Tooltip
                      formatter={(valor, nome) => [formatarMoeda(valor), nome]}
                      labelFormatter={(data) => formatarData(data)}
                      contentStyle={{
                        border: "1px solid #dce4ef",
                        borderRadius: 10,
                        boxShadow: "0 14px 34px rgb(15 23 42 / 8%)",
                      }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Line type="monotone" dataKey="patrimonio" name="Patrimonio" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="investido" name="Investido" stroke="#64748b" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="resultado" name="Resultado" stroke="#15803d" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty-chart">Registre um snapshot para comecar a acompanhar a evolucao da carteira.</div>
            )}
          </article>

          {dadosEvolucao.length ? (
            <article className="panel table-panel">
              <div className="panel-header">
                <div>
                  <h2>Historico de snapshots</h2>
                  <span>Valores consolidados salvos para comparacao ao longo do tempo.</span>
                </div>
                <strong className={resumoEvolucao.melhorResultado >= 0 ? "value-income" : "value-expense"}>
                  Melhor resultado: {formatarMoeda(resumoEvolucao.melhorResultado)}
                </strong>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Ativos</th>
                      <th>Patrimonio</th>
                      <th>Investido</th>
                      <th>Resultado</th>
                      <th>Rentabilidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...dadosEvolucao].reverse().map((snapshot) => (
                      <tr key={snapshot.data}>
                        <td data-label="Data">{formatarData(snapshot.data)}</td>
                        <td data-label="Ativos">{snapshot.quantidade_ativos}</td>
                        <td data-label="Patrimonio">{formatarMoeda(snapshot.patrimonio)}</td>
                        <td data-label="Investido">{formatarMoeda(snapshot.investido)}</td>
                        <td
                          data-label="Resultado"
                          className={snapshot.resultado >= 0 ? "value-income" : "value-expense"}
                        >
                          {formatarMoeda(snapshot.resultado)}
                        </td>
                        <td
                          data-label="Rentabilidade"
                          className={snapshot.rentabilidade >= 0 ? "value-income" : "value-expense"}
                        >
                          {formatarPercentual(snapshot.rentabilidade)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export default Investimentos;
