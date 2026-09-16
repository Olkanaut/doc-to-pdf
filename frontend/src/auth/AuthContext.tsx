import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchSession, type SessionInfo } from "../api/client";

interface AuthState extends SessionInfo {
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  loading: true,
  authenticated: false,
  user: null,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    loading: true,
    authenticated: false,
    user: null,
  });

  async function refresh() {
    try {
      const session = await fetchSession();
      setState({ loading: false, authenticated: session.authenticated, user: session.user });
    } catch {
      setState({ loading: false, authenticated: false, user: null });
    }
  }

  function logout(): Promise<void> {
    window.location.assign("/api/auth/logout/sso");
    return Promise.resolve();
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
