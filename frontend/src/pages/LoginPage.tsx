import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/templates";
  return value;
}

export function LoginPage() {
  const { authenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const loginUrl = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

  if (authenticated) return <Navigate to={returnTo} replace />;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="auth-kicker">Dots local</p>
        <h1 id="login-title">Un doc, un PDF</h1>
        <p>
          Connectez-vous avec le realm Keycloak local pour accéder à la mini-app
          compagnon.
        </p>
        <a className="button-link" href={loginUrl}>
          Se connecter
        </a>
      </section>
    </main>
  );
}
