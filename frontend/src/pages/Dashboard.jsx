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

  useEffect(() => {
    async function carregarResumo() {
      try {
        setLoading(true);
        setErro("");
        const dados = await buscarResumo();
        setResumo({ ...resumoInicial, ...dados });
      } catch (error) {
        setErro("Nao foi possivel carregar o resumo financeiro.");
      } finally {
        setLoading(false);
      }
    }

    carregarResumo();
  }, []);

  const possuiDados = temDadosFinanceiros(resumo);
  const fluxoMensal = prepararFluxoMensal(resumo.fluxo_mensal || []);
  const despesasPorCategoria = prepararCategorias(resumo.despesas_por_categoria || []);
  const receitasPorCategoria = prepararCategorias(resumo.receitas_por_categoria || []);

  return (
    <section className="page">
      <PageHeader
        title="Dashboard"
        description="Visao geral das suas receitas, despesas e saldo."
      />

      {loading ? <LoadingState /> : null}
      {erro ? <ErrorState message={erro} /> : null}

      {!loading && !erro ? (
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

          {possuiDados ? (
            <>
              <div className="dashboard-grid">
                <article className="panel chart-panel wide">
                  <div className="panel-header">
                    <div>
                      <h2>Fluxo mensal dos ultimos 6 meses</h2>
                      <span>Receitas x despesas por mes</span>
                    </div>
                  </div>
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
                </article>

                <article className="panel chart-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Despesas por categoria</h2>
                      <span>{formatarMoeda(resumo.total_despesas)}</span>
                    </div>
                  </div>
                  {despesasPorCategoria.length ? (
                    <div className="chart-frame">
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={despesasPorCategoria}
                            dataKey="total"
                            nameKey="categoria"
                            innerRadius={58}
                            outerRadius={96}
                            paddingAngle={2}
                          >
                            {despesasPorCategoria.map((item, index) => (
                              <Cell
                                key={item.categoria}
                                fill={CORES_CATEGORIAS[index % CORES_CATEGORIAS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<CurrencyTooltip />} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="empty-chart">Nenhuma despesa cadastrada.</div>
                  )}
                </article>
              </div>

              <div className="section-grid">
                <article className="panel">
                  <h2>Receitas por categoria</h2>
                  <div className="category-list">
                    {receitasPorCategoria.length ? (
                      receitasPorCategoria.map((item) => (
                        <div key={item.categoria} className="category-row">
                          <span>{item.categoria}</span>
                          <strong>{formatarMoeda(item.total)}</strong>
                        </div>
                      ))
                    ) : (
                      <span className="muted">Nenhuma receita cadastrada.</span>
                    )}
                  </div>
                </article>

                <article className="panel">
                  <h2>Despesas por categoria</h2>
                  <div className="category-list">
                    {despesasPorCategoria.length ? (
                      despesasPorCategoria.map((item) => (
                        <div key={item.categoria} className="category-row">
                          <span>{item.categoria}</span>
                          <strong>{formatarMoeda(item.total)}</strong>
                        </div>
                      ))
                    ) : (
                      <span className="muted">Nenhuma despesa cadastrada.</span>
                    )}
                  </div>
                </article>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export default Dashboard;
