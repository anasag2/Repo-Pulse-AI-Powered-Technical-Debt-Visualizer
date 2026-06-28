import { useState, useMemo, Component } from "react";
import { useParams } from "wouter";
import {
  useGetRepository,
  getGetRepositoryQueryKey,
  useListFiles,
  getListFilesQueryKey,
  useGetFile,
  getGetFileQueryKey,
  useListCommits,
  useGetDashboardSummary,
  useListRepositories,
} from "@workspace/api-client-react";
import type { FileNode, Commit } from "@workspace/api-client-react";
import type { ColorMode } from "@/components/CityCanvas";
import CouplingGraph from "@/components/CouplingGraph";
import ChatDrawer from "@/components/ChatDrawer";
import { motion, AnimatePresence } from "framer-motion";
import { isCodeFile } from "@/lib/file-classify";
import { cn } from "@/lib/utils";
import { ease } from "@/lib/motion";
import {
  X, Star, GitCommit, FileText, TestTube, ArrowLeft, RefreshCw,
  AlertTriangle, Box, Folder, Search, HelpCircle, Bell, Clock,
  ChevronDown, ChevronRight, Gauge, ExternalLink, Sparkles,
  FileCode2, MessageSquare, Shield, Users, Activity, TrendingUp,
  GitBranch, Database,
} from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

// ─── Color helpers ────────────────────────────────────────────────────────────

function riskToHex(score: number): string {
  if (score < 0.3) return "#22c55e";
  if (score < 0.5) return "#eab308";
  if (score < 0.7) return "#f97316";
  return "#ef4444";
}

type ExtMetrics = {
  hotspotScore: number;
  bugCommits: number;
  ageDays: number;
  todoMarkers: number;
  functionCount: number;
};
function ext(file: FileNode): Partial<ExtMetrics> {
  return file as FileNode & Partial<ExtMetrics>;
}

function metricHex(file: FileNode, mode: ColorMode): string {
  switch (mode) {
    case "hotspot": return riskToHex(Math.min(1, ext(file).hotspotScore ?? 0));
    case "churn": return riskToHex(Math.min(1, file.churnCommits / 100));
    case "complexity": return riskToHex(Math.min(1, file.complexity / 30));
    case "coverage": return riskToHex(1 - file.testCoverage / 100);
    case "risk":
    default: return riskToHex(file.riskScore);
  }
}

function blobUrl(repoUrl: string, path: string): string {
  const base = repoUrl.replace(/\/$/, "").replace(/^(?!https?:\/\/)/, "https://").replace(/\.git$/, "");
  return `${base}/blob/HEAD/${path}`;
}

const COLOR_BY_OPTIONS: { value: ColorMode; label: string }[] = [
  { value: "risk", label: "Risk Score" },
  { value: "hotspot", label: "Hotspot" },
  { value: "churn", label: "Churn" },
  { value: "complexity", label: "Complexity" },
  { value: "coverage", label: "Test Coverage" },
];

function riskLabel(score: number) {
  if (score < 0.3) return "Low Risk";
  if (score < 0.5) return "Medium Risk";
  if (score < 0.7) return "High-Med Risk";
  return "High Risk";
}

function riskBadge(score: number) {
  if (score < 0.3) return "bg-green-400/15 text-green-400 border-green-400/25";
  if (score < 0.5) return "bg-yellow-400/15 text-yellow-400 border-yellow-400/25";
  if (score < 0.7) return "bg-orange-400/15 text-orange-400 border-orange-400/25";
  return "bg-red-400/15 text-red-400 border-red-400/25";
}

function scoreColor(v: number): string {
  if (v >= 80) return "text-green-400";
  if (v >= 60) return "text-yellow-400";
  if (v >= 40) return "text-orange-400";
  return "text-red-400";
}

function scoreHex(v: number): string {
  if (v >= 80) return "#22c55e";
  if (v >= 60) return "#eab308";
  if (v >= 40) return "#f97316";
  return "#ef4444";
}

// ─── Analytics computations (from real data only) ────────────────────────────

interface RepoScores {
  reputation: number;
  activity: number;
  security: number;
  community: number;
  coverage: number;
  reliability: number;
  trust: number;
  health: number;
}

function computeScores(
  repo: { avgRiskScore: number; testCoverage: number; riskyFilesPercent: number; authors: number },
  files: FileNode[],
  colorBy: ColorMode = "risk"
): RepoScores {
  const fileOnly = files.filter(f => !f.isDirectory);
  const n = fileOnly.length || 1;

  const avgChurn = fileOnly.reduce((a, b) => a + b.churnCommits, 0) / n;
  const totalBugCommits = fileOnly.reduce((a, b) => a + (ext(b).bugCommits ?? 0), 0);
  const totalChurn = fileOnly.reduce((a, b) => a + b.churnCommits, 0);

  // Activity: log-scale of average commits per file (real git history)
  const activity = Math.min(100, Math.round(Math.log2(avgChurn + 1) * 20));

  // Security: weighted by the active Color-by metric — same normalization as the 3D city
  const metricScore = (f: FileNode): number => {
    switch (colorBy) {
      case "churn":      return Math.min(1, f.churnCommits / 100);
      case "complexity": return Math.min(1, f.complexity / 30);
      case "coverage":   return 1 - f.testCoverage / 100;
      default:           return f.riskScore;
    }
  };
  const criticalCount = fileOnly.filter(f => metricScore(f) > 0.8).length;
  const highCount     = fileOnly.filter(f => metricScore(f) > 0.6 && metricScore(f) <= 0.8).length;
  const mediumCount   = fileOnly.filter(f => metricScore(f) > 0.4 && metricScore(f) <= 0.6).length;
  const weightedRisk  = (criticalCount * 4 + highCount * 3 + mediumCount * 1) / (n * 4);
  const security = Math.max(0, Math.round((1 - weightedRisk) * 100));

  // Community: log-scale of real unique author count (backend-computed)
  const community = Math.min(100, Math.round(Math.log10(repo.authors + 1) * 50));

  // Coverage: direct backend-computed value
  const coverage = repo.testCoverage;

  // Reliability: bug-fix commit ratio from real commit messages
  const reliability = totalChurn > 0
    ? Math.min(100, Math.max(0, Math.round(100 - (totalBugCommits / totalChurn) * 200)))
    : 80;

  const reputation = Math.min(100, Math.round(
    activity * 0.15 +
    security * 0.25 +
    community * 0.20 +
    coverage * 0.20 +
    reliability * 0.20
  ));

  const trust = Math.min(100, Math.round(coverage * 0.55 + security * 0.45));
  const health = Math.min(100, Math.round((reputation + trust + security) / 3));

  return { reputation, activity, security, community, coverage, reliability, trust, health };
}

