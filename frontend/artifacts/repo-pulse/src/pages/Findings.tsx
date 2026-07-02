import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Flame, Boxes, Bug, Link2, Copy, Braces, AlertTriangle,
  ArrowLeft, ArrowRight, Loader2, ShieldCheck,
} from "lucide-react";
import { useListRepositories } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { pageEnter, stagger, rise } from "@/lib/motion";
import RepoCardGrid from "@/components/RepoCardGrid";

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

function FindingCard({ repoId, f }: { repoId: number; f: Finding }) {
  const meta = CATEGORY[f.category] ?? CATEGORY["Elevated technical debt"];
  const Icon = meta.icon;
  return (
    <motion.div
      variants={rise}
      className={cn("rounded-xl border border-l-4 border-border bg-card/40 p-4", SEV_BORDER[f.severity] ?? SEV_BORDER.low)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon className={cn("h-4 w-4 shrink-0", meta.color)} />
            <span className="text-sm font-semibold text-foreground">{f.category}</span>
            <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{f.severity}</span>
          </div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground" title={f.path}>{f.path}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold text-foreground">{f.tdScore.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground">TD score</div>
        </div>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-foreground/85">{f.recommendation}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {f.factors.map((x) => (
          <span key={x.label} className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
            <span className="text-foreground/80">{x.label}</span> · {x.detail}
          </span>
        ))}
      </div>

      {f.relatedPaths.length > 0 && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Changes with: {f.relatedPaths.map((p, i) => (
            <span key={p}>{i > 0 && ", "}<span className="font-mono text-foreground/70">{p}</span></span>
          ))}
        </div>
      )}

    </motion.div>
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
  const highCount = (findings ?? []).filter((f) => f.severity === "high").length;

  return (
    <motion.div {...pageEnter} className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-xl font-bold text-foreground">Findings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The files carrying the most technical debt — why they're flagged, and what to do about them.
        </p>

        {list.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border p-12 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-40" />
            <p className="text-sm text-foreground/80">Analyze a repository first to see its findings.</p>
          </div>
        ) : !repo ? (
          <div className="mt-5">
            <RepoCardGrid repos={list} actionLabel="See findings" onPick={setPicked} />
          </div>
        ) : (
          <div className="mt-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setPicked(null)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Repositories
              </button>
              <span className="text-sm font-semibold text-foreground">{repo.name}</span>
              {findings && findings.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {findings.length} findings{highCount > 0 && ` · ${highCount} high`}
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="flex h-72 items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /><span className="ml-2 text-sm">Analyzing…</span>
              </div>
            ) : isError ? (
              <div className="flex h-72 items-center justify-center text-center text-sm text-muted-foreground">
                Couldn't load findings. Try Refresh on the repo.
              </div>
            ) : (findings ?? []).length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <ShieldCheck className="h-7 w-7 text-emerald-400/70" />
                No significant findings — this repository looks healthy.
              </div>
            ) : (
              <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
                {(findings ?? []).map((f) => <FindingCard key={f.fileId} repoId={repo.id} f={f} />)}
              </motion.div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
