import { Route, Routes } from "react-router-dom";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { DocumentPage } from "./pages/DocumentPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { TemplatesListPage } from "./pages/TemplatesListPage";
import { TemplateEditorPage } from "./pages/TemplateEditorPage";
import { ComposePage } from "./pages/ComposePage";
import "./App.css";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/docs/:id" element={<DocumentPage />} />
        <Route path="/templates" element={<TemplatesListPage />} />
        <Route path="/templates/:id" element={<TemplateEditorPage />} />
        <Route path="/documents/new" element={<ComposePage />} />
      </Route>
    </Routes>
  );
}
