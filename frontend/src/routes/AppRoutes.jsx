import { Navigate, Route, Routes, useParams } from "react-router-dom";

import Layout from "../components/Layout.jsx";
import Cartoes from "../pages/Cartoes.jsx";
import Categorias from "../pages/Categorias.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import EditarLancamento from "../pages/EditarLancamento.jsx";
import Investimentos from "../pages/Investimentos.jsx";
import Lancamentos from "../pages/Lancamentos.jsx";
import NovoLancamento from "../pages/NovoLancamento.jsx";

function RedirectEditarLancamentoAntigo() {
  const { id } = useParams();
  return <Navigate to={`/financas/lancamentos/${id}/editar`} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/financas/dashboard" replace />} />

        <Route path="/financas" element={<Navigate to="/financas/dashboard" replace />} />
        <Route path="/financas/dashboard" element={<Dashboard />} />
        <Route path="/financas/lancamentos" element={<Lancamentos />} />
        <Route path="/financas/lancamentos/novo" element={<NovoLancamento />} />
        <Route path="/financas/lancamentos/:id/editar" element={<EditarLancamento />} />
        <Route path="/financas/categorias" element={<Categorias />} />
        <Route path="/financas/cartoes" element={<Cartoes />} />

        <Route path="/investimentos" element={<Navigate to="/investimentos/carteira" replace />} />
        <Route path="/investimentos/carteira" element={<Investimentos view="carteira" />} />
        <Route path="/investimentos/ativos" element={<Investimentos view="ativos" />} />
        <Route path="/investimentos/proventos" element={<Investimentos view="proventos" />} />
        <Route path="/investimentos/evolucao" element={<Investimentos view="evolucao" />} />

        <Route path="/lancamentos" element={<Navigate to="/financas/lancamentos" replace />} />
        <Route path="/lancamentos/novo" element={<Navigate to="/financas/lancamentos/novo" replace />} />
        <Route path="/lancamentos/:id/editar" element={<RedirectEditarLancamentoAntigo />} />
        <Route path="/categorias" element={<Navigate to="/financas/categorias" replace />} />
        <Route path="/cartoes" element={<Navigate to="/financas/cartoes" replace />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
