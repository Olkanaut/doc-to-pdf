import { ProConnectButton } from "@gouvfr-lasuite/ui-components";
import { useNavigate } from "react-router-dom";

/** Stub : ProConnect/Keycloak arrive en phase 2. Le bouton du kit renvoie vers cette page. */
export function LoginPage() {
  const navigate = useNavigate();
  return (
    <div className="dots-page">
      <div className="dots-page-header">
        <div>
          <h1>Connexion requise</h1>
          <p>ProConnect/Keycloak arrive en phase 2 : le bouton ci-dessous renvoie vers cette page.</p>
        </div>
      </div>
      <div className="dots-login">
        <p id="login-hint">Se connecter avec ProConnect</p>
        <ProConnectButton onClick={() => navigate("/login")} />
      </div>
    </div>
  );
}
