import type { ReactElement } from "react";
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { LeftPanel } from "./components/shell/LeftPanel";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { DocumentPage } from "./pages/DocumentPage";
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

function guarded(element: ReactElement) {
  return <ProtectedRoute>{element}</ProtectedRoute>;
}

export default function App() {
  return (
    <div className="dots-shell">
      <LeftPanel />
      <main className="dots-main">
        <Routes>
          <Route path="/" element={<Navigate to="/templates" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/docs/:id" element={guarded(<DocumentPage />)} />
          <Route path="/templates" element={guarded(<TemplatesListPage />)} />
          <Route path="/templates/:id" element={guarded(<TemplateEditorPage />)} />
          <Route path="/templates/:id/layout" element={guarded(<LayoutEditorPage />)} />
          <Route path="/template/editor" element={<LegacyEditorRedirect />} />
          <Route path="/documents/new" element={guarded(<ComposePage />)} />
        </Routes>
      </main>
    </div>
  );
}
