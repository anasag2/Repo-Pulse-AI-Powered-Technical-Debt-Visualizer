import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Flame, Boxes, Bug, Link2, Copy, Braces, AlertTriangle,
  ArrowLeft, Loader2, ShieldCheck, Sparkles,
} from "lucide-react";
import { useListRepositories } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { pageEnter } from "@/lib/motion";
import RepoCardGrid from "@/components/RepoCardGrid";
import FindingAiPanel, { type AiInsight } from "@/components/FindingAiPanel";

interface FindingFactor { label: string; detail: string }
interface Finding {
  fileId: number; path: string; name: string; tdScore: number;
  category: string; severity: string; factors: FindingFactor[];
  recommendation: string; relatedPaths: string[];
}

function useFindings(repoId: number | null) {
  return useQuery({
    queryKey: ["findings", repoId],
    enabled: repoId != null,
    staleTime: 60_000,
    queryFn: async (): Promise<Finding[]> => {
      const token = getToken();
      const res = await fetch(`/api/repositories/${repoId}/findings`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Findings request failed (${res.status})`);
      return res.json();
    },
  });
}

const CATEGORY: Record<string, { icon: typeof Flame; color: string }> = {
  "Hotspot": { icon: Flame, color: "text-red-400" },
  "God Class": { icon: Boxes, color: "text-orange-400" },
  "Defect-prone": { icon: Bug, color: "text-rose-400" },
  "Tight coupling": { icon: Link2, color: "text-violet-400" },
  "Significant duplication": { icon: Copy, color: "text-amber-400" },
  "Complex logic": { icon: Braces, color: "text-yellow-400" },
  "Elevated technical debt": { icon: AlertTriangle, color: "text-slate-400" },
};

const SEV_BORDER: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-slate-500",
};

// One row in the compressed left rail. Highlights when it's the selected finding.
function CompactFindingRow({ f, selected, onClick }: {
  f: Finding; selected: boolean; onClick: () => void;
}) {
  const meta = CATEGORY[f.category] ?? CATEGORY["Elevated technical debt"];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      data-testid="finding-row"
      aria-current={selected}
      className={cn(
        "w-full rounded-lg border border-l-4 border-border px-3 py-2 text-left transition-colors",
        SEV_BORDER[f.severity] ?? SEV_BORDER.low,
        selected ? "bg-emerald-500/10 ring-1 ring-emerald-500/50" : "bg-card/40 hover:bg-muted/40",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.color)} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground" title={f.path}>
          {f.name}
        </span>
        <span className="shrink-0 text-[13px] font-bold tabular-nums text-foreground">
          {f.tdScore.toFixed(2)}
        </span>
      </div>
      <div className="mt-0.5 truncate pl-[22px] font-mono text-[10px] text-muted-foreground" title={f.path}>
        {f.path}
      </div>
    </button>
  );
}

export default function Findings() {
  const { data: repos } = useListRepositories();
  const list = repos ?? [];
  const [picked, setPicked] = useState<number | null>(() => {
    const p = new URLSearchParams(window.location.search).get("repo");
    return p ? parseInt(p, 10) : null;
  });
  const repo = list.find((r) => r.id === picked) ?? null;
  const { data: findings, isLoading, isError } = useFindings(picked);
  const findingList = findings ?? [];
  const highCount = findingList.filter((f) => f.severity === "high").length;

  // Master-detail selection. A session-scoped cache of loaded insights means
  // re-selecting a finding shows instantly (and doesn't re-spend on Claude).
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const insightCache = useRef<Map<number, AiInsight>>(new Map());
  useEffect(() => { setSelectedId(null); }, [picked]);
  const selected = findingList.find((f) => f.fileId === selectedId) ?? null;

  return (
    <motion.div {...pageEnter} className="h-full">
      {list.length === 0 ? (
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-4xl p-6">
            <h1 className="text-xl font-bold text-foreground">Findings</h1>
            <div className="mt-6 rounded-xl border border-dashed border-border p-12 text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-40" />
              <p className="text-sm text-foreground/80">Analyze a repository first to see its findings.</p>
            </div>
          </div>
        </div>
      ) : !repo ? (
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-4xl p-6">
            <h1 className="text-xl font-bold text-foreground">Findings</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The files carrying the most technical debt — why they're flagged, and what to do about them.
            </p>
            <div className="mt-5">
              <RepoCardGrid repos={list} actionLabel="See findings" onPick={setPicked} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col p-6">
          {/* Header row */}
          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
            <button
              onClick={() => setPicked(null)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Repositories
            </button>
            <span className="text-sm font-semibold text-foreground">{repo.name}</span>
            {findingList.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {findingList.length} findings{highCount > 0 && ` · ${highCount} high`}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /><span className="ml-2 text-sm">Analyzing…</span>
            </div>
          ) : isError ? (
            <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
              Couldn't load findings. Try Refresh on the repo.
            </div>
          ) : findingList.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <ShieldCheck className="h-7 w-7 text-emerald-400/70" />
              No significant findings — this repository looks healthy.
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 gap-4">
              {/* Compressed ranked list */}
              <div className="w-64 shrink-0 space-y-1.5 overflow-y-auto pr-1 lg:w-72">
                {findingList.map((f) => (
                  <CompactFindingRow
                    key={f.fileId}
                    f={f}
                    selected={f.fileId === selectedId}
                    onClick={() => setSelectedId(f.fileId)}
                  />
                ))}
              </div>

              {/* AI analysis detail */}
              <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card/40">
                {selected ? (
                  <FindingAiPanel
                    key={selected.fileId}
                    repoId={repo.id}
                    fileId={selected.fileId}
                    filePath={selected.path}
                    repoUrl={repo.url}
                    cached={insightCache.current.get(selected.fileId) ?? null}
                    onLoaded={(fid, ins) => insightCache.current.set(fid, ins)}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                    <Sparkles className="h-8 w-8 text-emerald-400/40" />
                    <p className="max-w-xs text-sm text-muted-foreground">
                      Select a finding on the left to generate its AI debt analysis and refactor plan.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
