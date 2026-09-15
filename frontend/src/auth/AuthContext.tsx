import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchSession, logout as logoutRequest, type SessionInfo } from "../api/client";

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

  async function logout() {
    await logoutRequest();
    setState({ loading: false, authenticated: false, user: null });
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
