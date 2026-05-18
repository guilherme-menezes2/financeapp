import { NavLink, Outlet } from "react-router-dom";

const menuItems = [
  { to: "/", label: "Dashboard" },
  { to: "/lancamentos", label: "Lancamentos" },
  { to: "/categorias", label: "Categorias" },
  { to: "/cartoes", label: "Cartoes" },
];

function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">FP</span>
          <div>
            <strong>Financas</strong>
            <span>Pessoais</span>
          </div>
        </div>

        <nav className="nav-menu" aria-label="Menu principal">
          {menuItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
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
            <span className="topbar-label">MVP financeiro</span>
            <strong>Controle simples de receitas e despesas</strong>
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
