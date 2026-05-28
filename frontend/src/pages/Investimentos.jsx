import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
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
  obterEvolucaoCarteira,
  obterResumoCarteira,
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

const filtroProventosInicial = {
  dataInicio: "",
  dataFim: "",
  ativoId: "",
  buscaAtivo: "",
};

function numero(valor) {
  return Number(valor || 0);
}

function obterMes(data) {
  return data ? data.slice(0, 7) : "";
}

function somarMeses(mes, quantidade) {
  const [ano, mesNumero] = mes.split("-").map(Number);
  const data = new Date(ano, mesNumero - 1 + quantidade, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function obterMesAtual() {
  return new Date().toISOString().slice(0, 7);
}

function obterMesProventoGrafico(provento, mesesOriginaisPorAtivo, mesesUsadosPorAtivo, ehFii) {
  const mesOriginal = obterMes(provento.data_com || provento.data_pagamento);
  if (!mesOriginal) {
    return "";
  }

  if (!ehFii) {
    return mesOriginal;
  }

  const ticker = provento.ticker || String(provento.ativo_id || "ativo");
  const mesesOriginais = mesesOriginaisPorAtivo.get(ticker) || new Set();
  const mesesUsados = mesesUsadosPorAtivo.get(ticker) || new Set();
  let mesGrafico = mesOriginal;

  if (mesesUsados.has(mesOriginal)) {
    const candidato = somarMeses(mesOriginal, 1);
    if (candidato <= obterMesAtual() && !mesesUsados.has(candidato) && !mesesOriginais.has(candidato)) {
      mesGrafico = candidato;
    }
  }

  mesesUsados.add(mesGrafico);
  mesesUsadosPorAtivo.set(ticker, mesesUsados);
  return mesGrafico;
}

function deduplicarProventosGrafico(proventos, ativosPorId) {
  const mapa = new Map();

  proventos.forEach((provento) => {
    const ativo = ativosPorId.get(provento.ativo_id);
    const ticker = provento.ticker || ativo?.ticker || String(provento.ativo_id || "ativo");
    const ehFii = (ativo?.tipo || "").toLowerCase() === "fii" || ticker.toUpperCase().endsWith("11");
    const mes = obterMes(provento.data_com || provento.data_pagamento);

    if (!ehFii || !mes) {
      mapa.set(`evento-${provento.id}`, provento);
      return;
    }

    const chave = `${ticker}-${mes}`;
    const atual = mapa.get(chave);
    if (!atual) {
      mapa.set(chave, provento);
      return;
    }

    const valorAtual = numero(atual.valor_estimado);
    const valorNovo = numero(provento.valor_estimado);
    const dataAtual = atual.data_com || atual.data_pagamento || "";
    const dataNova = provento.data_com || provento.data_pagamento || "";

    if (valorNovo > valorAtual || (valorNovo === valorAtual && dataNova > dataAtual)) {
      mapa.set(chave, provento);
    }
  });

  return [...mapa.values()];
}

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
    description: "Acompanhe a evolucao mensal real da carteira por cotacoes historicas.",
  },
};

