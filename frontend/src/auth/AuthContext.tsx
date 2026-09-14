import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchSession, type SessionInfo } from "../api/client";

/**
 * Single seam for auth state. Today it just calls the backend's stub
 * /api/session (always "authenticated"). Phase 2 swaps that endpoint for a
 * real check against the Keycloak-issued session cookie — nothing here or
 * in ProtectedRoute/the pages needs to change when that happens.
 */
interface AuthState {
  loading: boolean;
  authenticated: boolean;
  user: SessionInfo["user"];
}

const AuthContext = createContext<AuthState>({
  loading: true,
  authenticated: false,
  user: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    loading: true,
    authenticated: false,
    user: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetchSession()
      .then((session) => {
        if (cancelled) return;
        setState({ loading: false, authenticated: session.authenticated, user: session.user });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ loading: false, authenticated: false, user: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
