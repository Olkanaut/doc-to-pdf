import { Outlet } from "react-router-dom";
import { AppHeader } from "./AppHeader";
import "./AppLayout.css";

export function AppLayout() {
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
