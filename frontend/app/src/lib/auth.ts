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
  provider: "github" | "google" | null;
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

// Password reset (public endpoints — no token, no AuthResponse).
async function postPublic(path: string, body: unknown): Promise<void> {
  const res = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => ({})), res.status));
}

export function requestPasswordReset(email: string): Promise<void> {
  return postPublic("forgot-password", { email });
}

export function resetPassword(token: string, password: string): Promise<void> {
  return postPublic("reset-password", { token, password });
}

// Non-consuming check so the reset page can show a used/expired link as dead.
export async function validateResetToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
    if (!res.ok) return false;
    return !!(await res.json()).valid;
  } catch {
    return false;
  }
}

// Social login (OAuth): send the browser to the backend, which redirects on to
// the provider. After the provider calls back, the backend bounces us here with
// the result in the URL hash (#token=... or #error=...) — see consumeOAuthRedirect.
export function startGitHubLogin(): void {
  window.location.href = "/api/auth/github/login";
}

export function startGoogleLogin(): void {
  window.location.href = "/api/auth/google/login";
}

// If we just came back from an OAuth round-trip, persist the token (or surface
// the error) and strip the hash so it doesn't linger in the URL / history.
// Returns an error message if the provider reported one, else null.
export function consumeOAuthRedirect(): string | null {
  const hash = window.location.hash;
  if (!hash || (!hash.includes("token=") && !hash.includes("error="))) return null;

  const params = new URLSearchParams(hash.slice(1));
  const token = params.get("token");
  const error = params.get("error");

  // Remove the hash without adding a history entry or reloading.
  const cleanUrl = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", cleanUrl);

  if (token) {
    setToken(token);
    return null;
  }
  return error ?? "Social login failed";
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

// Updates the display name on the current account.
export async function updateProfile(name: string): Promise<AuthUser> {
  const token = getToken();
  const res = await fetch("/api/auth/me", {
    method: "PATCH",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => ({})), res.status));
  return res.json();
}

// Emails a one-time code that must be passed to deleteAccount().
export async function requestDeleteCode(): Promise<void> {
  const token = getToken();
  const res = await fetch("/api/auth/me/delete-code", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => ({})), res.status));
}

// Permanently deletes the current user and everything they own. Irreversible.
// Requires the code emailed by requestDeleteCode().
export async function deleteAccount(code: string): Promise<void> {
  const token = getToken();
  const res = await fetch("/api/auth/me", {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => ({})), res.status));
}
