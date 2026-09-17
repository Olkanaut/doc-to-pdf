import { Loader } from "@gouvfr-lasuite/ui-components";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { completeLogin } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function AuthCallbackPage() {
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const oidcError = params.get("error");
    if (oidcError) {
      setError(params.get("error_description") ?? oidcError);
      return;
    }

    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setError("Callback OIDC incomplet.");
      return;
    }

    completeLogin(code, state)
      .then(async (result) => {
        await refresh();
        window.location.assign(result.returnTo || "/");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Connexion impossible.");
      });
  }, [refresh]);

  if (error) {
    return (
      <main className="auth-shell">
        <section className="auth-callback-error" aria-labelledby="callback-error-title">
          <h1 id="callback-error-title">Connexion impossible</h1>
          <div className="error" role="alert">{error}</div>
          <Link className="button-link" to="/login">
            Réessayer
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell" role="status" aria-label="Connexion en cours">
      <Loader aria-label="Connexion en cours…" />
    </main>
  );
}
