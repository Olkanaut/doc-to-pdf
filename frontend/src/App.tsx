import type { ReactElement } from "react";
import { Navigate, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./components/shell/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { TemplatesListPage } from "./pages/TemplatesListPage";
import { TemplateEditorPage } from "./pages/TemplateEditorPage";
import { LayoutEditorPage } from "./pages/LayoutEditorPage";
import { ComposePage } from "./pages/ComposePage";
import "./App.css";
import "./theme.css";

/** `/template/editor?id=…` (nom retenu dans CLAUDE.md) → `/templates/:id/layout`. */
function LegacyEditorRedirect() {
  const [params] = useSearchParams();
  const id = params.get("id");
  return <Navigate to={id ? `/templates/${id}/layout` : "/templates"} replace />;
}

/**
 * Même chemin que Docs : `docs…/docs/<id>/` devient `dots…/docs/<id>/` en changeant
 * seulement l'hôte, et ouvre la page Rendu sur ce document.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function DocsPathRedirect() {
  const { id } = useParams();
  return <Navigate to={id && UUID.test(id) ? `/documents/new?doc=${id}` : "/documents/new"} replace />;
}

function guarded(element: ReactElement) {
  return <ProtectedRoute>{element}</ProtectedRoute>;
}

export default function App() {
  return (
    <AppShell>
      <main className="dots-main">
        <Routes>
          <Route path="/" element={<Navigate to="/templates" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/templates" element={guarded(<TemplatesListPage />)} />
          <Route path="/templates/:id" element={guarded(<TemplateEditorPage />)} />
          <Route path="/templates/:id/layout" element={guarded(<LayoutEditorPage />)} />
          <Route path="/template/editor" element={<LegacyEditorRedirect />} />
          <Route path="/documents/new" element={guarded(<ComposePage />)} />
          <Route path="/docs/:id" element={<DocsPathRedirect />} />
          <Route path="/d/:id" element={<DocsPathRedirect />} />
        </Routes>
      </main>
    </AppShell>
  );
}
