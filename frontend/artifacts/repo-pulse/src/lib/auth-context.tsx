import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  type AuthUser,
  fetchMe,
  login as apiLogin,
  signup as apiSignup,
  updateProfile as apiUpdateProfile,
  requestDeleteCode as apiRequestDeleteCode,
  deleteAccount as apiDeleteAccount,
  setToken,
  clearToken,
  consumeOAuthRedirect,
} from "./auth";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  oauthError: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (name: string) => Promise<void>;
  requestDeleteCode: () => Promise<void>;
  deleteAccount: (code: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // On first load: if we just returned from an OAuth round-trip, persist the
  // token (or capture the error) from the URL hash, then validate the stored
  // token by fetching the current user.
  useEffect(() => {
    let active = true;
    const err = consumeOAuthRedirect();
    if (err && active) setOauthError(err);
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

  async function updateProfile(name: string) {
    const updated = await apiUpdateProfile(name);
    setUser(updated);
  }

  async function requestDeleteCode() {
    await apiRequestDeleteCode();
  }

  async function deleteAccount(code: string) {
    await apiDeleteAccount(code);
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, oauthError, login, signup, logout, updateProfile, requestDeleteCode, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
