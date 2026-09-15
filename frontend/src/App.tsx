import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { LoginPage } from "./pages/LoginPage";
import { TemplatesListPage } from "./pages/TemplatesListPage";
import { TemplateEditorPage } from "./pages/TemplateEditorPage";
import { ComposePage } from "./pages/ComposePage";
import type { AuthUser } from "./api/client";
import "./App.css";

function userDisplayName(user: AuthUser): string {
  const fullName = [user.givenName, user.familyName].filter(Boolean).join(" ");
  return (
    (user.name ?? fullName) ||
    user.preferredUsername ||
    user.email ||
    "Utilisateur connecté"
  );
}

function UserMenu() {
  const { authenticated, user, logout } = useAuth();

  if (!authenticated || !user) return null;

  return (
    <div className="user-chip">
      <span>
        <strong>{userDisplayName(user)}</strong>
        <small>{user.email ?? user.sub}</small>
      </span>
      <button className="secondary-button" type="button" onClick={() => void logout()}>
        Se déconnecter
      </button>
    </div>
  );
}

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <p className="app-title">Un doc, un PDF</p>
        <nav className="app-nav">
          <NavLink to="/templates">Gabarits</NavLink>
          <NavLink to="/documents/new">Créer un document</NavLink>
        </nav>
        <UserMenu />
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/templates" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            path="/templates"
            element={
              <ProtectedRoute>
                <TemplatesListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/templates/:id"
            element={
              <ProtectedRoute>
                <TemplateEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documents/new"
            element={
              <ProtectedRoute>
                <ComposePage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
