import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SummaryCard from "../components/SummaryCard.jsx";
import { buscarResumo } from "../services/resumoService.js";
import { formatarMesAno, formatarMoeda } from "../utils/formatters.js";

const resumoInicial = {
  total_receitas: 0,
  total_despesas: 0,
  saldo: 0,
  quantidade_lancamentos: 0,
  mes_atual: {
    receitas: 0,
    despesas: 0,
    saldo: 0,
  },
  despesas_por_categoria: [],
  receitas_por_categoria: [],
  fluxo_mensal: [],
};

const CORES_CATEGORIAS = ["#dc2626", "#f97316", "#f59e0b", "#0f766e", "#2563eb", "#7c3aed"];
const OPCAO_PERSONALIZADA = "personalizado";
const OPCOES_MESES_FLUXO = [1, 3, 6, 12];
const LIMITE_CATEGORIAS_GRAFICO = 10;

function temDadosFinanceiros(resumo) {
  return (
    Number(resumo.total_receitas || 0) > 0 ||
    Number(resumo.total_despesas || 0) > 0 ||
    Number(resumo.quantidade_lancamentos || 0) > 0
  );
}

function prepararFluxoMensal(fluxoMensal) {
  return fluxoMensal.map((item) => ({
    ...item,
    mesFormatado: formatarMesAno(item.mes),
    receitas: Number(item.receitas || 0),
    despesas: Number(item.despesas || 0),
  }));
}

function prepararCategorias(categorias) {
  return categorias.map((item) => ({
    categoria: item.categoria,
    total: Number(item.total || 0),
  }));
}

function totalizarCategorias(categorias) {
  return categorias.reduce((total, item) => total + Number(item.total || 0), 0);
}

function prepararRankingCategorias(categorias, total) {
  return categorias.map((item, index) => ({
    ...item,
    cor: CORES_CATEGORIAS[index % CORES_CATEGORIAS.length],
    percentual: total > 0 ? (Number(item.total || 0) / total) * 100 : 0,
  }));
}

function fluxoPossuiValores(fluxoMensal) {
  return fluxoMensal.some(
    (item) => Number(item.receitas || 0) > 0 || Number(item.despesas || 0) > 0
  );
}

function CurrencyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      {label ? <strong>{label}</strong> : null}
      {payload.map((item) => (
        <span key={`${item.name}-${item.value}`}>
          {item.name}: {formatarMoeda(item.value)}
        </span>
      ))}
    </div>
  );
}

