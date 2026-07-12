import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import type { RepoTour, TourKind } from "@/lib/learn-types";

// The tour endpoint isn't in the generated client, so call it directly with the
// bearer token (same pattern as coupling/settings/chat). It's a POST because the
// server builds the tour on demand, but it reads like a query, so we cache it.
// `kind` selects the lens: "code" (how it works) or "debt" (technical-debt tour).
// The server caches the AI-authored tour in Mongo, so repeat calls are free and
// instant; `refresh` forces a (paid) regeneration.
async function fetchTour(repoId: number, kind: TourKind, refresh = false): Promise<RepoTour> {
  const token = getToken();
  const res = await fetch(
    `/api/repositories/${repoId}/tour?kind=${kind}${refresh ? "&refresh=true" : ""}`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!res.ok) {
    let detail = `Tour request failed (${res.status})`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export function useTour(repoId: number, kind: TourKind) {
  return useQuery({
    queryKey: ["tour", repoId, kind],
    queryFn: () => fetchTour(repoId, kind),
    enabled: Number.isFinite(repoId),
  });
}

export interface FileContent {
  path: string;
  content: string;
  truncated: boolean;
}

async function fetchFileContent(repoId: number, fileId: number): Promise<FileContent> {
  const token = getToken();
  const res = await fetch(`/api/repositories/${repoId}/files/${fileId}/content`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Couldn't load file (${res.status})`);
  return res.json();
}

// Lazily fetch a file's source for the inline code viewer. Cached per file.
export function useFileContent(repoId: number, fileId: number | null | undefined) {
  return useQuery({
    queryKey: ["file-content", repoId, fileId],
    queryFn: () => fetchFileContent(repoId, fileId as number),
    enabled: Number.isFinite(repoId) && fileId != null,
    staleTime: Infinity, // source doesn't change between views
  });
}

// Force a fresh (paid) regeneration and update the cached query in place.
export function useRegenerateTour(repoId: number, kind: TourKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetchTour(repoId, kind, true),
    onSuccess: (data) => qc.setQueryData(["tour", repoId, kind], data),
  });
}
