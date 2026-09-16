import { LaGaufreV2, MainLayout, UserMenu } from "@gouvfr-lasuite/ui-components";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { DOCS_ORIGIN, DRIVE_ORIGIN } from "../../config";

/**
 * Services proposés par la gaufre : la Docs de cet environnement et cette app.
 * Drive n'apparaît que si VITE_DRIVE_URL est défini, pour garder le profil
 * docs-solo indépendant de Drive (README.md, « Variables frontend optionnelles »).
 */
const LOCAL_SERVICES = {
  services: [
    { name: "Docs", url: DOCS_ORIGIN },
    ...(DRIVE_ORIGIN ? [{ name: "Drive", url: DRIVE_ORIGIN }] : []),
    { name: "dots", url: "/" },
  ],
};

/**
 * Coque de l'app sur le MainLayout du kit : en-tête seul (marque, gaufre, menu
 * utilisateur), sans panneau latéral — comme la maquette Figma. Le contenu des
 * routes arrive en enfant ; chaque page porte ses propres actions.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Même repli que Docs (LeftPanelFooter) : « Invité » sans session.
  const menuUser = { full_name: user?.name ?? "Invité", email: "" };

  return (
    <MainLayout
      icon={<Brand />}
      hideLeftPanelOnDesktop
      rightHeaderContent={
        <div className="dots-header-actions">
          <LaGaufreV2 data={LOCAL_SERVICES} />
          <UserMenu user={menuUser} withMobileView={false} />
        </div>
      }
    >
      {children}
    </MainLayout>
  );
}

function Brand() {
  return (
    <Link to="/" className="dots-brand">
      <span className="dots-brand__logo" aria-hidden="true">
        dt
      </span>
      <span className="dots-brand__title">dots</span>
    </Link>
  );
}