function Dashboard() {
  const [resumo, setResumo] = useState(resumoInicial);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [tipoFiltroFluxo, setTipoFiltroFluxo] = useState("6");
  const [dataInicioFluxo, setDataInicioFluxo] = useState("");
  const [dataFimFluxo, setDataFimFluxo] = useState("");

  async function carregarResumo(params = {}) {
    try {
      setLoading(true);
      setErro("");
      const dados = await buscarResumo(params);
      setResumo({ ...resumoInicial, ...dados });
    } catch (error) {
      setErro(error?.response?.data?.detail || "Nao foi possivel carregar o resumo financeiro.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tipoFiltroFluxo === OPCAO_PERSONALIZADA) {
      return;
    }

    carregarResumo({ ultimos_meses: Number(tipoFiltroFluxo) });
  }, [tipoFiltroFluxo]);

  function handleTipoFiltroChange(valor) {
    setTipoFiltroFluxo(valor);
    setErro("");
  }

  function aplicarPeriodoPersonalizado() {
    if (!dataInicioFluxo || !dataFimFluxo) {
      setErro("Informe a data inicial e a data final.");
      return;
    }

    if (dataInicioFluxo > dataFimFluxo) {
      setErro("A data inicial nao pode ser maior que a data final.");
      return;
    }

    carregarResumo({
      data_inicio: dataInicioFluxo,
      data_fim: dataFimFluxo,
    });
  }

  const possuiDados = temDadosFinanceiros(resumo);
  const fluxoMensal = prepararFluxoMensal(resumo.fluxo_mensal || []);
  const fluxoComValores = fluxoPossuiValores(fluxoMensal);
  const despesasPorCategoria = prepararCategorias(resumo.despesas_por_categoria || []);
  const receitasPorCategoria = prepararCategorias(resumo.receitas_por_categoria || []);
  const totalDespesasCategorias = totalizarCategorias(despesasPorCategoria);
  const totalReceitasCategorias = totalizarCategorias(receitasPorCategoria);
  const rankingDespesas = prepararRankingCategorias(
    despesasPorCategoria.slice(0, LIMITE_CATEGORIAS_GRAFICO),
    totalDespesasCategorias
  );
  const rankingReceitas = prepararRankingCategorias(receitasPorCategoria, totalReceitasCategorias);
  const maiorDespesa = rankingDespesas[0];
  const maiorReceita = rankingReceitas[0];

  return (
    <section className="page">
      <PageHeader
        title="Dashboard"
        description="Visao geral das suas receitas, despesas e saldo."
      />

      {loading ? <LoadingState /> : null}
      {erro ? <ErrorState message={erro} /> : null}

      {!loading ? (
        <>
          <div className="summary-grid">
            <SummaryCard label="Total de receitas" value={formatarMoeda(resumo.total_receitas)} tone="income" />
            <SummaryCard label="Total de despesas" value={formatarMoeda(resumo.total_despesas)} tone="expense" />
            <SummaryCard label="Saldo atual" value={formatarMoeda(resumo.saldo)} tone="balance" />
            <SummaryCard label="Saldo do mes atual" value={formatarMoeda(resumo.mes_atual?.saldo)} />
          </div>

          {!possuiDados ? (
            <div className="empty-dashboard">
              <h2>Nenhum dado financeiro ainda</h2>
              <p>Cadastre categorias e lancamentos para visualizar graficos e resumos aqui.</p>
            </div>
          ) : null}

          <div className="dashboard-flow-grid">
                <article className="panel chart-panel wide">
                  <div className="panel-header">
                    <div>
                      <h2>Fluxo mensal</h2>
                      <span>Receitas x despesas por mes</span>
                    </div>
                  </div>
                  <div className="flow-filters">
                    <label>
                      Periodo
                      <select
                        value={tipoFiltroFluxo}
                        onChange={(event) => handleTipoFiltroChange(event.target.value)}
                      >
                        {OPCOES_MESES_FLUXO.map((meses) => (
                          <option key={meses} value={String(meses)}>
                            {meses === 1 ? "Ultimo 1 mes" : `Ultimos ${meses} meses`}
                          </option>
                        ))}
                        <option value={OPCAO_PERSONALIZADA}>Periodo personalizado</option>
                      </select>
                    </label>

                    {tipoFiltroFluxo === OPCAO_PERSONALIZADA ? (
                      <>
                        <label>
                          Data inicial
                          <input
                            type="date"
                            value={dataInicioFluxo}
                            onChange={(event) => setDataInicioFluxo(event.target.value)}
                          />
                        </label>
                        <label>
                          Data final
                          <input
                            type="date"
                            value={dataFimFluxo}
                            onChange={(event) => setDataFimFluxo(event.target.value)}
                          />
                        </label>
                        <button className="button primary" type="button" onClick={aplicarPeriodoPersonalizado}>
                          Aplicar
                        </button>
                      </>
                    ) : null}
                  </div>

                  {fluxoMensal.length && fluxoComValores ? (
                    <div className="chart-frame">
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={fluxoMensal}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="mesFormatado" />
                          <YAxis tickFormatter={(valor) => formatarMoeda(valor).replace(",00", "")} width={90} />
                          <Tooltip content={<CurrencyTooltip />} />
                          <Legend />
                          <Bar dataKey="receitas" name="Receitas" fill="#16a34a" radius={[6, 6, 0, 0]} />
                          <Bar dataKey="despesas" name="Despesas" fill="#dc2626" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="empty-chart">
                      Nenhum lancamento encontrado para o periodo selecionado.
                    </div>
                  )}
                </article>

          </div>

          {possuiDados ? (
            <>
              <section className="dashboard-insights">
                <article className="panel expense-breakdown-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Maiores despesas por categoria</h2>
                      <span>Onde seu dinheiro esta saindo no periodo selecionado</span>
                    </div>
                    <strong className="panel-total">{formatarMoeda(totalDespesasCategorias)}</strong>
                  </div>

                  {rankingDespesas.length ? (
                    <div className="expense-breakdown-grid">
                      <div className="pie-chart-frame">
                        <ResponsiveContainer width="100%" height={420}>
                          <PieChart>
                            <Pie
                              data={rankingDespesas}
                              dataKey="total"
                              nameKey="categoria"
                              innerRadius={82}
                              outerRadius={150}
                              paddingAngle={2}
                              stroke="#ffffff"
                              strokeWidth={3}
                            >
                              {rankingDespesas.map((item) => (
                                <Cell key={item.categoria} fill={item.cor} />
                              ))}
                            </Pie>
                            <Tooltip content={<CurrencyTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="insight-list">
                        {rankingDespesas.map((item) => (
                          <div key={item.categoria} className="insight-row">
                            <div className="insight-row-head">
                              <span>{item.categoria}</span>
                              <strong>{formatarMoeda(item.total)}</strong>
                            </div>
                            <div className="progress-track" aria-hidden="true">
                              <span
                                className="progress-fill expense"
                                style={{
                                  width: `${Math.min(item.percentual, 100)}%`,
                                  backgroundColor: item.cor,
                                }}
                              />
                            </div>
                            <small>{item.percentual.toFixed(1)}% das despesas</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="empty-chart">Nenhuma despesa cadastrada.</div>
                  )}
                </article>

                <div className="insight-cards-grid">
                  <article className="panel insight-card">
                    <span className="insight-kicker">Maior despesa</span>
                    <strong>{maiorDespesa?.categoria || "Sem dados"}</strong>
                    <p>
                      {maiorDespesa
                        ? `${formatarMoeda(maiorDespesa.total)} (${maiorDespesa.percentual.toFixed(1)}% das despesas)`
                        : "Cadastre despesas para gerar este resumo."}
                    </p>
                  </article>

                  <article className="panel insight-card">
                    <span className="insight-kicker">Principal receita</span>
                    <strong>{maiorReceita?.categoria || "Sem dados"}</strong>
                    <p>
                      {maiorReceita
                        ? `${formatarMoeda(maiorReceita.total)} (${maiorReceita.percentual.toFixed(1)}% das receitas)`
                        : "Cadastre receitas para gerar este resumo."}
                    </p>
                  </article>
                </div>

                <article className="panel compact-category-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Receitas por categoria</h2>
                      <span>Composicao das entradas do periodo</span>
                    </div>
                    <strong className="panel-total income">{formatarMoeda(totalReceitasCategorias)}</strong>
                  </div>

                  {rankingReceitas.length ? (
                    <div className="insight-list compact">
                      {rankingReceitas.map((item) => (
                        <div key={item.categoria} className="insight-row">
                          <div className="insight-row-head">
                            <span>{item.categoria}</span>
                            <strong>{formatarMoeda(item.total)}</strong>
                          </div>
                          <div className="progress-track" aria-hidden="true">
                            <span
                              className="progress-fill income"
                              style={{ width: `${Math.min(item.percentual, 100)}%` }}
                            />
                          </div>
                          <small>{item.percentual.toFixed(1)}% das receitas</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">Nenhuma receita cadastrada.</span>
                  )}
                </article>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export default Dashboard;
