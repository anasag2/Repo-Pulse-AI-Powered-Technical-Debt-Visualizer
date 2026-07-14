import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { Sparkles, ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { ease } from "@/lib/motion";

export interface AiInsight {
  summary: string;
  severity: "low" | "medium" | "high";
  debtDrivers: string[];
  refactorSteps: string[];
  estimatedEffort: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-green-400/15 text-green-400 border-green-400/25",
  medium: "bg-orange-400/15 text-orange-400 border-orange-400/25",
  high: "bg-red-400/15 text-red-400 border-red-400/25",
};

// Reveal the analysis top-to-bottom: each block rises + fades in sequence, and the
// refactor steps cascade line-by-line (a nested stagger continues the same motion).
const revealContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11, delayChildren: 0.04 } },
};
const revealItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
};

// GitHub blob link for a repo-relative path (best-effort; HEAD is fine for display).
function blobUrl(repoUrl: string, filePath: string): string {
  const clean = repoUrl.replace(/\.git$/, "").replace(/\/+$/, "");
  return `${clean}/blob/HEAD/${filePath}`;
}

function Ghost({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("rounded-md bg-muted/50 animate-pulse", className)} style={style} />;
}

// "Phantom" placeholder shaped like the real analysis — no spinner, just shimmer.
function PhantomAnalysis() {
  return (
    <div className="space-y-7" aria-hidden data-testid="ai-phantom">
      <div className="space-y-2.5">
        <Ghost className="h-2.5 w-20" />
        <Ghost className="h-4 w-full" />
        <Ghost className="h-4 w-[94%]" />
        <Ghost className="h-4 w-[68%]" />
      </div>
      <div className="space-y-2.5">
        <Ghost className="h-2.5 w-24" />
        <div className="flex flex-wrap gap-2">
          <Ghost className="h-6 w-24" />
          <Ghost className="h-6 w-20" />
          <Ghost className="h-6 w-28" />
        </div>
      </div>
      <div className="space-y-3">
        <Ghost className="h-2.5 w-24" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <Ghost className="h-5 w-5 shrink-0 rounded-full" />
            <Ghost className="h-4 flex-1" style={{ maxWidth: `${90 - i * 8}%` } as React.CSSProperties} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FindingAiPanel({
  repoId,
  fileId,
  filePath,
  repoUrl,
  cached,
  onLoaded,
}: {
  repoId: number;
  fileId: number;
  filePath: string;
  repoUrl: string;
  cached: AiInsight | null;
  onLoaded: (fileId: number, insight: AiInsight) => void;
}) {
  const [state, setState] = useState<"loading" | "done" | "error">(cached ? "done" : "loading");
  const [insight, setInsight] = useState<AiInsight | null>(cached);
  const [error, setError] = useState("");

  async function run(force: boolean) {
    setState("loading");
    setError("");
    try {
      const token = getToken();
      const res = await fetch(
        `/api/repositories/${repoId}/files/${fileId}/ai-insight?force=${force}`,
        { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      const data: AiInsight = await res.json();
      setInsight(data);
      setState("done");
      onLoaded(fileId, data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setState("error");
    }
  }

  // The panel is keyed by fileId, so this runs once per selected finding. A cached
  // insight (already loaded this session) shows instantly; otherwise `force=false`
  // returns a server-cached analysis for free, or generates one (counts against the
  // per-user daily AI quota — hence load-on-select rather than load-all).
  useEffect(() => {
    if (!cached) run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
              <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" /> AI Debt Analysis
            </h3>
            <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{filePath}</p>
          </div>
          {state !== "loading" && (
            <button
              onClick={() => run(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
              data-testid="button-reanalyze-finding"
            >
              <RefreshCw className="h-3 w-3" /> Re-analyze
            </button>
          )}
        </div>
        {state === "done" && insight && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                SEVERITY_STYLE[insight.severity],
              )}
            >
              {insight.severity} severity
            </span>
            <span className="text-[11px] text-muted-foreground">
              Estimated effort: <span className="font-medium text-foreground">{insight.estimatedEffort}</span>
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {state === "loading" && <PhantomAnalysis />}

        {state === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="h-7 w-7 text-red-400/70" />
            <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => run(false)}
              className="rounded-md border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60"
            >
              Try again
            </button>
          </div>
        )}

        {state === "done" && insight && (
          <motion.div
            variants={revealContainer}
            initial="hidden"
            animate="show"
            className="space-y-7"
            data-testid="ai-analysis"
          >
            <motion.section variants={revealItem}>
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Summary</div>
              <p className="text-[13px] leading-relaxed text-foreground">{insight.summary}</p>
            </motion.section>

            {insight.debtDrivers.length > 0 && (
              <motion.section variants={revealItem}>
                <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Debt drivers</div>
                <div className="flex flex-wrap gap-1.5">
                  {insight.debtDrivers.map((d, i) => (
                    <span key={i} className="rounded-md border border-border bg-muted/60 px-2 py-1 text-[12px] text-foreground">
                      {d}
                    </span>
                  ))}
                </div>
              </motion.section>
            )}

            {insight.refactorSteps.length > 0 && (
              <motion.section variants={revealContainer}>
                <motion.div
                  variants={revealItem}
                  className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  Refactor plan
                </motion.div>
                <ol className="space-y-2.5">
                  {insight.refactorSteps.map((s, i) => (
                    <motion.li key={i} variants={revealItem} className="flex gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-[11px] font-bold text-emerald-400">
                        {i + 1}
                      </span>
                      <span className="pt-0.5 text-[13px] leading-relaxed text-foreground">{s}</span>
                    </motion.li>
                  ))}
                </ol>
              </motion.section>
            )}

            {repoUrl && (
              <motion.div variants={revealItem}>
                <a
                  href={blobUrl(repoUrl, filePath)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                >
                  Open on GitHub <ExternalLink className="h-3 w-3" />
                </a>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
