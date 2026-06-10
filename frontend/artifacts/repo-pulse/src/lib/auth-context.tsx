import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  type AuthUser,
  fetchMe,
  login as apiLogin,
  signup as apiSignup,
  setToken,
  clearToken,
} from "./auth";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, validate any stored token by fetching the current user.
  useEffect(() => {
    let active = true;
    fetchMe()
      .then((u) => active && setUser(u))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function login(email: string, password: string) {
    const res = await apiLogin(email, password);
    setToken(res.accessToken);
    setUser(res.user);
  }

  async function signup(email: string, name: string, password: string) {
    const res = await apiSignup(email, name, password);
    setToken(res.accessToken);
    setUser(res.user);
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
