import { useEffect, useState } from "react";
import {
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  FolderGit2,
  FileCode2,
  Boxes,
  Network,
  AlertTriangle,
} from "lucide-react";
import { useAnalysis } from "@/lib/analysis-context";

// Repo/git puns shown while the analysis runs — one swaps in with each shape.
const PUNS = [
  "Cloning brilliance…",
  "Branching out…",
  "Committing to the analysis…",
  "Untangling the dependency graph…",
  "Resolving merge conflicts of interest…",
  "Stashing the technical debt…",
  "Counting lines you'll refactor later…",
  "Running git blame on the bugs…",
  "Rebasing reality…",
  "Parsing the spaghetti…",
];

// The "shapeshifting" icons cycle in lockstep with the puns.
const SHAPES = [FolderGit2, GitBranch, GitCommit, Network, GitMerge, Boxes, FileCode2, GitPullRequest];

export default function AnalysisOverlay() {
  const { status, progress, repoName, error, dismiss } = useAnalysis();
  const [tick, setTick] = useState(0);

  // Advance the shape/pun on a steady, unhurried beat while the overlay is visible.
  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 3800);
    return () => window.clearInterval(id);
  }, [status]);

  if (status === "idle") return null;

  const Shape = SHAPES[tick % SHAPES.length];
  const pun = PUNS[tick % PUNS.length];
  const pct = Math.min(100, Math.round(progress));

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      {/* Scoped keyframes for the shapeshift + ambient glow. */}
      <style>{`
        @keyframes rp-morph {
          0%   { opacity: 0; transform: scale(0.55) rotate(-28deg); }
          55%  { opacity: 1; }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes rp-halo {
          0%, 100% { transform: scale(1);   opacity: 0.35; }
          50%      { transform: scale(1.25); opacity: 0.6; }
        }
      `}</style>

      {error ? (
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Analysis failed</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">{error}</p>
          </div>
          <button
            onClick={dismiss}
            className="mt-1 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            data-testid="button-dismiss-analysis"
          >
            Dismiss
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 px-6 text-center">
          {/* Shapeshifting emblem */}
          <div className="relative flex items-center justify-center w-24 h-24">
            <span
              className="absolute inset-0 rounded-3xl bg-emerald-500/15"
              style={{ animation: "rp-halo 2.2s ease-in-out infinite" }}
            />
            <div className="relative flex items-center justify-center w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/20">
              <Shape
                key={tick}
                className="w-9 h-9 text-emerald-400"
                style={{ animation: "rp-morph 0.6s ease-out" }}
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">
              Analyzing <span className="text-emerald-400">{repoName || "repository"}</span>
            </p>
            <p key={tick} className="mt-1.5 text-xs text-muted-foreground" style={{ animation: "rp-morph 0.5s ease-out" }}>
              {pun}
            </p>
          </div>

          <p className="text-[11px] font-mono text-muted-foreground/70 tabular-nums">{pct}%</p>
        </div>
      )}

      {/* Progress bar pinned to the bottom of the screen */}
      {!error && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500/10 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%`, boxShadow: "0 0 12px rgba(16,185,129,0.7)" }}
          />
        </div>
      )}
    </div>
  );
}
