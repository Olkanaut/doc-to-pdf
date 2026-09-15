import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, authenticated } = useAuth();

  if (loading) return <div className="page-loading" role="status">Chargement…</div>;
  if (!authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