interface BusFactorResult {
  busFactor: number;
  topAuthorPct: number;
  topAuthor: string;
  uniqueAuthors: number;
}

function computeBusFactor(commits: Commit[]): BusFactorResult {
  if (!commits.length) return { busFactor: 1, topAuthorPct: 100, topAuthor: "unknown", uniqueAuthors: 1 };

  const counts: Record<string, number> = {};
  for (const c of commits) {
    counts[c.author] = (counts[c.author] ?? 0) + 1;
  }

  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  const total = commits.length;
  const topAuthorPct = Math.round((sorted[0][1] / total) * 100);

  // Bus factor = min # of authors to cover ≥50% of commits
  let sum = 0;
  let bf = 0;
  for (const [, count] of sorted) {
    sum += count;
    bf++;
    if (sum >= total * 0.5) break;
  }

  return {
    busFactor: bf,
    topAuthorPct,
    topAuthor: sorted[0][0],
    uniqueAuthors: sorted.length,
  };
}

interface RiskDist {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

function computeRiskDist(files: FileNode[], colorBy: ColorMode = "risk"): RiskDist {
  const fo = files.filter(f => !f.isDirectory);
  const score = (f: FileNode): number => {
    switch (colorBy) {
      case "churn":      return Math.min(1, f.churnCommits / 100);
      case "complexity": return Math.min(1, f.complexity / 30);
      case "coverage":   return 1 - f.testCoverage / 100;
      default:           return f.riskScore;
    }
  };
  return {
    critical: fo.filter(f => score(f) > 0.8).length,
    high:     fo.filter(f => score(f) > 0.6 && score(f) <= 0.8).length,
    medium:   fo.filter(f => score(f) > 0.4 && score(f) <= 0.6).length,
    low:      fo.filter(f => score(f) <= 0.4).length,
  };
}

// ─── WebGL Error Boundary ─────────────────────────────────────────────────────

interface EBState { hasError: boolean }
class WebGLErrorBoundary extends Component<{ children: React.ReactNode; fallback: React.ReactNode }, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
  } catch { return false; }
}

// ─── 3D City (lazy) ──────────────────────────────────────────────────────────

type ViewMode = "3d" | "2d" | "coupling";

function CityScene3D({ files, onFileClick, selectedId, mode, colorBy }: {
  files: FileNode[];
  onFileClick: (f: FileNode) => void;
  selectedId: number | null;
  mode: "3d" | "2d";
  colorBy: ColorMode;
}) {
  const webglAvailable = useMemo(() => hasWebGL(), []);
  const [Loaded, setLoaded] = useState<React.ComponentType<{
    files: FileNode[];
    onFileClick: (f: FileNode) => void;
    selectedId: number | null;
    colorBy?: ColorMode;
  }> | null>(null);
  const [loadError, setLoadError] = useState(false);

  useMemo(() => {
    if (!webglAvailable) return;
    import("@/components/CityCanvas")
      .then((m) => setLoaded(() => m.default))
      .catch(() => setLoadError(true));
  }, [webglAvailable]);

  if (mode === "2d" || !webglAvailable || loadError) {
    return <City2DFallback files={files} onFileClick={onFileClick} selectedId={selectedId} colorBy={colorBy} />;
  }
  if (!Loaded) return (
    <div className="flex h-full items-center justify-center bg-[#060a14]">
      <RefreshCw className="w-5 h-5 text-primary animate-spin" />
    </div>
  );
  return (
    <WebGLErrorBoundary fallback={<City2DFallback files={files} onFileClick={onFileClick} selectedId={selectedId} colorBy={colorBy} />}>
      <Loaded files={files} onFileClick={onFileClick} selectedId={selectedId} colorBy={colorBy} />
    </WebGLErrorBoundary>
  );
}

// ─── 2D Treemap fallback ──────────────────────────────────────────────────────

