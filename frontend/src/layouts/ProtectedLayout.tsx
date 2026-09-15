import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppLayout } from "./AppLayout";

export function ProtectedLayout() {
  const { loading, authenticated } = useAuth();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  if (loading) {
    return (
      <main className="page-loading" role="status">
        Chargement...
      </main>
    );
  }

  if (!authenticated) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  return <AppLayout />;
}
