import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, authenticated } = useAuth();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  if (loading) return <div className="page-loading" role="status">Chargement...</div>;
  if (!authenticated) return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  return <>{children}</>;
}
