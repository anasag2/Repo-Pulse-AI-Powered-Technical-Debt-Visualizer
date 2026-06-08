import { useState, useRef, useMemo, Component } from "react";
import { useParams } from "wouter";
import {
  useGetRepository,
  getGetRepositoryQueryKey,
  useListFiles,
  getListFilesQueryKey,
  useGetFile,
  getGetFileQueryKey,
} from "@workspace/api-client-react";
import type { FileNode } from "@workspace/api-client-react";
import type { ColorMode } from "@/components/CityCanvas";
import { cn } from "@/lib/utils";
import {
  X,
  Star,
  GitCommit,
  FileText,
  TestTube,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  Box,
  Folder,
  Search,
  SlidersHorizontal,
  HelpCircle,
  Bell,
  Clock,
  ChevronDown,
  ChevronRight,
  Gauge,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

// ─── Color helpers ───────────────────────────────────────────────────────────

function riskToHex(score: number): string {
  if (score < 0.3) return "#22c55e";
  if (score < 0.5) return "#eab308";
  if (score < 0.7) return "#f97316";
  return "#ef4444";
}

// Extended metrics the backend returns but that aren't in the generated FileNode
// type yet (mirrors CityCanvas.ext; duplicated to avoid importing the three.js
// bundle into the 2D path). Accessed defensively for older payloads.
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

// Color a file by the active "Color by" metric (mirrors CityCanvas.metricHex,
// duplicated here so the 2D fallback doesn't eagerly import the three.js bundle).
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

// Best-effort GitHub blob URL for a file path within the repo.
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

// ─── WebGL Error Boundary ────────────────────────────────────────────────────

interface ErrorBoundaryState { hasError: boolean }
class WebGLErrorBoundary extends Component<{ children: React.ReactNode; fallback: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ─── 3D City (lazy) ──────────────────────────────────────────────────────────

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

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

// ─── 2D Treemap fallback ─────────────────────────────────────────────────────

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
              <div
                className="px-2 py-1.5 text-[10px] font-bold flex items-center justify-between"
                style={{ backgroundColor: riskToHex(avgRisk) + "15", color: riskToHex(avgRisk) }}
              >
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
                      style={{
                        backgroundColor: metricHex(file, colorBy),
                        height: `${h}px`,
                        opacity: 0.7 + file.riskScore * 0.3,
                      }}
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

// ─── File detail panel ───────────────────────────────────────────────────────

// A colored icon chip used in the bottom stats bar
function StatChip({ icon: Icon, tint, label, value, valueClass }: {
  icon: React.ComponentType<{ className?: string }>;
  tint: string;          // e.g. "text-blue-400 bg-blue-400/15"
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

// A tiny deterministic sparkline (illustrative — no time-series in the API yet).
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

function MetricCard({ label, value, color, spark }: { label: string; value: string | number; color?: string; spark?: React.ReactNode }) {
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

// ─── Claude-powered file insight ─────────────────────────────────────────────

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
      const res = await fetch(`/api/repositories/${repoId}/files/${fileId}/ai-insight`, {
        method: "POST",
      });
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
          <button
            onClick={run}
            className="text-[10px] font-semibold text-emerald-400 hover:underline"
            data-testid="button-ai-insight"
          >
            {state === "done" || state === "error" ? "Re-analyze" : "Analyze with Claude"}
          </button>
        )}
      </div>

      {state === "idle" && (
        <p className="text-[10px] text-muted-foreground">
          Run Claude over this file's source and metrics for a debt assessment and a concrete refactor plan.
        </p>
      )}
      {state === "loading" && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-1">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> Claude is analyzing…
        </div>
      )}
      {state === "error" && (
        <p className="text-[10px] text-red-400">{error}</p>
      )}
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

function FilePanel({ repoId, fileId, repoUrl, onClose }: { repoId: number; fileId: number; repoUrl: string; onClose: () => void }) {
  const [tab, setTab] = useState<"overview" | "history" | "code" | "contributors">("overview");
  const { data: file, isLoading } = useGetFile(repoId, fileId, {
    query: { queryKey: getGetFileQueryKey(repoId, fileId) },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }
  if (!file) return null;

  const parts = file.path.split("/");

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="file-panel">
      {/* Header */}
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
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 shrink-0" data-testid="button-close-panel">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Tabs */}
        <div className="flex gap-3 mt-2.5">
          {(["overview", "history", "code", "contributors"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "text-[11px] pb-1.5 border-b-2 transition-colors capitalize",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              data-testid={`tab-${t}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <MetricCard
                label="Risk Score"
                value={file.riskScore}
                color={
                  file.riskScore < 0.3 ? "text-green-400" :
                  file.riskScore < 0.5 ? "text-yellow-400" :
                  file.riskScore < 0.7 ? "text-orange-400" : "text-red-400"
                }
                spark={<Sparkline seed={file.id * 7 + 1} color={riskToHex(file.riskScore)} />}
              />
              <MetricCard
                label="Hotspot"
                value={(ext(file).hotspotScore ?? 0).toFixed(2)}
                color={
                  (ext(file).hotspotScore ?? 0) < 0.3 ? "text-green-400" :
                  (ext(file).hotspotScore ?? 0) < 0.6 ? "text-orange-400" : "text-red-400"
                }
                spark={<Sparkline seed={file.id * 5 + 3} color={riskToHex(ext(file).hotspotScore ?? 0)} />}
              />
              <MetricCard
                label="Churn (Commits)"
                value={file.churnCommits}
                spark={<Sparkline seed={file.id * 13 + 5} color="#60a5fa" />}
              />
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
                <div
                  className={cn("h-1.5 rounded-full transition-all", file.testCoverage >= 60 ? "bg-green-400" : file.testCoverage >= 40 ? "bg-yellow-400" : "bg-red-400")}
                  style={{ width: `${file.testCoverage}%` }}
                />
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
                    <div key={rf.name} className="flex items-center gap-2" data-testid={`risk-factor-${rf.name}`}>
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
                  <button onClick={() => setTab("history")} className="text-[10px] text-emerald-400 hover:underline" data-testid="button-view-all-commits">
                    View all
                  </button>
                </div>
                <div className="space-y-2">
                  {file.recentCommits.map((commit) => (
                    <div key={commit.id} className="flex items-start gap-2" data-testid={`commit-${commit.id}`}>
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
                  <div key={commit.id} className="relative" data-testid={`history-commit-${commit.id}`}>
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
        <a
          href={blobUrl(repoUrl, file.path)}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center justify-center gap-1.5 h-9 rounded-md bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-400 transition-colors"
          data-testid="button-view-file-repo"
        >
          View File in Repository <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}

// ─── Main RepositoryView ─────────────────────────────────────────────────────

export default function RepositoryView() {
  const { id } = useParams<{ id: string }>();
  const repoId = parseInt(id ?? "0");
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [colorBy, setColorBy] = useState<ColorMode>("risk");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: repo, isLoading: repoLoading } = useGetRepository(repoId, {
    query: { queryKey: getGetRepositoryQueryKey(repoId) },
  });
  const { data: files, isLoading: filesLoading } = useListFiles(repoId, {
    query: { queryKey: getListFilesQueryKey(repoId) },
  });

  // Search jumps to the first file whose name/path matches.
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
      {/* Top bar */}
      <div className="shrink-0 border-b border-border bg-card">
        {/* Row 1 — repository identity */}
        <div className="flex items-center gap-2.5 px-4 h-12">
          <Link href="/repositories">
            <button className="text-muted-foreground hover:text-foreground p-1 transition-colors" data-testid="button-back" title="Back to repositories">
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
            <button onClick={refresh} title="Re-fetch analysis" className="text-muted-foreground hover:text-foreground p-1 transition-colors" data-testid="button-refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <div className="h-5 w-px bg-border" />
            <button title="Help" className="text-muted-foreground hover:text-foreground p-1 transition-colors">
              <HelpCircle className="w-4 h-4" />
            </button>
            <button title="Notifications" className="text-muted-foreground hover:text-foreground p-1 transition-colors">
              <Bell className="w-4 h-4" />
            </button>
            <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-400">A</div>
          </div>
        </div>

        {/* Row 2 — toolbar */}
        <div className="flex items-center gap-2 px-4 h-11 border-t border-border/60">
          {/* Search */}
          <div className="relative w-56 max-w-[40%]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
              type="search"
              placeholder="Search files..."
              className="w-full h-8 bg-muted/40 border border-border rounded-md pl-8 pr-9 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="input-search-files"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground border border-border rounded px-1 py-0.5 bg-background/60">⌘K</kbd>
          </div>

          {/* Filters */}
          <button className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-muted/40 text-xs text-foreground hover:bg-muted/70 transition-colors" title="Filters">
            <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">Filters</span>
          </button>

          {/* View */}
          <label className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-muted/40 text-xs">
            <span className="text-muted-foreground hidden lg:inline">View</span>
            <div className="relative flex items-center">
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as "3d" | "2d")}
                className="appearance-none bg-transparent pr-4 text-foreground focus:outline-none cursor-pointer"
                data-testid="select-view-mode"
              >
                <option value="3d">3D City</option>
                <option value="2d">2D Map</option>
              </select>
              <ChevronDown className="w-3 h-3 text-muted-foreground absolute right-0 pointer-events-none" />
            </div>
          </label>

          {/* Color by */}
          <label className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-muted/40 text-xs">
            <span className="text-muted-foreground hidden lg:inline">Color by</span>
            <div className="relative flex items-center">
              <select
                value={colorBy}
                onChange={(e) => setColorBy(e.target.value as ColorMode)}
                className="appearance-none bg-transparent pr-4 text-foreground focus:outline-none cursor-pointer"
                data-testid="select-color-by"
              >
                {COLOR_BY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-muted-foreground absolute right-0 pointer-events-none" />
            </div>
          </label>

          {/* Risk legend */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted-foreground hidden md:inline">
              {COLOR_BY_OPTIONS.find((o) => o.value === colorBy)?.label}
            </span>
            <span className="text-[9px] text-muted-foreground">Low</span>
            <div className="w-24 h-2 rounded-full" style={{ background: "linear-gradient(90deg, #22c55e, #eab308, #f97316, #ef4444)" }} />
            <span className="text-[9px] text-muted-foreground">High</span>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Center — visualization */}
        <div className="flex-1 min-w-0 relative overflow-hidden">
          {files && files.length > 0 ? (
            <CityScene3D
              files={files}
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
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Building Legend (Files)</h3>
              <div className="space-y-1.5 text-[10px]">
                {[
                  { k: "Height", v: "Churn (Commits)" },
                  { k: "Base Size", v: "Lines of Code" },
                  { k: "Color", v: COLOR_BY_OPTIONS.find((o) => o.value === colorBy)?.label ?? "Risk Score" },
                  { k: "Glow", v: "Test Coverage" },
                ].map((row) => (
                  <div key={row.k} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{row.k}</span>
                    <span className="text-foreground">{row.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom overlay: breadcrumb + stats bar */}
          <div className="absolute bottom-0 left-0 right-0">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 px-4 h-7 bg-black/60 backdrop-blur-sm border-t border-border/40 text-[11px] text-muted-foreground overflow-x-auto">
              <span className="text-muted-foreground/70">root</span>
              {selectedFile && selectedFile.path.split("/").map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1 shrink-0">
                  <ChevronRight className="w-3 h-3 opacity-50" />
                  <span className={i === arr.length - 1 ? "text-foreground font-medium" : ""}>{part}</span>
                </span>
              ))}
            </div>
            {/* Stats bar */}
            <div className="flex items-center gap-5 px-4 py-2 bg-black/75 backdrop-blur-sm border-t border-border/50 flex-wrap">
              <StatChip icon={FileText} tint="text-slate-300 bg-slate-400/15" label="Total Files" value={repo.totalFiles.toLocaleString()} />
              <StatChip icon={AlertTriangle} tint="text-red-400 bg-red-400/15" label="High Risk Files" value={`${repo.riskyFiles} (${repo.riskyFilesPercent}%)`} valueClass="text-red-400" />
              <StatChip
                icon={Gauge}
                tint="text-orange-400 bg-orange-400/15"
                label="Avg. Risk Score"
                value={repo.avgRiskScore}
                valueClass={cn(
                  repo.avgRiskScore < 0.3 ? "text-green-400" :
                  repo.avgRiskScore < 0.5 ? "text-yellow-400" :
                  repo.avgRiskScore < 0.7 ? "text-orange-400" : "text-red-400"
                )}
              />
              <StatChip icon={TestTube} tint="text-blue-400 bg-blue-400/15" label="Test Coverage" value={`${repo.testCoverage}%`} valueClass="text-blue-400" />
              <StatChip icon={Clock} tint="text-purple-400 bg-purple-400/15" label="Technical Debt" value={repo.technicalDebt} />
            </div>
          </div>
        </div>

        {/* Right panel */}
        {selectedFile && (
          <div className="w-72 shrink-0 border-l border-border bg-card overflow-hidden flex flex-col">
            <FilePanel repoId={repoId} fileId={selectedFile.id} repoUrl={repo.url} onClose={() => setSelectedFile(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
