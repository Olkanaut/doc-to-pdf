import type { ReactElement } from "react";
import { Navigate, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { HomeLayout } from "./layouts/HomeLayout";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { TemplatesListPage } from "./pages/TemplatesListPage";
import { TemplateEditorPage } from "./pages/TemplateEditorPage";
import { LayoutEditorPage } from "./pages/LayoutEditorPage";
import { DocumentPage } from "./pages/DocumentPage";
import "./App.css";
import "./theme.css";

/** `/template/editor?id=...` (nom retenu dans CLAUDE.md) -> `/t/:id/layout`. */
function LegacyEditorRedirect() {
  const [params] = useSearchParams();
  const id = params.get("id");
  return <Navigate to={id ? `/t/${encodeURIComponent(id)}/layout` : "/"} replace />;
}

function TemplateRedirect({ layout = false }: { layout?: boolean }) {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/t/${encodeURIComponent(id)}${layout ? "/layout" : ""}` : "/"} replace />;
}

function DocumentsNewRedirect() {
  const [params] = useSearchParams();
  const doc = params.get("doc");
  const template = params.get("template");
  const nextParams = new URLSearchParams();
  if (template) nextParams.set("template", template);
  const search = nextParams.toString();
  const target = doc ? `/docs/${encodeURIComponent(doc)}` : "/docs";
  return <Navigate to={`${target}${search ? `?${search}` : ""}`} replace />;
}

function guarded(element: ReactElement) {
  return <ProtectedRoute>{element}</ProtectedRoute>;
}

export default function App() {
  return (
    <HomeLayout>
      <Routes>
        <Route path="/" element={guarded(<TemplatesListPage />)} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/docs" element={guarded(<HomePage />)} />
        <Route path="/docs/:id" element={guarded(<DocumentPage />)} />
        <Route path="/t/:id" element={guarded(<TemplateEditorPage />)} />
        <Route path="/t/:id/layout" element={guarded(<LayoutEditorPage />)} />
        <Route path="/templates" element={<Navigate to="/" replace />} />
        <Route path="/templates/:id" element={<TemplateRedirect />} />
        <Route path="/templates/:id/layout" element={<TemplateRedirect layout />} />
        <Route path="/template/editor" element={<LegacyEditorRedirect />} />
        <Route path="/documents/new" element={guarded(<DocumentsNewRedirect />)} />
      </Routes>
    </HomeLayout>
  );
}
