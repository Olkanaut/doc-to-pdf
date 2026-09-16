import { MainLayout, UserMenu } from "@gouvfr-lasuite/ui-components";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { DotsGaufre } from "./DotsGaufre";

/**
 * Coque de l'app sur le MainLayout du kit : en-tête seul (marque, gaufre, menu
 * utilisateur), sans panneau latéral — comme la maquette Figma. Le contenu des
 * routes arrive en enfant ; chaque page porte ses propres actions.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <MainLayout
      icon={<HeaderIcon />}
      hideLeftPanelOnDesktop
      rightHeaderContent={<HeaderRight />}
    >
      {children}
    </MainLayout>
  );
}

function HeaderIcon() {
  return (
    <Link to="/" className="dots__header__left" aria-label="Dots">
      <span className="dots__header__logo" aria-hidden="true">
        dt
      </span>
      <span className="dots__header__title">Dots</span>
    </Link>
  );
}

function HeaderRight() {
  return (
    <div className="dots__header__right">
      <DotsGaufre />
      <DotsUserProfile />
    </div>
  );
}

function DotsUserProfile() {
  const { authenticated, user, logout } = useAuth();
  // Même repli que Docs (LeftPanelFooter) : « Invité » sans session.
  const menuUser = {
    full_name: user?.name ?? user?.preferredUsername ?? "Invité",
    email: user?.email ?? "",
  };

  return <UserMenu user={menuUser} logout={authenticated ? () => void logout() : undefined} />;
}
