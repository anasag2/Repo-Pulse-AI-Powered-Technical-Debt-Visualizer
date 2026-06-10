// Auth token storage + the /api/auth calls.
//
// We register an auth-token getter with the generated API client so every
// hook-driven request (useListRepositories, useGetFile, …) automatically
// carries `Authorization: Bearer <token>`.
import { setAuthTokenGetter } from "@workspace/api-client-react";

const TOKEN_KEY = "rp_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Register once at module load.
setAuthTokenGetter(() => getToken());

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

interface AuthResponse {
  accessToken: string;
  tokenType: string;
  user: AuthUser;
}

// FastAPI returns `detail` as a string for HTTPExceptions and an array of
// {msg,...} for 422 validation errors — normalize both.
function errorMessage(data: unknown, status: number): string {
  const detail = (data as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => (e as { msg?: string }).msg ?? "Invalid input").join("; ");
  }
  return `Request failed (${status})`;
}

async function authPost(path: string, body: unknown): Promise<AuthResponse> {
  const res = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorMessage(data, res.status));
  return data as AuthResponse;
}

export function signup(email: string, name: string, password: string) {
  return authPost("signup", { email, name, password });
}
export function login(email: string, password: string) {
  return authPost("login", { email, password });
}

// Validate the stored token and load the current user (null if no/invalid token).
export async function fetchMe(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as AuthUser;
}
