import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";

// /api/settings isn't in the generated client, so call it directly with the
// bearer token (same pattern as the coupling endpoint).
export interface UserSettings {
  theme: string;
  defaultColorBy: string;
  defaultView: string;
  avatar: string;
}

const DEFAULTS: UserSettings = { theme: "dark", defaultColorBy: "risk", defaultView: "3d", avatar: "" };

async function settingsFetch(init?: RequestInit): Promise<UserSettings> {
  const token = getToken();
  const res = await fetch("/api/settings", {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) throw new Error(`Settings request failed (${res.status})`);
  return res.json();
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => settingsFetch() });
}

// PUT replaces the whole settings object, so merge the change onto the current
// settings (never send a partial — missing fields would reset to defaults).
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (partial: Partial<UserSettings>) => {
      const current = qc.getQueryData<UserSettings>(["settings"]) ?? (await settingsFetch());
      const merged = { ...DEFAULTS, ...current, ...partial };
      return settingsFetch({ method: "PUT", body: JSON.stringify(merged) });
    },
    onSuccess: (data) => qc.setQueryData(["settings"], data),
  });
}
