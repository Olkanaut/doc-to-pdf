import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import "./AppLayout.css";

export function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="app-main">{children}</main>
    </div>
  );
}
