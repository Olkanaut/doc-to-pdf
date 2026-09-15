import { LaGaufreV2, MainLayout, UserMenu } from "@gouvfr-lasuite/ui-components";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { LeftPanel } from "./LeftPanel";

/** Services proposés par la gaufre en local : la Docs locale et cette app. */
const LOCAL_SERVICES = {
  services: [
    { name: "Docs", url: "http://localhost:3011" },
    { name: "dots", url: "/" },
  ],
};

/**
 * Coque de l'app sur le MainLayout du kit : en-tête (marque, gaufre), panneau gauche
 * (création, navigation — voir LeftPanel), pied du panneau (UserMenu du kit + nom).
 * Le contenu des routes arrive en enfant.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Même repli que Docs (LeftPanelFooter) : « Invité » sans session.
  const menuUser = { full_name: user?.name ?? "Invité", email: "" };

  return (
    <MainLayout
      icon={<Brand />}
      rightHeaderContent={<LaGaufreV2 data={LOCAL_SERVICES} />}
      leftPanelContent={<LeftPanel />}
      leftPanelFooter={
        <div className="dots-panel-footer">
          <UserMenu user={menuUser} withMobileView={false} />
          {/* Le déclencheur du UserMenu n'affiche que les initiales : le nom reste lisible à côté. */}
          <span className="dots-panel-footer__name">{menuUser.full_name}</span>
        </div>
      }
    >
      {children}
    </MainLayout>
  );
}

function Brand() {
  return (
    <Link to="/templates" className="dots-brand">
      <span className="dots-brand__logo" aria-hidden="true">
        dt
      </span>
      <span className="dots-brand__title">dots</span>
    </Link>
  );
}
