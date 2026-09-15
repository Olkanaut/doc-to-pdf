import { Link } from "react-router-dom";
import { suiteApps } from "../config/apps";

export function AppSwitcher() {
  return (
    <details className="app-menu">
      <summary className="icon-button" aria-label="Applications La Suite">
        <span className="waffle-icon" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </span>
      </summary>

      <div className="app-menu-panel app-switcher-panel">
        <p className="app-menu-title">Applications</p>
        <div className="suite-app-list">
          {suiteApps.map((app) =>
            app.external ? (
              <a key={app.id} className="suite-app-link" href={app.href}>
                <span className="suite-app-initial" aria-hidden="true">
                  {app.label.slice(0, 1)}
                </span>
                <span>
                  <strong>{app.label}</strong>
                  <small>{app.description}</small>
                </span>
              </a>
            ) : (
              <Link key={app.id} className="suite-app-link" to={app.href}>
                <span className="suite-app-initial" aria-hidden="true">
                  {app.label.slice(0, 1)}
                </span>
                <span>
                  <strong>{app.label}</strong>
                  <small>{app.description}</small>
                </span>
              </Link>
            ),
          )}
        </div>
      </div>
    </details>
  );
}
