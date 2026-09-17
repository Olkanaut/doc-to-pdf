import type { ReactElement } from "react";
import {
  Navigate,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./components/shell/AppShell";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { LoginPage } from "./pages/LoginPage";
import { TemplatesListPage } from "./pages/TemplatesListPage";
import { LayoutEditorPage } from "./pages/LayoutEditorPage";
import { DocumentPage } from "./pages/DocumentPage";
import "./App.css";
import "./theme.css";

/** `/template/editor?id=…` (nom retenu dans CLAUDE.md) → `/t/:id/layout`. */
function LegacyEditorRedirect() {
  const [params] = useSearchParams();
  const id = params.get("id");
  return (
    <Navigate to={id ? `/t/${encodeURIComponent(id)}/layout` : "/"} replace />
  );
}

/** Ancien plan d'adresses : `/templates/:id` → `/t/:id`, avec ou sans `/layout`. */
function TemplateRedirect({ layout = false }: { layout?: boolean }) {
  const { id } = useParams<{ id: string }>();
  return (
    <Navigate
      to={id ? `/t/${encodeURIComponent(id)}${layout ? "/layout" : ""}` : "/"}
      replace
    />
  );
}

/** Ancien rendu : `/documents/new?doc=…` → `/docs/:id`, la template demandée est conservée. */
function DocumentsNewRedirect() {
  const [params] = useSearchParams();
  const doc = params.get("doc");
  const template = params.get("template");
  const search = template ? `?template=${encodeURIComponent(template)}` : "";
  return (
    <Navigate
      to={`${doc ? `/docs/${encodeURIComponent(doc)}` : "/"}${search}`}
      replace
    />
  );
}

/** Raccourci `/d/:id`, même cible que le chemin de Docs. */
function ShortDocRedirect() {
  const { id } = useParams<{ id: string }>();
  return (
    <Navigate to={id ? `/docs/${encodeURIComponent(id)}` : "/docs"} replace />
  );
}

/** Entrée canonique d'une template : l'éditeur unifié s'ouvre en mode mise en page. */
function TemplateEditorRedirect() {
  const { id } = useParams<{ id: string }>();
  return (
    <Navigate to={id ? `/t/${encodeURIComponent(id)}/layout` : "/"} replace />
  );
}

function guarded(element: ReactElement) {
  return <ProtectedRoute>{element}</ProtectedRoute>;
}

export default function App() {
  return (
    <AppShell>
      <main className="dots-main">
        <Routes>
          <Route path="/" element={guarded(<TemplatesListPage />)} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          {/* Même chemin que Docs : `docs…/docs/<id>/` devient `dots…/docs/<id>/`. */}
          <Route path="/docs" element={<Navigate to="/" replace />} />
          <Route path="/docs/:id" element={guarded(<DocumentPage />)} />
          <Route path="/d/:id" element={<ShortDocRedirect />} />
          <Route path="/t/:id" element={guarded(<TemplateEditorRedirect />)} />
          <Route path="/t/:id/:mode" element={guarded(<LayoutEditorPage />)} />
          <Route path="/templates" element={<Navigate to="/" replace />} />
          <Route path="/templates/:id" element={<TemplateRedirect />} />
          <Route
            path="/templates/:id/layout"
            element={<TemplateRedirect layout />}
          />
          <Route path="/template/editor" element={<LegacyEditorRedirect />} />
          <Route
            path="/documents/new"
            element={guarded(<DocumentsNewRedirect />)}
          />
        </Routes>
      </main>
    </AppShell>
  );
}
