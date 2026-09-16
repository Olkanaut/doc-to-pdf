import { ProConnectButton } from "@gouvfr-lasuite/ui-components";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

/** `returnTo` doit rester une adresse interne : sinon on renvoie à l'accueil. */
function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/**
 * Connexion par le flux OpenID du backend (`/api/auth/login`), avec le bouton du kit.
 * Le jeton obtenu sert à lire Docs ; sans session, la lecture retombe sur le cookie
 * de session de Docs quand les deux tournent sur le même hôte.
 */
export function LoginPage() {
  const { authenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  if (authenticated) return <Navigate to={returnTo} replace />;

  return (
    <div className="dots-page">
      <div className="dots-page-header">
        <div>
          <h1>Un doc, un PDF</h1>
          <p>Connectez-vous pour retrouver vos documents Docs et les rendre en PDF.</p>
        </div>
      </div>
      <div className="dots-login">
        <p id="login-hint">Se connecter avec ProConnect</p>
        {/* Navigation plein page : le flux OpenID sort de l'application. */}
        <ProConnectButton
          onClick={() => {
            window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
          }}
        />
      </div>
    </div>
  );
}
