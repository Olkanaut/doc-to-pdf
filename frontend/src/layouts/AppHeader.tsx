import { NavLink } from "react-router-dom";
import { AppSwitcher } from "./AppSwitcher";
import { UserMenu } from "./UserMenu";

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <NavLink className="app-brand" to="/" aria-label="Accueil Dots">
          <span className="app-brand-mark" aria-hidden="true">
            D
          </span>
          <span>
            <strong>Dots</strong>
            <small>Un doc, un PDF</small>
          </span>
        </NavLink>

        <nav className="app-nav" aria-label="Navigation principale">
          <NavLink to="/" end>
            Document
          </NavLink>
          <NavLink to="/">Gabarits</NavLink>
          <NavLink to="/docs">Documents</NavLink>
        </nav>
      </div>

      <div className="app-header-right">
        <AppSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
