import { getToken } from "@/lib/auth";

// Chat endpoints aren't in the generated client, so call them directly with the
// bearer token (same pattern as coupling/settings).
export interface ChatModel { id: string; label: string; free: boolean }
export interface ChatModelsResponse { models: ChatModel[]; hasAppKey: boolean }
export interface ChatTurn { role: "user" | "assistant"; content: string }

// BYOK + model preference live only in the browser (never persisted server-side).
const BYOK_KEY = "rp-chat-apikey";
const MODEL_KEY = "rp-chat-model";

export function getByokKey(): string { return localStorage.getItem(BYOK_KEY) ?? ""; }
export function setByokKey(v: string): void {
  if (v) localStorage.setItem(BYOK_KEY, v);
  else localStorage.removeItem(BYOK_KEY);
}
export function getSavedModel(): string { return localStorage.getItem(MODEL_KEY) ?? ""; }
export function setSavedModel(v: string): void { localStorage.setItem(MODEL_KEY, v); }

async function authJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try { detail = (await res.json()).detail ?? detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

export function fetchChatModels(): Promise<ChatModelsResponse> {
  return authJson("/api/chat/models");
}

export function sendChat(
  repoId: number,
  body: { messages: ChatTurn[]; model?: string; fileId?: number | null; apiKey?: string },
): Promise<{ reply: string; model: string }> {
  return authJson(`/api/repositories/${repoId}/chat`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