function Investimentos({ view = "carteira" }) {
  const [ativos, setAtivos] = useState([]);
  const [proventos, setProventos] = useState([]);
  const [evolucaoCarteira, setEvolucaoCarteira] = useState({ dados: [], avisos: [], atualizado_em: null });
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
  const [atualizandoEvolucao, setAtualizandoEvolucao] = useState(false);
  const [atualizandoId, setAtualizandoId] = useState(null);
  const [excluindoId, setExcluindoId] = useState(null);
  const [excluindoMovimentacaoId, setExcluindoMovimentacaoId] = useState(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [filtrosProventos, setFiltrosProventos] = useState(filtroProventosInicial);

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

  const dadosEvolucao = useMemo(
    () =>
      (evolucaoCarteira.dados || []).map((item) => ({
        mes: item.mes,
        data: item.data_referencia,
        patrimonio: Number(item.patrimonio_total || 0),
        investido: Number(item.valor_investido_total || 0),
        resultado: Number(item.lucro_prejuizo_total || 0),
        rentabilidade: Number(item.rentabilidade_percentual || 0),
        quantidade_ativos: Number(item.quantidade_ativos || 0),
      })),
    [evolucaoCarteira.dados]
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

  const ativosComMetricas = useMemo(() => {
    const patrimonioTotal = numero(resumoNormalizado.patrimonio_total);

    return ativos.map((ativo) => {
      const valorAtual = numero(ativo.valor_atual);
      const valorInvestido = numero(ativo.valor_investido);
      const resultado = numero(ativo.lucro_prejuizo);
      const rentabilidade = numero(ativo.rentabilidade_percentual);
      const participacao = patrimonioTotal ? (valorAtual / patrimonioTotal) * 100 : 0;

      return {
        ...ativo,
        valorAtualNumero: valorAtual,
        valorInvestidoNumero: valorInvestido,
        resultadoNumero: resultado,
        rentabilidadeNumero: rentabilidade,
        participacao,
      };
    });
  }, [ativos, resumoNormalizado.patrimonio_total]);

  const totalLucroRealizado = useMemo(
    () =>
      movimentacoes
        .filter((movimentacao) => movimentacao.tipo === "venda")
        .reduce((total, movimentacao) => total + numero(movimentacao.lucro_prejuizo), 0),
    [movimentacoes]
  );

  const ativoSelecionadoMetricas = useMemo(() => {
    if (!ativoSelecionado) {
      return null;
    }

    return (
      ativosComMetricas.find((ativo) => ativo.id === ativoSelecionado.id) || {
        ...ativoSelecionado,
        valorAtualNumero: numero(ativoSelecionado.valor_atual),
        valorInvestidoNumero: numero(ativoSelecionado.valor_investido),
        resultadoNumero: numero(ativoSelecionado.lucro_prejuizo),
        rentabilidadeNumero: numero(ativoSelecionado.rentabilidade_percentual),
        participacao: 0,
      }
    );
  }, [ativoSelecionado, ativosComMetricas]);

  const resumoMovimentacoes = useMemo(() => {
    return movimentacoes.reduce(
      (resumoAtual, movimentacao) => {
        if (movimentacao.tipo === "compra") {
          resumoAtual.compras += 1;
          resumoAtual.totalCompras += numero(movimentacao.valor_total);
        } else if (movimentacao.tipo === "venda") {
          resumoAtual.vendas += 1;
          resumoAtual.totalVendas += numero(movimentacao.valor_total);
        } else if (movimentacao.tipo === "split") {
          resumoAtual.splits += 1;
        }

        return resumoAtual;
      },
      { compras: 0, vendas: 0, splits: 0, totalCompras: 0, totalVendas: 0 }
    );
  }, [movimentacoes]);

  const movimentacaoEhSplit = movimentacaoData.tipo === "split";

  const ativosFiltradosBusca = useMemo(() => {
    const termo = filtrosProventos.buscaAtivo.trim().toLowerCase();

    if (!termo) {
      return ativos;
    }

    return ativos.filter((ativo) => {
      const ticker = ativo.ticker?.toLowerCase() || "";
      const nome = ativo.nome?.toLowerCase() || "";
      return ticker.includes(termo) || nome.includes(termo);
    });
  }, [ativos, filtrosProventos.buscaAtivo]);

  const proventosFiltrados = useMemo(() => {
    return proventos.filter((provento) => {
      const ativoMatch = filtrosProventos.ativoId
        ? String(provento.ativo_id) === filtrosProventos.ativoId
        : true;
      const dataCom = provento.data_com || provento.data_pagamento || "";
      const dataInicioMatch = filtrosProventos.dataInicio
        ? dataCom >= filtrosProventos.dataInicio
        : true;
      const dataFimMatch = filtrosProventos.dataFim ? dataCom <= filtrosProventos.dataFim : true;

      return ativoMatch && dataInicioMatch && dataFimMatch;
    });
  }, [filtrosProventos.ativoId, filtrosProventos.dataFim, filtrosProventos.dataInicio, proventos]);

  const totalProventosGeral = useMemo(
    () => proventos.reduce((total, provento) => total + numero(provento.valor_estimado), 0),
    [proventos]
  );

  const totalProventosFiltrados = useMemo(
    () =>
      proventosFiltrados.reduce(
        (total, provento) => total + numero(provento.valor_estimado),
        0
      ),
    [proventosFiltrados]
  );

  const ativosOrdenadosPorValor = useMemo(
    () => [...ativosComMetricas].sort((a, b) => b.valorAtualNumero - a.valorAtualNumero),
    [ativosComMetricas]
  );

  const maiorPosicao = ativosOrdenadosPorValor[0] || null;
  const ativosComCotacao = ativosComMetricas.filter(
    (ativo) => ativo.ultimo_preco !== null && ativo.ultimo_preco !== undefined
  );
  const melhorDesempenho = ativosComCotacao.length
    ? [...ativosComCotacao].sort((a, b) => b.rentabilidadeNumero - a.rentabilidadeNumero)[0]
    : null;
  const piorDesempenho = ativosComCotacao.length
    ? [...ativosComCotacao].sort((a, b) => a.rentabilidadeNumero - b.rentabilidadeNumero)[0]
    : null;
  const ultimoProvento = proventos[0] || null;

  const topAlocacao = ativosOrdenadosPorValor.filter((ativo) => ativo.valorAtualNumero > 0).slice(0, 6);

  const proventosPorAtivo = useMemo(() => {
    const mapa = new Map();

    proventosFiltrados.forEach((provento) => {
      const chave = provento.ticker || "Ativo";
      const itemAtual = mapa.get(chave) || { ticker: chave, total: 0, eventos: 0 };
      itemAtual.total += numero(provento.valor_estimado);
      itemAtual.eventos += 1;
      mapa.set(chave, itemAtual);
    });

    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [proventosFiltrados]);

  const proventosPorMes = useMemo(() => {
    const mapa = new Map();
    const mesesOriginaisPorAtivo = new Map();
    const mesesUsadosPorAtivo = new Map();
    const ativosPorId = new Map(ativos.map((ativo) => [ativo.id, ativo]));
    const proventosGrafico = deduplicarProventosGrafico(proventosFiltrados, ativosPorId);
    const proventosOrdenados = proventosGrafico.sort((a, b) => {
      const dataA = a.data_com || a.data_pagamento || "";
      const dataB = b.data_com || b.data_pagamento || "";
      if (dataA !== dataB) {
        return dataA.localeCompare(dataB);
      }
      return String(a.ticker || "").localeCompare(String(b.ticker || ""));
    });

    proventosOrdenados.forEach((provento) => {
      const ativo = ativosPorId.get(provento.ativo_id);
      const ticker = provento.ticker || ativo?.ticker || String(provento.ativo_id || "ativo");
      const mes = obterMes(provento.data_com || provento.data_pagamento);
      if (!mes) {
        return;
      }

      const meses = mesesOriginaisPorAtivo.get(ticker) || new Set();
      meses.add(mes);
      mesesOriginaisPorAtivo.set(ticker, meses);
    });

    proventosOrdenados.forEach((provento) => {
      const ativo = ativosPorId.get(provento.ativo_id);
      const ticker = provento.ticker || ativo?.ticker || "";
      const ehFii = (ativo?.tipo || "").toLowerCase() === "fii" || ticker.toUpperCase().endsWith("11");
      const mes = obterMesProventoGrafico(provento, mesesOriginaisPorAtivo, mesesUsadosPorAtivo, ehFii);
      if (!mes) {
        return;
      }

      const itemAtual = mapa.get(mes) || { mes, total: 0, eventos: 0 };
      itemAtual.total += numero(provento.valor_estimado);
      itemAtual.eventos += 1;
      mapa.set(mes, itemAtual);
    });

    return [...mapa.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }, [ativos, proventosFiltrados]);

  const resumoProventos = useMemo(() => {
    const maiorPagador = proventosPorAtivo[0] || null;
    const mediaMensal = proventosPorMes.length ? totalProventosFiltrados / proventosPorMes.length : 0;

    return {
      maiorPagador,
      mediaMensal,
      eventos: proventosFiltrados.length,
      meses: proventosPorMes.length,
    };
  }, [proventosFiltrados.length, proventosPorAtivo, proventosPorMes.length, totalProventosFiltrados]);

  async function carregarCarteira() {
    try {
      setLoading(true);
      setErro("");
      const [ativosData, resumoData, proventosData, evolucaoData] = await Promise.all([
        listarAtivos(),
        obterResumoCarteira(),
        listarProventos(),
        mostrarEvolucao ? obterEvolucaoCarteira(false) : Promise.resolve(evolucaoCarteira),
      ]);
      setAtivos(ativosData);
      setResumo(resumoData);
      setProventos(proventosData);
      setEvolucaoCarteira(evolucaoData);
      setFiltrosProventos((dadosAtuais) => {
        if (!dadosAtuais.ativoId) {
          return dadosAtuais;
        }

        const ativoExiste = ativosData.some((ativo) => String(ativo.id) === dadosAtuais.ativoId);
        return ativoExiste ? dadosAtuais : { ...dadosAtuais, ativoId: "" };
      });

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
  }, [view]);

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

  function atualizarFiltroProventos(campo, valor) {
    setFiltrosProventos((dadosAtuais) => ({
      ...dadosAtuais,
      [campo]: valor,
    }));
  }

  function limparFiltrosProventos() {
    setFiltrosProventos(filtroProventosInicial);
  }

  function limparFormulario() {
    setFormData(formularioInicial);
    setAtivoEditando(null);
    setErro("");
    setMensagem("");
  }

  async function selecionarAtivo(ativo) {
    if (ativoSelecionado?.id === ativo.id) {
      setAtivoSelecionado(null);
      setMovimentacoes([]);
      limparFormularioMovimentacao();
      setErro("");
      setMensagem("");
      return;
    }

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

      if (resultado.falhas) {
        setMensagem(
          `${resultado.total_proventos_criados} novo(s) provento(s) salvo(s). ${removidos} antigo(s) removido(s). ${resultado.falhas} ativo(s) ficaram pendentes.`
        );
      } else if (resultado.total_proventos_criados) {
        setMensagem(`${resultado.total_proventos_criados} novo(s) provento(s) salvo(s). ${removidos} antigo(s) removido(s).`);
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

  async function handleAtualizarEvolucao() {
    try {
      setAtualizandoEvolucao(true);
      setErro("");
      setMensagem("");
      const dados = await obterEvolucaoCarteira(true);
      setEvolucaoCarteira(dados);
      setMensagem("Evolucao da carteira atualizada com cotacoes historicas.");
    } catch (error) {
      setErro(extrairMensagemErro(error, "Nao foi possivel atualizar a evolucao da carteira."));
    } finally {
      setAtualizandoEvolucao(false);
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
              <button className="button primary" type="button" disabled={atualizandoEvolucao || !temAtivos} onClick={handleAtualizarEvolucao}>
                {atualizandoEvolucao ? "Atualizando..." : "Atualizar evolucao"}
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

          <section className="investment-dashboard-grid">
            <article className="panel investment-highlight-panel">
              <div className="panel-header">
                <div>
                  <h2>Leitura rapida</h2>
                  <span>Principais sinais da carteira no momento.</span>
                </div>
              </div>

              <div className="investment-highlight-grid">
                <div className="investment-highlight-item">
                  <span className="insight-kicker">Maior posicao</span>
                  <strong>{maiorPosicao ? maiorPosicao.ticker : "-"}</strong>
                  <small>{maiorPosicao ? `${formatarMoeda(maiorPosicao.valorAtualNumero)} da carteira` : "Sem ativos"}</small>
                </div>
                <div className="investment-highlight-item">
                  <span className="insight-kicker">Melhor desempenho</span>
                  <strong className={melhorDesempenho?.rentabilidadeNumero >= 0 ? "value-income" : "value-expense"}>
                    {melhorDesempenho ? melhorDesempenho.ticker : "-"}
                  </strong>
                  <small>{melhorDesempenho ? formatarPercentual(melhorDesempenho.rentabilidadeNumero) : "Sem cotacao"}</small>
                </div>
                <div className="investment-highlight-item">
                  <span className="insight-kicker">Pior desempenho</span>
                  <strong className={piorDesempenho?.rentabilidadeNumero >= 0 ? "value-income" : "value-expense"}>
                    {piorDesempenho ? piorDesempenho.ticker : "-"}
                  </strong>
                  <small>{piorDesempenho ? formatarPercentual(piorDesempenho.rentabilidadeNumero) : "Sem cotacao"}</small>
                </div>
                <div className="investment-highlight-item">
                  <span className="insight-kicker">Ultimo provento</span>
                  <strong>{ultimoProvento ? ultimoProvento.ticker : "-"}</strong>
                  <small>
                    {ultimoProvento
                      ? `${formatarMoeda(ultimoProvento.valor_estimado)} em ${formatarData(ultimoProvento.data_com)}`
                      : "Sem proventos"}
                  </small>
                </div>
              </div>
            </article>

            <article className="panel allocation-panel">
              <div className="panel-header">
                <div>
                  <h2>Distribuicao</h2>
                  <span>Participacao por valor atual.</span>
                </div>
              </div>
              {topAlocacao.length ? (
                <div className="allocation-list">
                  {topAlocacao.map((ativo) => (
                    <div className="allocation-row" key={ativo.id}>
                      <div className="allocation-row-head">
                        <strong>{ativo.ticker}</strong>
                        <span>{formatarPercentual(ativo.participacao)}</span>
                      </div>
                      <div className="progress-track">
                        <span
                          className="progress-fill allocation"
                          style={{ width: `${Math.min(Math.max(ativo.participacao, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-chart">Atualize as cotacoes para visualizar a distribuicao.</div>
              )}
            </article>
          </section>

          <section className="investment-overview-grid">
            <article className="panel investment-overview-card">
              <span className="insight-kicker">Ativos</span>
              <strong>{resumoNormalizado.quantidade_ativos} posicao(oes)</strong>
              <p>Cadastre ativos e registre compras, vendas ou splits no historico.</p>
              <Link className="button small" to="/investimentos/ativos">
                Gerenciar ativos
              </Link>
            </article>

            <article className="panel investment-overview-card">
              <span className="insight-kicker">Proventos</span>
              <strong>{formatarMoeda(totalProventosGeral)}</strong>
              <p>Renda passiva estimada encontrada para os ativos cadastrados.</p>
              <Link className="button small" to="/investimentos/proventos">
                Ver proventos
              </Link>
            </article>

            <article className="panel investment-overview-card">
              <span className="insight-kicker">Ultima atualizacao</span>
              <strong>
                {resumoNormalizado.ultima_atualizacao
                  ? formatarDataHora(resumoNormalizado.ultima_atualizacao)
                  : "Sem cotacoes"}
              </strong>
              <p>A evolucao usa cotacoes historicas mensais e as movimentacoes registradas.</p>
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
                    <th>Participacao</th>
                    <th>{view === "ativos" ? "Acoes" : "Atalhos"}</th>
                  </tr>
                </thead>
                <tbody>
                  {ativosComMetricas.map((ativo) => {
                    const resultado = ativo.resultadoNumero;
                    const temCotacao = ativo.ultimo_preco !== null && ativo.ultimo_preco !== undefined;

                    return (
                      <tr
                        key={ativo.id}
                        className={ativoSelecionado?.id === ativo.id && view === "ativos" ? "selected-row" : ""}
                      >
                        <td data-label="Ativo">
                          <div className="asset-cell">
                            <span className="asset-avatar">{ativo.ticker?.slice(0, 2) || "AT"}</span>
                            <div>
                              <strong>{ativo.ticker}</strong>
                              <span>{ativo.nome || "Sem nome"}</span>
                              {ativo.tipo ? <em>{ativo.tipo}</em> : null}
                            </div>
                          </div>
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
                            <div className={resultado >= 0 ? "result-cell positive" : "result-cell negative"}>
                              <strong className={resultado >= 0 ? "value-income" : "value-expense"}>
                                {formatarMoeda(ativo.lucro_prejuizo)}
                              </strong>
                              <span>{formatarPercentual(ativo.rentabilidade_percentual)}</span>
                            </div>
                          ) : (
                            <span className="muted">Atualize a cotacao</span>
                          )}
                        </td>
                        <td data-label="Participacao">
                          {temCotacao ? (
                            <div className="allocation-mini">
                              <strong>{formatarPercentual(ativo.participacao)}</strong>
                              <div className="progress-track">
                                <span
                                  className="progress-fill allocation"
                                  style={{ width: `${Math.min(Math.max(ativo.participacao, 0), 100)}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            "-"
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
                                  {ativoSelecionado?.id === ativo.id ? "Fechar" : "Movimentacoes"}
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
          <div className="selected-asset-hero">
            <div className="selected-asset-title">
              <span className="asset-avatar large">{ativoSelecionado.ticker?.slice(0, 2) || "AT"}</span>
              <div>
                <span className="insight-kicker">Ativo selecionado</span>
                <h2>{ativoSelecionado.ticker}</h2>
                <p>{ativoSelecionado.nome || "Sem nome cadastrado"}</p>
              </div>
            </div>

            <div className="selected-asset-metrics">
              <div>
                <span>Quantidade</span>
                <strong>{Number(ativoSelecionado.quantidade).toLocaleString("pt-BR")}</strong>
              </div>
              <div>
                <span>Preco medio</span>
                <strong>{formatarMoeda(ativoSelecionado.preco_medio)}</strong>
              </div>
              <div>
                <span>Valor atual</span>
                <strong>{formatarMoeda(ativoSelecionadoMetricas?.valorAtualNumero || 0)}</strong>
              </div>
              <div>
                <span>Resultado</span>
                <strong
                  className={
                    (ativoSelecionadoMetricas?.resultadoNumero || 0) >= 0 ? "value-income" : "value-expense"
                  }
                >
                  {formatarMoeda(ativoSelecionadoMetricas?.resultadoNumero || 0)}
                </strong>
              </div>
              <div>
                <span>Lucro realizado</span>
                <strong className={totalLucroRealizado >= 0 ? "value-income" : "value-expense"}>
                  {formatarMoeda(totalLucroRealizado)}
                </strong>
              </div>
            </div>
          </div>

          <div className="movement-workspace">
            <form className="movement-form-card" onSubmit={handleCriarMovimentacao}>
              <div className="movement-form-head">
                <div>
                  <h2>{movimentacaoEditando ? "Editar movimentacao" : "Nova movimentacao"}</h2>
                  <span>{movimentacaoEhSplit ? "Evento corporativo" : "Compra ou venda do ativo"}</span>
                </div>
                <span className={`type-pill ${movimentacaoEhSplit ? "neutral" : movimentacaoData.tipo === "venda" ? "expense" : "income"}`}>
                  {movimentacaoEhSplit ? "Split" : movimentacaoData.tipo === "venda" ? "Venda" : "Compra"}
                </span>
              </div>

              <div className="movement-form-grid">
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
              </div>

              <div className="form-actions">
                {movimentacaoEditando ? (
                  <button className="button" type="button" onClick={limparFormularioMovimentacao}>
                    Cancelar
                  </button>
                ) : null}
                <button className="button primary" type="submit" disabled={salvandoMovimentacao}>
                  {salvandoMovimentacao ? "Salvando..." : movimentacaoEditando ? "Salvar movimentacao" : "Adicionar"}
                </button>
              </div>
            </form>

            <aside className="movement-summary-card">
              <span className="insight-kicker">Historico</span>
              <div>
                <strong>{movimentacoes.length}</strong>
                <small>movimentacao(oes)</small>
              </div>
              <div className="movement-summary-grid">
                <span>Compras <strong>{resumoMovimentacoes.compras}</strong></span>
                <span>Vendas <strong>{resumoMovimentacoes.vendas}</strong></span>
                <span>Splits <strong>{resumoMovimentacoes.splits}</strong></span>
              </div>
              <div className="movement-summary-values">
                <span>Total comprado <strong>{formatarMoeda(resumoMovimentacoes.totalCompras)}</strong></span>
                <span>Total vendido <strong>{formatarMoeda(resumoMovimentacoes.totalVendas)}</strong></span>
              </div>
            </aside>
          </div>

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
                        <tr
                          key={movimentacao.id}
                          className={`movement-row ${ehSplit ? "split" : ehVenda ? "sale" : "purchase"}`}
                        >
                          <td data-label="Data">{formatarData(movimentacao.data)}</td>
                          <td data-label="Tipo">
                            <div className="movement-event-cell">
                              <span className={`type-pill ${ehSplit ? "neutral" : ehVenda ? "expense" : "income"}`}>
                                {ehSplit ? `Split ${fatorSplit}` : ehVenda ? "Venda" : "Compra"}
                              </span>
                              <small>{ehSplit ? "Desdobramento" : ehVenda ? "Saida de posicao" : "Aumento de posicao"}</small>
                            </div>
                          </td>
                          <td data-label="Quantidade">
                            {ehSplit ? "-" : Number(movimentacao.quantidade).toLocaleString("pt-BR")}
                          </td>
                          <td data-label="Preco unitario">
                            {ehSplit ? fatorSplit : formatarMoeda(movimentacao.preco_unitario)}
                          </td>
                          <td data-label="Total">{ehSplit ? "-" : formatarMoeda(movimentacao.valor_total)}</td>
                          <td data-label="Preco medio">
                            <div className="price-average-flow">
                              <span>{formatarMoeda(movimentacao.preco_medio_antes)}</span>
                              <strong>{"->"}</strong>
                              <span>{formatarMoeda(movimentacao.preco_medio_depois)}</span>
                            </div>
                          </td>
                          <td data-label="Lucro/prejuizo">
                            {ehVenda ? (
                              <span className={resultado >= 0 ? "realized-profit positive" : "realized-profit negative"}>
                                {formatarMoeda(movimentacao.lucro_prejuizo)}
                              </span>
                            ) : (
                              "-"
                            )}
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
            <strong className="panel-total income">{formatarMoeda(totalProventosFiltrados)}</strong>
          </div>
          {proventos.length ? (
            <>
              <div className="dividend-summary-grid">
                <div className="dividend-summary-card">
                  <span className="insight-kicker">Total filtrado</span>
                  <strong>{formatarMoeda(totalProventosFiltrados)}</strong>
                  <small>{resumoProventos.eventos} evento(s)</small>
                </div>
                <div className="dividend-summary-card">
                  <span className="insight-kicker">Media mensal</span>
                  <strong>{formatarMoeda(resumoProventos.mediaMensal)}</strong>
                  <small>{resumoProventos.meses} mes(es) com proventos</small>
                </div>
                <div className="dividend-summary-card">
                  <span className="insight-kicker">Maior pagador</span>
                  <strong>{resumoProventos.maiorPagador?.ticker || "-"}</strong>
                  <small>
                    {resumoProventos.maiorPagador
                      ? formatarMoeda(resumoProventos.maiorPagador.total)
                      : "Sem dados no periodo"}
                  </small>
                </div>
                <div className="dividend-summary-card">
                  <span className="insight-kicker">Ativos pagadores</span>
                  <strong>{proventosPorAtivo.length}</strong>
                  <small>ativo(s) no filtro atual</small>
                </div>
              </div>

              <div className="proventos-filters">
                <label>
                  Data inicial
                  <input
                    type="date"
                    value={filtrosProventos.dataInicio}
                    max={filtrosProventos.dataFim || undefined}
                    onChange={(event) => atualizarFiltroProventos("dataInicio", event.target.value)}
                  />
                </label>

                <label>
                  Data final
                  <input
                    type="date"
                    value={filtrosProventos.dataFim}
                    min={filtrosProventos.dataInicio || undefined}
                    onChange={(event) => atualizarFiltroProventos("dataFim", event.target.value)}
                  />
                </label>

                <label>
                  Buscar ativo
                  <input
                    type="text"
                    value={filtrosProventos.buscaAtivo}
                    placeholder="Ticker ou nome"
                    onChange={(event) => atualizarFiltroProventos("buscaAtivo", event.target.value)}
                  />
                </label>

                <label>
                  Ativo
                  <select
                    value={filtrosProventos.ativoId}
                    onChange={(event) => atualizarFiltroProventos("ativoId", event.target.value)}
                  >
                    <option value="">Todos os ativos</option>
                    {ativosFiltradosBusca.map((ativo) => (
                      <option key={ativo.id} value={String(ativo.id)}>
                        {ativo.ticker}
                        {ativo.nome && ativo.nome !== ativo.ticker ? ` - ${ativo.nome}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <button className="button" type="button" onClick={limparFiltrosProventos}>
                  Limpar filtros
                </button>
              </div>

              {proventosFiltrados.length ? (
                <div className="dividend-content-grid">
                  <section className="dividend-chart-panel">
                    <div className="panel-header">
                      <div>
                        <h2>Proventos por mes</h2>
                        <span>Evolucao da renda passiva no periodo filtrado.</span>
                      </div>
                    </div>
                    <div className="dividend-chart-frame">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={proventosPorMes} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke="#e2e8f0" vertical={false} />
                          <XAxis
                            dataKey="mes"
                            tick={{ fill: "#64748b", fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={(valor) => formatarMoeda(valor)}
                            tick={{ fill: "#64748b", fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                            width={84}
                          />
                          <Tooltip
                            formatter={(valor) => [formatarMoeda(valor), "Proventos"]}
                            labelFormatter={(mes) => mes}
                            contentStyle={{
                              border: "1px solid #dce4ef",
                              borderRadius: 10,
                              boxShadow: "0 14px 34px rgb(15 23 42 / 8%)",
                            }}
                          />
                          <Bar dataKey="total" name="Proventos" fill="#0f766e" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <aside className="dividend-ranking-panel">
                    <div className="panel-header">
                      <div>
                        <h2>Por ativo</h2>
                        <span>Concentracao dos proventos filtrados.</span>
                      </div>
                    </div>
                    <div className="dividend-ranking-list">
                      {proventosPorAtivo.slice(0, 8).map((item) => {
                        const percentual = totalProventosFiltrados
                          ? (item.total / totalProventosFiltrados) * 100
                          : 0;

                        return (
                          <div className="dividend-ranking-row" key={item.ticker}>
                            <div className="allocation-row-head">
                              <strong>{item.ticker}</strong>
                              <span>{formatarMoeda(item.total)}</span>
                            </div>
                            <div className="progress-track">
                              <span
                                className="progress-fill income"
                                style={{ width: `${Math.min(Math.max(percentual, 0), 100)}%` }}
                              />
                            </div>
                            <small>{item.eventos} evento(s)</small>
                          </div>
                        );
                      })}
                    </div>
                  </aside>

                  <div className="table-scroll dividend-table-full">
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
                        {proventosFiltrados.map((provento) => (
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
                              {provento.quantidade_base
                                ? Number(provento.quantidade_base).toLocaleString("pt-BR")
                                : "-"}
                            </td>
                            <td data-label="Total estimado">
                              <strong className="value-income">{formatarMoeda(provento.valor_estimado)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="empty-dashboard">
                  <h2>Nenhum provento encontrado nos filtros</h2>
                  <p>Ajuste o periodo ou selecione outro ativo para visualizar os dividendos.</p>
                </div>
              )}
            </>
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
                <span>Calculo mensal com base na quantidade historica e no ultimo fechamento disponivel de cada mes.</span>
              </div>
              <button className="button small" type="button" disabled={atualizandoEvolucao || !temAtivos} onClick={handleAtualizarEvolucao}>
                {atualizandoEvolucao ? "Atualizando..." : "Atualizar evolucao"}
              </button>
            </div>
            {evolucaoCarteira.avisos?.length ? (
              <div className="state-box warning">
                {evolucaoCarteira.avisos.slice(0, 4).map((aviso) => (
                  <p key={aviso}>{aviso}</p>
                ))}
                {evolucaoCarteira.avisos.length > 4 ? <p>Mais {evolucaoCarteira.avisos.length - 4} aviso(s) omitido(s).</p> : null}
              </div>
            ) : null}
            {dadosEvolucao.length ? (
              <div className="chart-frame evolution-chart-frame">
                <ResponsiveContainer width="100%" height={380}>
                  <LineChart data={dadosEvolucao} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="mes"
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
                      labelFormatter={(mes) => `Mes ${mes}`}
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
              <div className="empty-dashboard">
                <h2>Nenhuma evolucao calculada</h2>
                <p>Registre movimentacoes de compra para gerar a evolucao mensal da carteira.</p>
              </div>
            )}
          </article>

          {dadosEvolucao.length ? (
            <article className="panel table-panel">
              <div className="panel-header">
                <div>
                  <h2>Historico mensal</h2>
                  <span>Valores calculados pelo fechamento historico de cada mes.</span>
                </div>
                <strong className={resumoEvolucao.melhorResultado >= 0 ? "value-income" : "value-expense"}>
                  Melhor resultado: {formatarMoeda(resumoEvolucao.melhorResultado)}
                </strong>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      <th>Data ref.</th>
                      <th>Ativos</th>
                      <th>Patrimonio</th>
                      <th>Investido</th>
                      <th>Resultado</th>
                      <th>Rentabilidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...dadosEvolucao].reverse().map((item) => (
                      <tr key={item.mes}>
                        <td data-label="Mes">{item.mes}</td>
                        <td data-label="Data ref.">{item.data ? formatarData(item.data) : "-"}</td>
                        <td data-label="Ativos">{item.quantidade_ativos}</td>
                        <td data-label="Patrimonio">{formatarMoeda(item.patrimonio)}</td>
                        <td data-label="Investido">{formatarMoeda(item.investido)}</td>
                        <td
                          data-label="Resultado"
                          className={item.resultado >= 0 ? "value-income" : "value-expense"}
                        >
                          {formatarMoeda(item.resultado)}
                        </td>
                        <td
                          data-label="Rentabilidade"
                          className={item.rentabilidade >= 0 ? "value-income" : "value-expense"}
                        >
                          {formatarPercentual(item.rentabilidade)}
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
