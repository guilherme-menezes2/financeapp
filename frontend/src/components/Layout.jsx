import { NavLink, Outlet, useLocation } from "react-router-dom";

const moduleConfig = {
  financas: {
    mark: "FP",
    title: "Financas",
    subtitle: "Pessoais",
    topbarLabel: "Financas pessoais",
    topbarTitle: "Controle simples de receitas e despesas",
    menuItems: [
      { to: "/financas/dashboard", label: "Dashboard" },
      { to: "/financas/lancamentos", label: "Lancamentos" },
      { to: "/financas/categorias", label: "Categorias" },
      { to: "/financas/cartoes", label: "Cartoes" },
    ],
  },
  investimentos: {
    mark: "IV",
    title: "Investimentos",
    subtitle: "Carteira",
    topbarLabel: "Investimentos",
    topbarTitle: "Ativos, proventos e evolucao da carteira",
    menuItems: [
      { to: "/investimentos/carteira", label: "Carteira" },
      { to: "/investimentos/ativos", label: "Ativos" },
      { to: "/investimentos/proventos", label: "Proventos" },
      { to: "/investimentos/evolucao", label: "Evolucao" },
    ],
  },
};

function obterModulo(pathname) {
  return pathname.startsWith("/investimentos") ? "investimentos" : "financas";
}

function Layout() {
  const location = useLocation();
  const moduloAtual = obterModulo(location.pathname);
  const config = moduleConfig[moduloAtual];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">{config.mark}</span>
          <div>
            <strong>{config.title}</strong>
            <span>{config.subtitle}</span>
          </div>
        </div>

        <div className="module-switcher" aria-label="Modulos do app">
          <NavLink
            to="/financas/dashboard"
            className={moduloAtual === "financas" ? "module-link active" : "module-link"}
          >
            Financas
          </NavLink>
          <NavLink
            to="/investimentos/carteira"
            className={moduloAtual === "investimentos" ? "module-link active" : "module-link"}
          >
            Investimentos
          </NavLink>
        </div>

        <nav className="nav-menu" aria-label="Menu principal">
          {config.menuItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div>
            <span className="topbar-label">{config.topbarLabel}</span>
            <strong>{config.topbarTitle}</strong>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
