import { Route, Routes } from "react-router-dom";

import Layout from "../components/Layout.jsx";
import Cartoes from "../pages/Cartoes.jsx";
import Categorias from "../pages/Categorias.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import EditarLancamento from "../pages/EditarLancamento.jsx";
import Lancamentos from "../pages/Lancamentos.jsx";
import NovoLancamento from "../pages/NovoLancamento.jsx";

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/lancamentos" element={<Lancamentos />} />
        <Route path="/lancamentos/novo" element={<NovoLancamento />} />
        <Route path="/lancamentos/:id/editar" element={<EditarLancamento />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route path="/cartoes" element={<Cartoes />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
