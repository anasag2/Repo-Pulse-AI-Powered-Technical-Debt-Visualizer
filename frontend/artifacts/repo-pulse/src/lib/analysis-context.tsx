import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAnalyzeRepository, getListRepositoriesQueryKey } from "@workspace/api-client-react";

type AnalysisStatus = "idle" | "running" | "done" | "error";

interface AnalysisInput {
  name: string;
  url: string;
  isPublic: boolean;
}

interface AnalysisState {
  status: AnalysisStatus;
  progress: number; // 0–100
  repoName: string;
  error: string | null;
  startAnalysis: (input: AnalysisInput) => void;
  dismiss: () => void;
}

const AnalysisContext = createContext<AnalysisState | null>(null);

// Default time budget (ms) used until we learn the repo's size.
const DEFAULT_ESTIMATE_MS = 20000;

// Map a repo's GitHub size (in KB) to a rough expected analyze duration. Linear
// fit, clamped: ~6s for a small repo (flask ~12 MB), ~11s for fastapi (~50 MB),
// ~3 min for something kubernetes-sized (~1.5 GB). Only a heuristic — the bar
// just needs to feel proportional, not be exact.
function sizeToEstimateMs(sizeKb: number): number {
  return Math.min(270000, Math.max(6000, 5000 + sizeKb * 0.12));
}

// Best-effort: pull the repo size from GitHub's public API to calibrate the bar.
// Returns null for non-GitHub URLs, rate limits, or any failure (we fall back to
// the default estimate). GitHub's REST API allows browser CORS, so no backend.
async function fetchEstimateMs(url: string): Promise<number | null> {
  const m = url.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.size === "number" ? sizeToEstimateMs(data.size) : null;
  } catch {
    return null;
  }
}

// The backend analyzes a repo in one long synchronous request with no progress
// reporting, so this provider fakes a smooth, believable progress bar: it eases
// toward 90% while the request is in flight, then snaps to 100% on success and
// routes to the freshly-analyzed repo. The overlay (see AnalysisOverlay) renders
// the animation on top of the app while this runs.
export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const analyzeRepo = useAnalyzeRepository();

  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [repoName, setRepoName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startRef = useRef(0);
  const estimateRef = useRef(DEFAULT_ESTIMATE_MS);

  // Drive the bar by elapsed-vs-estimated time: target = (elapsed / estimate) of
  // the way to 90%, eased for smoothness and held at 90% until the request truly
  // finishes (then onSuccess snaps to 100%). Monotonic — never goes backwards
  // even if the estimate updates mid-flight.
  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const target = Math.min(90, (elapsed / estimateRef.current) * 90);
      setProgress((p) => (target > p ? p + (target - p) * 0.2 : p));
    }, 200);
    return () => window.clearInterval(id);
  }, [status]);

  function reset() {
    setStatus("idle");
    setProgress(0);
    setRepoName("");
    setError(null);
  }

  function startAnalysis(input: AnalysisInput) {
    if (status === "running") return; // one at a time
    setRepoName(input.name);
    setError(null);
    setProgress(2);
    startRef.current = Date.now();
    estimateRef.current = DEFAULT_ESTIMATE_MS;
    setStatus("running");
    navigate("/"); // jump to the dashboard; the overlay covers it

    // Refine the time budget from the repo's size once GitHub answers.
    fetchEstimateMs(input.url).then((ms) => {
      if (ms) estimateRef.current = ms;
    });

    analyzeRepo.mutate(
      { data: input },
      {
        onSuccess: (repo) => {
          setProgress(100);
          setStatus("done");
          queryClient.invalidateQueries({ queryKey: getListRepositoriesQueryKey() });
          // Let the bar visibly fill to 100%, then reveal the new repo.
          window.setTimeout(() => {
            navigate(`/repositories/${repo.id}`);
            reset();
          }, 1100);
        },
        onError: (err) => {
          setStatus("error");
          // Surface the backend's reason (FastAPI sends { detail }) when present,
          // e.g. "Cloning timed out…" — far more useful than a generic message.
          const detail = (err as { data?: { detail?: string } })?.data?.detail;
          setError(detail || "Couldn't analyze that repository. Check the URL and try again.");
        },
      }
    );
  }

  return (
    <AnalysisContext.Provider value={{ status, progress, repoName, error, startAnalysis, dismiss: reset }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis(): AnalysisState {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysis must be used within an AnalysisProvider");
  return ctx;
}
