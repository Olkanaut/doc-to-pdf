import { useEffect, useState } from "react";
import { Button } from "@gouvfr-lasuite/ui-components";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

/** `returnTo` doit rester une adresse interne : sinon on renvoie à l'accueil. */
function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/**
 * Marque « une redirection a déjà été tentée dans cet onglet ». Le voyage OIDC est
 * une navigation plein page : ni state React ni ref ne survivent, sessionStorage si.
 * Elle meurt avec l'onglet, ce qui est exactement la durée voulue.
 */
const TRIED_KEY = "dots:auto-login";

function alreadyTried(): boolean {
  try {
    return sessionStorage.getItem(TRIED_KEY) === "1";
  } catch {
    // Stockage indisponible : on ne peut pas compter les tentatives, donc on ne
    // redirige pas tout seul. Un clic de plus vaut mieux qu'une boucle infinie.
    return true;
  }
}

function markTried(): void {
  try {
    sessionStorage.setItem(TRIED_KEY, "1");
  } catch {
    // sans importance : alreadyTried() renvoie déjà true dans ce cas
  }
}

function clearTried(): void {
  try {
    sessionStorage.removeItem(TRIED_KEY);
  } catch {
    // idem
  }
}

function login(returnTo: string): void {
  // Navigation plein page : le flux OpenID sort de l'application.
  window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * Connexion par le flux OpenID du backend (`/api/auth/login`).
 *
 * Personne n'a à cliquer dans le cas normal : qui arrive de Docs a déjà une session
 * Keycloak, l'aller-retour se fait sans afficher de formulaire et cette page n'est
 * jamais vue. Le bouton n'est que le filet — il n'apparaît que si la redirection
 * automatique a déjà échoué une fois dans cet onglet.
 *
 * Ce filet n'est pas décoratif : les sessions du backend sont en mémoire, donc un
 * redémarrage renvoie ici alors que Keycloak, lui, reconnaît toujours l'utilisateur.
 * Sans compteur, les deux se renverraient la balle indéfiniment.
 *
 * La pile locale s'authentifie par Keycloak : rien n'est branché sur ProConnect.
 */
export function LoginPage() {
  const { loading, authenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  // Décidé une fois, à la première image : la tentative précédente a-t-elle échoué ?
  // La marque est effacée dans la foulée, pour que le clic suivant ait droit à sa
  // redirection. L'effet, lui, ne fait plus que la navigation.
  const [needsClick] = useState(() => {
    const tried = alreadyTried();
    if (tried) clearTried();
    return tried;
  });

  useEffect(() => {
    if (loading || authenticated || needsClick) return;
    markTried();
    login(returnTo);
  }, [loading, authenticated, needsClick, returnTo]);

  if (authenticated) {
    clearTried();
    return <Navigate to={returnTo} replace />;
  }

  if (!needsClick) {
    return <div className="page-loading" role="status">Connexion…</div>;
  }

  return (
    <div className="dots-page">
      <div className="dots-page-header">
        <div>
          <img className="dots-auth-logo" src="/logo_full.svg" alt="Un doc, un PDF" />
          <p>Connectez-vous pour retrouver vos documents Docs et les rendre en PDF.</p>
        </div>
      </div>
      <div className="dots-login">
        <Button onClick={() => login(returnTo)}>Se connecter</Button>
      </div>
    </div>
  );
}
