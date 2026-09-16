import { Link } from "react-router-dom";
import { AppSwitcher } from "./AppSwitcher";
import { UserMenu } from "./UserMenu";

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <Link className="app-brand" to="/" aria-label="Accueil Dots">
          <span className="app-brand-mark" aria-hidden="true">
            D
          </span>
          <span>
            <strong>Dots</strong>
            <small>Un doc, un PDF</small>
          </span>
        </Link>
      </div>

      <div className="app-header-right">
        <AppSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