function City2DFallback({ files, onFileClick, selectedId, colorBy }: {
  files: FileNode[];
  onFileClick: (f: FileNode) => void;
  selectedId: number | null;
  colorBy: ColorMode;
}) {
  const byDir = useMemo(() => {
    const map: Record<string, FileNode[]> = {};
    for (const f of files) {
      if (!f.isDirectory) {
        const dir = f.parentPath || "root";
        if (!map[dir]) map[dir] = [];
        map[dir].push(f);
      }
    }
    return Object.entries(map);
  }, [files]);

  return (
    <div className="h-full overflow-auto p-4 bg-[#060a14]">
      <div className="text-[10px] text-muted-foreground mb-3 flex items-center gap-1.5">
        <Box className="w-3 h-3" />
        File map view — hover files to explore, click to inspect
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        {byDir.map(([dir, dirFiles]) => {
          const avgRisk = dirFiles.reduce((a, b) => a + b.riskScore, 0) / dirFiles.length;
          return (
            <div key={dir} className="border rounded-md overflow-hidden" style={{ borderColor: riskToHex(avgRisk) + "40" }}>
              <div className="px-2 py-1.5 text-[10px] font-bold flex items-center justify-between"
                style={{ backgroundColor: riskToHex(avgRisk) + "15", color: riskToHex(avgRisk) }}>
                <span>{dir}</span>
                <span className="opacity-70">{dirFiles.length} files</span>
              </div>
              <div className="p-1.5 grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(28px, 1fr))" }}>
                {dirFiles.map((file) => {
                  const h = Math.max(20, Math.min(60, (file.churnCommits / 100) * 60));
                  return (
                    <div
                      key={file.id}
                      title={`${file.name}\nRisk: ${file.riskScore}\nLines: ${file.linesOfCode}\nChurn: ${file.churnCommits}`}
                      onClick={() => onFileClick(file)}
                      className={cn(
                        "cursor-pointer rounded-sm transition-all hover:opacity-90 hover:scale-110",
                        selectedId === file.id && "ring-2 ring-white/40"
                      )}
                      style={{ backgroundColor: metricHex(file, colorBy), height: `${h}px`, opacity: 0.7 + file.riskScore * 0.3 }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Small metric card ────────────────────────────────────────────────────────

function MetricCard({ label, value, color, spark }: {
  label: string;
  value: string | number;
  color?: string;
  spark?: React.ReactNode;
}) {
  return (
    <div className="bg-background/60 border border-border rounded-md p-3">
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        {spark}
      </div>
      <div className={cn("text-xl font-bold", color ?? "text-foreground")}>{value}</div>
    </div>
  );
}

// ─── Deterministic sparkline (visual only — no real time-series in API) ───────

function Sparkline({ seed, color }: { seed: number; color: string }) {
  const w = 52, h = 16;
  const pts = useMemo(() => {
    let s = (seed % 2147483647) || 1;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    return Array.from({ length: 12 }, () => 0.15 + rnd() * 0.7);
  }, [seed]);
  const path = pts.map((v, i) => `${((i / (pts.length - 1)) * w).toFixed(1)},${(h - v * h).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="shrink-0">
      <polyline points={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
    </svg>
  );
}

// ─── AI File insight ──────────────────────────────────────────────────────────

interface AiInsight {
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

function AiInsightCard({ repoId, fileId }: { repoId: number; fileId: number }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [insight, setInsight] = useState<AiInsight | null>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setState("loading");
    setError("");
    try {
      const res = await fetch(`/api/repositories/${repoId}/files/${fileId}/ai-insight`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      setInsight(await res.json());
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setState("error");
    }
  }

  return (
    <div className="mb-3 border border-emerald-500/25 bg-emerald-500/[0.04] rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-emerald-400" /> AI Debt Analysis
        </h4>
        {state !== "loading" && (
          <button onClick={run} className="text-[10px] font-semibold text-emerald-400 hover:underline">
            {state === "done" || state === "error" ? "Re-analyze" : "Analyze with Claude"}
          </button>
        )}
      </div>
      {state === "idle" && (
        <p className="text-[10px] text-muted-foreground">
          Run Claude over this file's source and metrics for a debt assessment and refactor plan.
        </p>
      )}
      {state === "loading" && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-1">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> Claude is analyzing…
        </div>
      )}
      {state === "error" && <p className="text-[10px] text-red-400">{error}</p>}
      {state === "done" && insight && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full border uppercase", SEVERITY_STYLE[insight.severity])}>
              {insight.severity} severity
            </span>
            <span className="text-[9px] text-muted-foreground">Effort: {insight.estimatedEffort}</span>
          </div>
          <p className="text-[11px] text-foreground leading-relaxed">{insight.summary}</p>
          {insight.debtDrivers.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">Debt drivers</div>
              <div className="flex flex-wrap gap-1">
                {insight.debtDrivers.map((d, i) => (
                  <span key={i} className="text-[10px] bg-muted/60 border border-border rounded px-1.5 py-0.5 text-foreground">{d}</span>
                ))}
              </div>
            </div>
          )}
          {insight.refactorSteps.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">Refactor plan</div>
              <ol className="space-y-1">
                {insight.refactorSteps.map((s, i) => (
                  <li key={i} className="text-[11px] text-foreground flex gap-1.5">
                    <span className="text-emerald-400 font-bold shrink-0">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── File detail panel ────────────────────────────────────────────────────────

function FilePanel({ repoId, fileId, repoUrl, onClose }: {
  repoId: number;
  fileId: number;
  repoUrl: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "history" | "code" | "contributors">("overview");
  const { data: file, isLoading } = useGetFile(repoId, fileId, {
    query: { queryKey: getGetFileQueryKey(repoId, fileId) },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-full p-8">
      <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
    </div>
  );
  if (!file) return null;

  const parts = file.path.split("/");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1 flex-wrap">
              {parts.map((part, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="opacity-40">/</span>}
                  <span className={i === parts.length - 1 ? "text-foreground" : ""}>{part}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground truncate">{file.name}</h3>
              <Star className="w-3 h-3 text-muted-foreground shrink-0" />
            </div>
            <div className={cn("mt-1 inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full border", riskBadge(file.riskScore))}>
              {riskLabel(file.riskScore)}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-3 mt-2.5">
          {(["overview", "history", "code", "contributors"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("text-[11px] pb-1.5 border-b-2 transition-colors capitalize",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <MetricCard
                label="Risk Score"
                value={file.riskScore}
                color={file.riskScore < 0.3 ? "text-green-400" : file.riskScore < 0.5 ? "text-yellow-400" : file.riskScore < 0.7 ? "text-orange-400" : "text-red-400"}
                spark={<Sparkline seed={file.id * 7 + 1} color={riskToHex(file.riskScore)} />}
              />
              <MetricCard
                label="Hotspot"
                value={(ext(file).hotspotScore ?? 0).toFixed(2)}
                color={(ext(file).hotspotScore ?? 0) < 0.3 ? "text-green-400" : (ext(file).hotspotScore ?? 0) < 0.6 ? "text-orange-400" : "text-red-400"}
                spark={<Sparkline seed={file.id * 5 + 3} color={riskToHex(ext(file).hotspotScore ?? 0)} />}
              />
              <MetricCard label="Churn (Commits)" value={file.churnCommits} spark={<Sparkline seed={file.id * 13 + 5} color="#60a5fa" />} />
              <MetricCard
                label="Bug-Fix Commits"
                value={ext(file).bugCommits ?? 0}
                color={(ext(file).bugCommits ?? 0) > 5 ? "text-red-400" : (ext(file).bugCommits ?? 0) > 0 ? "text-orange-400" : undefined}
              />
              <MetricCard label="Lines of Code" value={file.linesOfCode.toLocaleString()} />
              <MetricCard label="Cyclomatic Cplx" value={file.complexity} />
              <MetricCard label="Functions" value={ext(file).functionCount ?? 0} />
              <MetricCard
                label="Test Coverage"
                value={`${file.testCoverage}%`}
                color={file.testCoverage >= 60 ? "text-green-400" : file.testCoverage >= 40 ? "text-yellow-400" : "text-red-400"}
              />
              <MetricCard label="Authors" value={file.authors} />
              <MetricCard label="TODO/FIXME" value={ext(file).todoMarkers ?? 0} color={(ext(file).todoMarkers ?? 0) > 0 ? "text-yellow-400" : undefined} />
            </div>
            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Test Coverage</span><span>{file.testCoverage}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div className={cn("h-1.5 rounded-full", file.testCoverage >= 60 ? "bg-green-400" : file.testCoverage >= 40 ? "bg-yellow-400" : "bg-red-400")}
                  style={{ width: `${file.testCoverage}%` }} />
              </div>
            </div>
            <AiInsightCard repoId={repoId} fileId={fileId} />
            {file.riskFactors && file.riskFactors.length > 0 && (
              <div className="mb-3">
                <h4 className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-orange-400" /> Risk Factors
                </h4>
                <div className="space-y-1.5">
                  {file.riskFactors.map((rf) => (
                    <div key={rf.name} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: riskToHex(Math.min(1, rf.score * 3)) }} />
                      <span className="text-[11px] text-foreground flex-1">{rf.name}</span>
                      <div className="w-16 bg-muted rounded-full h-1">
                        <div className="h-1 rounded-full" style={{ width: `${Math.min(100, rf.score * 300)}%`, backgroundColor: riskToHex(Math.min(1, rf.score * 3)) }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-8 text-right">{rf.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {file.recentCommits && file.recentCommits.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                    <GitCommit className="w-3 h-3 text-blue-400" /> Recent Commits
                  </h4>
                  <button onClick={() => setTab("history")} className="text-[10px] text-emerald-400 hover:underline">View all</button>
                </div>
                <div className="space-y-2">
                  {file.recentCommits.map((commit) => (
                    <div key={commit.id} className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary shrink-0 mt-0.5">
                        {commit.authorInitials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-foreground truncate">{commit.message}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] text-muted-foreground">{commit.author}</span>
                          <span className="text-[9px] text-muted-foreground">{commit.timeAgo}</span>
                          <span className="text-[9px] font-mono text-blue-400">{commit.hash}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {tab === "history" && (
          file.recentCommits && file.recentCommits.length > 0 ? (
            <div className="relative pl-3">
              <div className="absolute left-[3px] top-1 bottom-1 w-px bg-border" />
              <div className="space-y-3">
                {file.recentCommits.map((commit) => (
                  <div key={commit.id} className="relative">
                    <div className="absolute -left-[10px] top-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <p className="text-[11px] text-foreground">{commit.message}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-muted-foreground">{commit.author}</span>
                      <span className="text-[9px] text-muted-foreground">{commit.timeAgo}</span>
                      <span className="text-[9px] font-mono text-blue-400">{commit.hash}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <GitCommit className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-xs text-muted-foreground">No commit history</p>
            </div>
          )
        )}
        {tab === "code" && (
          <div className="text-center py-8">
            <FileText className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-xs text-muted-foreground mb-1">Source preview not loaded</p>
            <p className="text-[10px] text-muted-foreground/70 mb-4 font-mono break-all px-4">{file.path}</p>
            <a href={blobUrl(repoUrl, file.path)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:underline">
              Open on GitHub <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
        {tab === "contributors" && (
          <div className="space-y-2">
            {Array.from({ length: Math.min(file.authors, 8) }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-background/40 rounded-md">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">
                  {String.fromCharCode(65 + i)}
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Contributor {i + 1}</p>
                  <p className="text-[10px] text-muted-foreground">{Math.floor(10 + i * 7)} commits</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 border-t border-border shrink-0">
        <a href={blobUrl(repoUrl, file.path)} target="_blank" rel="noreferrer"
          className="w-full flex items-center justify-center gap-1.5 h-9 rounded-md bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-400 transition-colors">
          View File in Repository <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}

// ─── Bottom stat chip ─────────────────────────────────────────────────────────

function StatChip({ icon: Icon, tint, label, value, valueClass }: {
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-7 h-7 rounded-md flex items-center justify-center shrink-0", tint)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="leading-tight">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={cn("text-[13px] font-bold", valueClass ?? "text-foreground")}>{value}</div>
      </div>
    </div>
  );
}

// ─── Gauge ring SVG ───────────────────────────────────────────────────────────

function GaugeRing({ value, size = 56, stroke = 5 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ * (1 - value / 100);
  const hex = scoreHex(value);
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/30" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={hex} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        className="text-[11px] font-bold" style={{ fill: hex, fontSize: 11, fontWeight: 700 }}>
        {value}
      </text>
    </svg>
  );
}

// ─── Left analytics panel ─────────────────────────────────────────────────────

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex-1 bg-muted/40 rounded-full h-1">
        <div className="h-1 rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: scoreHex(value) }} />
      </div>
      <span className={cn("text-[10px] font-semibold w-10 text-right", scoreColor(value))}>{value}/100</span>
    </div>
  );
}

function LeftPanel({
  repoId,
  repos,
  currentRepo,
  scores,
  busFactor,
}: {
  repoId: number;
  repos: ReturnType<typeof useListRepositories>["data"];
  currentRepo: ReturnType<typeof useGetRepository>["data"];
  scores: RepoScores | null;
  busFactor: BusFactorResult | null;
}) {
  const repoList = repos ? [...repos].reverse().slice(0, 8) : [];

  return (
    <div className="w-56 shrink-0 border-r border-border bg-card flex flex-col overflow-y-auto">
      {/* Repositories list */}
      <div className="px-3 pt-3 pb-1 border-b border-border/60">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Database className="w-3 h-3" /> Repositories
        </div>
        <div className="space-y-1">
          {repoList.map((r) => (
            <Link key={r.id} href={`/repositories/${r.id}`}>
              <div className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                r.id === repoId ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/40"
              )}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: riskToHex(r.avgRiskScore) }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-foreground truncate">{r.name}</div>
                  <div className="text-[9px] text-muted-foreground">{r.totalFiles} files</div>
                </div>
                <div className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
                  r.avgRiskScore < 0.3 ? "bg-green-400/10 text-green-400 border-green-400/20" : "bg-orange-400/10 text-orange-400 border-orange-400/20"
                )}>
                  {r.avgRiskScore < 0.3 ? "Low Risk" : r.avgRiskScore < 0.6 ? "Med Risk" : "High Risk"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Repository Reputation */}
      {scores && currentRepo && (
        <div className="px-3 py-3 border-b border-border/60">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Star className="w-3 h-3 text-yellow-400" /> Repository Reputation
          </div>
          <div className="flex items-center gap-3 mb-3">
            <GaugeRing value={scores.reputation} />
            <div>
              <div className={cn("text-lg font-bold", scoreColor(scores.reputation))}>
                {scores.reputation >= 80 ? "Great" : scores.reputation >= 60 ? "Good" : scores.reputation >= 40 ? "Fair" : "Poor"}
              </div>
              <div className="text-[10px] text-muted-foreground">{scores.reputation}/100</div>
            </div>
          </div>
          <div className="space-y-2">
            <ScoreBar label="Activity" value={scores.activity} />
            <ScoreBar label="Security" value={scores.security} />
            <ScoreBar label="Community" value={scores.community} />
            <ScoreBar label="Coverage" value={scores.coverage} />
            <ScoreBar label="Reliability" value={scores.reliability} />
          </div>
        </div>
      )}

      {/* Bus Factor */}
      {busFactor && (
        <div className="px-3 py-3">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Users className="w-3 h-3 text-orange-400" /> Bus Factor
          </div>
          <div className="flex items-center gap-3">
            <GaugeRing value={Math.min(100, busFactor.busFactor * 20)} size={48} stroke={5} />
            <div>
              <div className={cn("text-2xl font-bold", busFactor.busFactor <= 2 ? "text-orange-400" : "text-green-400")}>
                {busFactor.busFactor}
              </div>
              <div className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold inline-block",
                busFactor.busFactor <= 2 ? "text-orange-400 bg-orange-400/10" : "text-green-400 bg-green-400/10"
              )}>
                {busFactor.busFactor <= 2 ? "At Risk" : "Healthy"}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            {busFactor.topAuthorPct}% of commits from {busFactor.uniqueAuthors === 1 ? "1 developer" : `top ${busFactor.busFactor} of ${busFactor.uniqueAuthors}`}
          </p>
          {busFactor.topAuthorPct > 60 && (
            <p className="text-[10px] text-orange-400 mt-1">High dependency on a few contributors</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Right panel: security overview by risk level ─────────────────────────────

function SecurityPanel({
  files,
  scores,
  colorBy,
}: {
  files: FileNode[];
  scores: RepoScores | null;
  colorBy: ColorMode;
}) {
  const dist = useMemo(() => computeRiskDist(files, colorBy), [files, colorBy]);
  const total = dist.critical + dist.high + dist.medium + dist.low;

  const LEVELS = [
    { key: "critical" as const, label: "Critical", color: "#ef4444", bg: "bg-red-400/10", border: "border-red-400/20", icon: "●" },
    { key: "high" as const, label: "High", color: "#f97316", bg: "bg-orange-400/10", border: "border-orange-400/20", icon: "●" },
    { key: "medium" as const, label: "Medium", color: "#eab308", bg: "bg-yellow-400/10", border: "border-yellow-400/20", icon: "●" },
    { key: "low" as const, label: "Low", color: "#22c55e", bg: "bg-green-400/10", border: "border-green-400/20", icon: "●" },
  ];

  return (
    <div className="w-52 shrink-0 border-l border-border bg-card flex flex-col overflow-y-auto">
      {/* Key scores */}
      {scores && (
        <div className="px-3 pt-3 pb-2 border-b border-border/60">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-blue-400" /> Key Scores
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Trust", value: scores.trust },
              { label: "Security", value: scores.security },
              { label: "Health", value: scores.health },
              { label: "Coverage", value: scores.coverage },
            ].map(({ label, value }) => (
              <div key={label} className="bg-background/50 border border-border rounded-md p-2 text-center">
                <div className={cn("text-base font-bold", scoreColor(value))}>{value}</div>
                <div className="text-[9px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security overview by risk level */}
      <div className="px-3 pt-3 pb-2 border-b border-border/60">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Shield className="w-3 h-3 text-blue-400" /> Security Overview
        </div>
        <p className="text-[9px] text-muted-foreground mb-2">
          {colorBy === "churn" ? "Files by churn level" : colorBy === "complexity" ? "Files by complexity" : colorBy === "coverage" ? "Files by coverage" : "Files by risk level"}
        </p>
        <div className="space-y-2">
          {LEVELS.map(({ key, label, color, bg, border }) => (
            <div key={key} className={cn("flex items-center gap-2 px-2 py-1.5 rounded-md border", bg, border)}>
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                style={{ backgroundColor: color }}>
                {dist[key]}
              </span>
              <span className="text-[11px] text-foreground flex-1">{label}</span>
              {total > 0 && (
                <div className="w-10 bg-muted/40 rounded-full h-1">
                  <div className="h-1 rounded-full" style={{ width: `${Math.round(dist[key] / total * 100)}%`, backgroundColor: color }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Top files by risk */}
      {files.filter(f => !f.isDirectory).length > 0 && (
        <div className="px-3 py-3">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-orange-400" /> Riskiest Files
          </div>
          <div className="space-y-1.5">
            {files
              .filter(f => !f.isDirectory)
              .sort((a, b) => b.riskScore - a.riskScore)
              .slice(0, 5)
              .map((f) => (
                <div key={f.id} className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: riskToHex(f.riskScore) }} />
                  <span className="text-[10px] text-foreground truncate flex-1">{f.name}</span>
                  <span className="text-[10px] font-mono shrink-0" style={{ color: riskToHex(f.riskScore) }}>
                    {f.riskScore}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bottom analytics row ─────────────────────────────────────────────────────

function BottomPanel({
  files,
  repos,
  repoId,
  scores,
}: {
  files: FileNode[];
  repos: ReturnType<typeof useListRepositories>["data"];
  repoId: number;
  scores: RepoScores | null;
}) {
  const topRisky = useMemo(
    () => files.filter(f => !f.isDirectory).sort((a, b) => b.riskScore - a.riskScore).slice(0, 5),
    [files]
  );

  const repoList = repos ?? [];

  const churnLevel = (churn: number) => {
    if (churn > 50) return { label: "High", cls: "text-red-400" };
    if (churn > 20) return { label: "Medium", cls: "text-yellow-400" };
    return { label: "Low", cls: "text-green-400" };
  };

  const computeRepoReputation = (r: typeof repoList[number]) => {
    const s = Math.min(100, Math.round(
      (1 - r.avgRiskScore) * 40 + (r.testCoverage / 100) * 30 + Math.min(30, r.authors * 5)
    ));
    return s;
  };

  return (
    <div className="shrink-0 border-t border-border bg-card flex divide-x divide-border overflow-hidden" style={{ height: 200 }}>
      {/* Top Risky Files */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-border/60 flex items-center gap-1.5 shrink-0">
          <AlertTriangle className="w-3 h-3 text-orange-400" />
          <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Top Risky Files</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[9px] text-muted-foreground uppercase tracking-wider border-b border-border/40">
                <th className="text-left px-3 py-1">File</th>
                <th className="text-right px-2 py-1">Risk</th>
                <th className="text-right px-2 py-1">Churn</th>
                <th className="text-right px-2 py-1">Cplx</th>
                <th className="text-right px-3 py-1">Cov</th>
              </tr>
            </thead>
            <tbody>
              {topRisky.map((f) => {
                const ch = churnLevel(f.churnCommits);
                return (
                  <tr key={f.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-1.5 text-[11px] text-foreground truncate max-w-[120px]">{f.name}</td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="text-[11px] font-mono font-semibold" style={{ color: riskToHex(f.riskScore) }}>
                        {f.riskScore}
                      </span>
                    </td>
                    <td className={cn("px-2 py-1.5 text-right text-[10px] font-medium", ch.cls)}>{ch.label}</td>
                    <td className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">{f.complexity}</td>
                    <td className={cn("px-3 py-1.5 text-right text-[10px] font-medium",
                      f.testCoverage >= 60 ? "text-green-400" : f.testCoverage >= 40 ? "text-yellow-400" : "text-red-400"
                    )}>{f.testCoverage}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Overview donut */}
      {scores && (
        <div className="w-44 shrink-0 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border/60 flex items-center gap-1.5 shrink-0">
            <Shield className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Security</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-2 p-2">
            <GaugeRing value={scores.security} size={64} stroke={6} />
            <div className="w-full space-y-1">
              {[
                { label: "Trust", value: scores.trust },
                { label: "Reliability", value: scores.reliability },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground flex-1">{label}</span>
                  <span className={cn("text-[9px] font-semibold", scoreColor(value))}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Predicted Risk */}
      {(() => {
        const predictRisk = (f: FileNode, months: number) => {
          const churnNorm = Math.min(1, f.churnCommits / 100);
          const velocity = churnNorm * f.riskScore * 0.04;
          return Math.min(1, f.riskScore + velocity * months);
        };
        const fo = files.filter(f => !f.isDirectory);
        const top5 = [...fo].sort((a, b) => predictRisk(b, 6) - predictRisk(a, 6)).slice(0, 5);
        const top3 = top5.slice(0, 3).map(f => ({ f, p6: predictRisk(f, 6) }));
        const chartData = Array.from({ length: 6 }, (_, i) => ({
          avg: top5.reduce((s, f) => s + predictRisk(f, i + 1), 0) / (top5.length || 1),
        }));
        const now = new Date();
        const MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const monthLabels = Array.from({ length: 6 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
          return `${MONTH[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
        });
        const W = 148, H = 88, pl = 26, pr = 6, pt = 8, pb = 18;
        const maxY = Math.max(...chartData.map(d => d.avg), 0.05) * 1.3;
        const tx = (i: number) => pl + (i / 5) * (W - pl - pr);
        const ty = (v: number) => H - pb - (v / maxY) * (H - pt - pb);
        const pts = chartData.map((d, i) => `${tx(i)},${ty(d.avg)}`).join(" ");
        const yTicks = [0, maxY * 0.5, maxY].map(v => ({ v, y: ty(v), label: v.toFixed(2) }));
        return fo.length > 0 ? (
          <div className="w-72 shrink-0 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border/60 flex items-center gap-1.5 shrink-0">
              <TrendingUp className="w-3 h-3 text-rose-400" />
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Predicted Risk (Next 6 Months)</span>
            </div>
            <div className="flex-1 flex overflow-hidden">
              {/* SVG chart */}
              <div className="flex-1 flex items-center justify-center p-1">
                <svg width={W} height={H}>
                  {/* Y gridlines + labels */}
                  {yTicks.map(({ v, y, label }) => (
                    <g key={v}>
                      <line x1={pl} y1={y} x2={W - pr} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                      <text x={pl - 3} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.35)" fontSize={7}>{label}</text>
                    </g>
                  ))}
                  {/* Area fill */}
                  <defs>
                    <linearGradient id="prg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon points={`${tx(0)},${H - pb} ${pts} ${tx(5)},${H - pb}`} fill="url(#prg)" />
                  {/* Line */}
                  <polyline points={pts} fill="none" stroke="#f43f5e" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
                  {/* Dots */}
                  {chartData.map((d, i) => (
                    <circle key={i} cx={tx(i)} cy={ty(d.avg)} r={2.5} fill="#f43f5e" />
                  ))}
                  {/* X labels — first and last only */}
                  {[0, 5].map(i => (
                    <text key={i} x={tx(i)} y={H - 3} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={6.5}>{monthLabels[i]}</text>
                  ))}
                </svg>
              </div>
              {/* Hotspot list */}
              <div className="w-28 shrink-0 border-l border-border/40 flex flex-col justify-center px-2.5 py-2 gap-1">
                <span className="text-[8px] text-muted-foreground uppercase tracking-wider mb-1">Predicted Hotspots</span>
                {top3.map(({ f, p6 }) => (
                  <div key={f.id} className="flex items-center justify-between gap-1">
                    <span className="text-[9px] text-foreground/80 truncate flex-1">{f.name}</span>
                    <span className="text-[9px] font-semibold text-rose-400 shrink-0">{p6.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {/* Repository Comparison */}
      {repoList.length > 1 && (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border/60 flex items-center gap-1.5 shrink-0">
            <TrendingUp className="w-3 h-3 text-violet-400" />
            <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Repository Comparison</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[9px] text-muted-foreground uppercase tracking-wider border-b border-border/40">
                  <th className="text-left px-3 py-1">Repository</th>
                  <th className="text-right px-2 py-1">Rep.</th>
                  <th className="text-right px-2 py-1">Cov</th>
                  <th className="text-right px-2 py-1">Sec</th>
                  <th className="text-right px-3 py-1">Authors</th>
                </tr>
              </thead>
              <tbody>
                {[...repoList].reverse().slice(0, 5).map((r) => {
                  const rep = computeRepoReputation(r);
                  const sec = Math.max(0, Math.round((1 - r.riskyFilesPercent / 100) * 100));
                  const isCurrent = r.id === repoId;
                  return (
                    <tr key={r.id} className={cn("border-b border-border/20 hover:bg-muted/20 transition-colors", isCurrent && "bg-primary/5")}>
                      <td className="px-3 py-1.5">
                        <span className="text-[11px] text-foreground truncate block max-w-[100px]">{r.name}</span>
                        {isCurrent && <span className="text-[9px] text-primary">Current</span>}
                      </td>
                      <td className={cn("px-2 py-1.5 text-right text-[10px] font-semibold", scoreColor(rep))}>{rep}</td>
                      <td className={cn("px-2 py-1.5 text-right text-[10px] font-semibold",
                        r.testCoverage >= 60 ? "text-green-400" : r.testCoverage >= 40 ? "text-yellow-400" : "text-red-400"
                      )}>{r.testCoverage}%</td>
                      <td className={cn("px-2 py-1.5 text-right text-[10px] font-semibold", scoreColor(sec))}>{sec}</td>
                      <td className="px-3 py-1.5 text-right text-[10px] text-muted-foreground">{r.authors}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main RepositoryView ──────────────────────────────────────────────────────

export default function RepositoryView() {
  const { id } = useParams<{ id: string }>();
  const repoId = parseInt(id ?? "0");
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [colorBy, setColorBy] = useState<ColorMode>("risk");
  const [search, setSearch] = useState("");
  const [codeOnly, setCodeOnly] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: repo, isLoading: repoLoading } = useGetRepository(repoId, {
    query: { queryKey: getGetRepositoryQueryKey(repoId) },
  });
  const { data: files, isLoading: filesLoading } = useListFiles(repoId, {
    query: { queryKey: getListFilesQueryKey(repoId) },
  });
  const { data: commits } = useListCommits(repoId);
  const { data: summary } = useGetDashboardSummary();
  const { data: repos } = useListRepositories();

  const visibleFiles = useMemo(
    () => (codeOnly && files ? files.filter((f) => f.isDirectory || isCodeFile(f)) : files),
    [files, codeOnly],
  );
  const shownCount = useMemo(
    () => visibleFiles?.filter((f) => !f.isDirectory).length ?? 0,
    [visibleFiles],
  );
  const totalCount = useMemo(
    () => files?.filter((f) => !f.isDirectory).length ?? 0,
    [files],
  );

  // Computed analytics from real data
  const scores = useMemo(
    () => repo && visibleFiles ? computeScores(repo, visibleFiles, colorBy) : null,
    [repo, visibleFiles, colorBy],
  );

  const busFactor = useMemo(
    () => commits ? computeBusFactor(commits) : null,
    [commits],
  );

  const runSearch = () => {
    const q = search.trim().toLowerCase();
    if (!q || !files) return;
    const hit = files.find((f) => !f.isDirectory && (f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)));
    if (hit) setSelectedFile(hit);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetRepositoryQueryKey(repoId) });
    queryClient.invalidateQueries({ queryKey: getListFilesQueryKey(repoId) });
  };

  if (repoLoading || filesLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-7 h-7 text-primary animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading visualization...</p>
        </div>
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Repository not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Top bar row 1: identity ─────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-2.5 px-4 h-11">
          <Link href="/repositories">
            <button className="text-muted-foreground hover:text-foreground p-1 transition-colors" title="Back">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
          <h1 className="text-sm font-bold text-foreground truncate">{repo.name}</h1>
          {repo.isPublic && (
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-400/10 text-blue-400 border border-blue-400/20 rounded-full shrink-0">Public</span>
          )}
          <span className="text-xs text-muted-foreground hidden md:block truncate">{repo.url}</span>

          <div className="ml-auto flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>Last analyzed {repo.lastAnalyzed}</span>
            </div>
            <button onClick={refresh} title="Re-fetch" className="text-muted-foreground hover:text-foreground p-1 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setChatOpen((v) => !v)}
              title="Ask the repo assistant"
              className={cn(
                "flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors",
                chatOpen
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-emerald-500 text-white hover:bg-emerald-400",
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ask AI</span>
            </button>
            <div className="h-5 w-px bg-border" />
            <button title="Help" className="text-muted-foreground hover:text-foreground p-1 transition-colors">
              <HelpCircle className="w-4 h-4" />
            </button>
            <button title="Notifications" className="text-muted-foreground hover:text-foreground p-1 transition-colors">
              <Bell className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Top bar row 2: toolbar ───────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 h-10 border-t border-border/60">
          <div className="relative w-52 max-w-[35%]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
              type="search"
              placeholder="Search files..."
              className="w-full h-7 bg-muted/40 border border-border rounded-md pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <button
            onClick={() => setCodeOnly((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs transition-colors",
              codeOnly ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400" : "border-border bg-muted/40 text-foreground hover:bg-muted/70",
            )}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Code only</span>
          </button>

          <label className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-muted/40 text-xs">
            <span className="text-muted-foreground hidden lg:inline">View</span>
            <div className="relative flex items-center">
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as ViewMode)}
                className="appearance-none bg-transparent pr-4 text-foreground focus:outline-none cursor-pointer"
              >
                <option value="3d">3D City</option>
                <option value="2d">2D Map</option>
                <option value="coupling">Coupling</option>
              </select>
              <ChevronDown className="w-3 h-3 text-muted-foreground absolute right-0 pointer-events-none" />
            </div>
          </label>

          <label className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-muted/40 text-xs">
            <span className="text-muted-foreground hidden lg:inline">Color by</span>
            <div className="relative flex items-center">
              <select
                value={colorBy}
                onChange={(e) => setColorBy(e.target.value as ColorMode)}
                className="appearance-none bg-transparent pr-4 text-foreground focus:outline-none cursor-pointer"
              >
                {COLOR_BY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-muted-foreground absolute right-0 pointer-events-none" />
            </div>
          </label>

          {/* Legend */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <span className="text-[9px] text-muted-foreground">Low</span>
            <div className="w-20 h-1.5 rounded-full" style={{ background: "linear-gradient(90deg, #22c55e, #eab308, #f97316, #ef4444)" }} />
            <span className="text-[9px] text-muted-foreground">High</span>
          </div>
        </div>
      </div>


      {/* ── Main area ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Left: analytics panel */}
        <LeftPanel
          repoId={repoId}
          repos={repos}
          currentRepo={repo}
          scores={scores}
          busFactor={busFactor}
        />

        {/* Center: visualization */}
        <div className="flex-1 min-w-0 relative flex flex-col overflow-hidden">
          {/* City canvas */}
          <div className="flex-1 min-h-0 relative">
            {viewMode === "coupling" ? (
              <CouplingGraph
                repoId={repoId}
                files={files ?? []}
                onFileClick={(f) => setSelectedFile(f)}
                selectedId={selectedFile?.id ?? null}
                colorBy={colorBy}
              />
            ) : visibleFiles && visibleFiles.length > 0 ? (
              <CityScene3D
                files={visibleFiles}
                onFileClick={(f) => setSelectedFile(f)}
                selectedId={selectedFile?.id ?? null}
                mode={viewMode}
                colorBy={colorBy}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[#060a14]">
                <p className="text-sm text-muted-foreground">No files to visualize</p>
              </div>
            )}

            {/* Floating overview + legend card */}
            <div className="absolute top-3 left-3 w-56 rounded-lg border border-border/60 bg-card/80 backdrop-blur-md shadow-xl overflow-hidden pointer-events-none">
              <div className="p-3 border-b border-border/60">
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Repository Overview</h3>
                <div className="space-y-1.5">
                  {[
                    { label: "Files", value: repo.totalFiles.toLocaleString() },
                    {
                      label: codeOnly ? "Shown (code)" : "Shown (all)",
                      value: `${shownCount.toLocaleString()} / ${totalCount.toLocaleString()}`,
                    },
                    { label: "Lines of Code", value: repo.linesOfCode.toLocaleString() },
                    { label: "Risky Files", value: `${repo.riskyFiles} (${repo.riskyFilesPercent}%)`, red: true },
                    { label: "Authors", value: String(repo.authors) },
                    { label: "Last Commit", value: repo.lastCommit },
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between items-baseline gap-2">
                      <span className="text-[11px] text-muted-foreground">{item.label}</span>
                      <span className={cn("text-[11px] font-medium truncate", item.red ? "text-red-400" : "text-foreground")}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-3">
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {viewMode === "coupling" ? "Coupling Legend" : "Building Legend (Files)"}
                </h3>
                <div className="space-y-1.5 text-[10px]">
                  {(viewMode === "coupling"
                    ? [
                        { k: "Node", v: "File" },
                        { k: "Node Size", v: "Coupling Degree" },
                        { k: "Edge", v: "Files Change Together" },
                        { k: "Edge Width", v: "Shared Commits" },
                        { k: "Color", v: COLOR_BY_OPTIONS.find((o) => o.value === colorBy)?.label ?? "Risk Score" },
                      ]
                    : [
                        { k: "Height", v: "Churn (Commits)" },
                        { k: "Base Size", v: "Lines of Code" },
                        { k: "Color", v: COLOR_BY_OPTIONS.find((o) => o.value === colorBy)?.label ?? "Risk Score" },
                      ]
                  ).map((row) => (
                    <div key={row.k} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{row.k}</span>
                      <span className="text-foreground">{row.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Breadcrumb */}
            {selectedFile && (
              <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 px-4 h-6 bg-black/60 backdrop-blur-sm border-t border-border/40 text-[11px] text-muted-foreground overflow-x-auto">
                <span className="text-muted-foreground/70">root</span>
                {selectedFile.path.split("/").map((part, i, arr) => (
                  <span key={i} className="flex items-center gap-1 shrink-0">
                    <ChevronRight className="w-3 h-3 opacity-50" />
                    <span className={i === arr.length - 1 ? "text-foreground font-medium" : ""}>{part}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Bottom stats bar */}
          <div className="shrink-0 flex items-center gap-5 px-4 py-2 bg-black/75 backdrop-blur-sm border-t border-border/50 flex-wrap">
            <StatChip icon={FileText} tint="text-slate-300 bg-slate-400/15" label="Total Files" value={repo.totalFiles.toLocaleString()} />
            <StatChip icon={AlertTriangle} tint="text-red-400 bg-red-400/15" label="High Risk Files" value={`${repo.riskyFiles} (${repo.riskyFilesPercent}%)`} valueClass="text-red-400" />
            <StatChip
              icon={Gauge}
              tint="text-orange-400 bg-orange-400/15"
              label="Avg. Risk Score"
              value={repo.avgRiskScore}
              valueClass={cn(repo.avgRiskScore < 0.3 ? "text-green-400" : repo.avgRiskScore < 0.5 ? "text-yellow-400" : repo.avgRiskScore < 0.7 ? "text-orange-400" : "text-red-400")}
            />
            <StatChip icon={TestTube} tint="text-blue-400 bg-blue-400/15" label="Test Coverage" value={`${repo.testCoverage}%`} valueClass="text-blue-400" />
            <StatChip icon={Clock} tint="text-purple-400 bg-purple-400/15" label="Technical Debt" value={repo.technicalDebt} />
            {scores && (
              <StatChip icon={Shield} tint="text-emerald-400 bg-emerald-400/15" label="Health Score" value={`${scores.health}/100`} valueClass={scoreColor(scores.health)} />
            )}
          </div>
        </div>

        {/* Right: file panel when file selected, otherwise security overview */}
        <AnimatePresence mode="wait">
          {selectedFile ? (
            <motion.div
              key="file-panel"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.2, ease }}
              className="w-72 shrink-0 border-l border-border bg-card overflow-hidden flex flex-col"
            >
              <FilePanel
                repoId={repoId}
                fileId={selectedFile.id}
                repoUrl={repo.url}
                onClose={() => setSelectedFile(null)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="security-panel"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.2, ease }}
            >
              <SecurityPanel files={visibleFiles ?? []} scores={scores} colorBy={colorBy} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom analytics row ─────────────────────────────────────────── */}
      {visibleFiles && visibleFiles.length > 0 && (
        <BottomPanel
          files={visibleFiles}
          repos={repos}
          repoId={repoId}
          scores={scores}
        />
      )}


      <ChatDrawer
        repoId={repoId}
        selectedFile={selectedFile}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
}
