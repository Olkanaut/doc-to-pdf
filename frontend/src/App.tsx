import { useEffect, useRef, useState } from "react";
import {
  completeLogin,
  fetchAuthMe,
  fetchFixtures,
  fetchTemplateSource,
  fetchTemplates,
  logout,
  renderPdf,
  type AuthState,
  type AuthUser,
  type FixtureSummary,
  type TemplateSummary,
} from "./api/client";
import { TemplatePicker } from "./components/TemplatePicker";
import { FixturePicker } from "./components/FixturePicker";
import { TemplateEditor } from "./components/TemplateEditor";
import { PdfPreview } from "./components/PdfPreview";
import "./App.css";

const AUTH_CALLBACK_PATH = "/auth/callback";

function userDisplayName(user: AuthUser): string {
  const fullName = [user.givenName, user.familyName].filter(Boolean).join(" ");
  return (
    (user.name ?? fullName) ||
    user.preferredUsername ||
    user.email ||
    "Utilisateur connecté"
  );
}

function currentReturnTo(): string {
  const { pathname, search, hash } = window.location;
  const returnTo = `${pathname}${search}${hash}`;
  if (returnTo === AUTH_CALLBACK_PATH) return "/";
  return returnTo;
}

function LoginPage({ error }: { error?: string }) {
  const loginUrl = `/api/auth/login?returnTo=${encodeURIComponent(currentReturnTo())}`;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="auth-kicker">Dots local</p>
        <h1 id="login-title">Un doc, un PDF</h1>
        <p>
          Connectez-vous avec le realm Keycloak local pour accéder à la mini-app
          compagnon.
        </p>
        {error && <div className="error">{error}</div>}
        <a className="button-link" href={loginUrl}>
          Se connecter
        </a>
      </section>
    </main>
  );
}

function AuthPending({ message }: { message: string }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="auth-kicker">Dots local</p>
        <h1>Un doc, un PDF</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function AuthCallback({
  onAuthenticated,
}: {
  onAuthenticated: (state: AuthState) => void;
}) {
  const params = new URLSearchParams(window.location.search);
  const oidcError = params.get("error");
  const code = params.get("code");
  const state = params.get("state");
  const initialError =
    params.get("error_description") ??
    oidcError ??
    (!code || !state ? "Callback OIDC incomplet." : undefined);

  const [error, setError] = useState<string | undefined>(initialError);
  const started = useRef(false);

  useEffect(() => {
    if (initialError || !code || !state) return;
    if (started.current) return;
    started.current = true;

    completeLogin(code, state)
      .then((result) => {
        window.history.replaceState(null, "", result.returnTo || "/");
        onAuthenticated({ authenticated: true, user: result.user });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Connexion impossible.");
      });
  }, [code, initialError, onAuthenticated, state]);

  if (error) return <LoginPage error={error} />;
  return <AuthPending message="Connexion en cours..." />;
}

function PdfWorkspace({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [fixtureId, setFixtureId] = useState("");

  const [editorEnabled, setEditorEnabled] = useState(false);
  const [templateSource, setTemplateSource] = useState("");

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ error: string; details?: string } | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([fetchTemplates(), fetchFixtures()])
      .then(([nextTemplates, nextFixtures]) => {
        if (!active) return;
        setTemplates(nextTemplates);
        setFixtures(nextFixtures);
        if (nextTemplates.length > 0) setTemplateId(nextTemplates[0].id);
        if (nextFixtures.length > 0) setFixtureId(nextFixtures[0].id);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError({
          error: "Chargement impossible",
          details: err instanceof Error ? err.message : undefined,
        });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!templateId) return;
    fetchTemplateSource(templateId).then(setTemplateSource);
  }, [templateId]);

  async function handleGenerate() {
    if (!fixtureId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await renderPdf({
        fixtureId,
        ...(editorEnabled ? { templateSource } : { templateId }),
      });
      if (result.ok) {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(URL.createObjectURL(result.blob));
      } else {
        setError({ error: result.error, details: result.details });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLogoutError(null);
    try {
      await logout();
      onLogout();
    } catch (err: unknown) {
      setLogoutError(err instanceof Error ? err.message : "Déconnexion impossible.");
    }
  }

  return (
    <div className="app">
      <div className="app-topbar">
        <div className="user-chip">
          <strong>{userDisplayName(user)}</strong>
          <span>{user.email ?? user.sub}</span>
        </div>
        <button className="secondary-button" onClick={handleLogout}>
          Se déconnecter
        </button>
      </div>
      {logoutError && <div className="error">{logoutError}</div>}

      <header className="app-header">
        <h1>Un doc, un PDF</h1>
        <p>Choisissez un gabarit Typst et un document, puis générez le PDF mis en forme.</p>
      </header>

      <div className="app-body">
        <div className="controls">
          <FixturePicker fixtures={fixtures} selectedId={fixtureId} onSelect={setFixtureId} />
          <TemplatePicker
            templates={templates}
            selectedId={templateId}
            onSelect={(id) => {
              setTemplateId(id);
              setEditorEnabled(false);
            }}
          />
          <TemplateEditor
            source={templateSource}
            enabled={editorEnabled}
            onToggle={setEditorEnabled}
            onChange={setTemplateSource}
          />
          <button onClick={handleGenerate} disabled={loading || !fixtureId}>
            {loading ? "Génération..." : "Générer le PDF"}
          </button>
          {error && (
            <div className="error">
              <strong>{error.error}</strong>
              {error.details && <pre>{error.details}</pre>}
            </div>
          )}
        </div>

        <div className="preview">
          <PdfPreview pdfUrl={pdfUrl} fileName={`${fixtureId || "document"}.pdf`} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [authError, setAuthError] = useState<string | undefined>();
  const isCallback = window.location.pathname === AUTH_CALLBACK_PATH;

  useEffect(() => {
    if (isCallback) return;

    let active = true;
    fetchAuthMe()
      .then((state) => {
        if (active) setAuth(state);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setAuth({ authenticated: false });
        setAuthError(err instanceof Error ? err.message : "Auth indisponible.");
      });

    return () => {
      active = false;
    };
  }, [isCallback]);

  if (isCallback) return <AuthCallback onAuthenticated={setAuth} />;
  if (auth === null) return <AuthPending message="Vérification de la session..." />;
  if (!auth.authenticated) return <LoginPage error={authError} />;

  return <PdfWorkspace user={auth.user} onLogout={() => setAuth({ authenticated: false })} />;
}
