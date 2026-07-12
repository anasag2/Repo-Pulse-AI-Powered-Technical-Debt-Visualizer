import { useState, useRef, useMemo, useEffect, Component } from "react";
import { createPortal } from "react-dom";
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
import CouplingGraph from "@/components/CouplingGraph";
import ChatDrawer from "@/components/ChatDrawer";
import { motion, AnimatePresence } from "framer-motion";
import { isCodeFile } from "@/lib/file-classify";
import { cn, formatLastAnalyzed } from "@/lib/utils";
import { usePersistedState } from "@/lib/use-persisted-state";
import { useSettings } from "@/lib/use-settings";
import { ease } from "@/lib/motion";

type ViewMode = "3d" | "2d" | "coupling";
import {
  X,
  Maximize2,
  GitCommit,
  FileText,
  TestTube,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  Box,
  Folder,
  Search,
  Clock,
  History,
  ChevronRight,
  Gauge,
  ExternalLink,
  Sparkles,
  FileCode2,
  MessageSquare,
  Camera,
} from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

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
  cognitiveComplexity: number;
  duplicatedBlocks: number;
  commentLines: number;
  couplingDegree: number;
  contributors: { name: string; commits: number }[];
  aiInsight: AiInsight | null;
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

// Roomy, readable view of a full Claude analysis — a modal overlay (not a browser
// popup). Backdrop click-away + Esc close, background scroll locked, focus moved in.
function AiInsightModal({ insight, filePath, repoUrl, onClose }: {
  insight: AiInsight; filePath: string; repoUrl: string; onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cardRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Portal to <body> so the fixed overlay escapes the file panel's transformed,
  // overflow-hidden ancestor (framer-motion sets a transform → containing block).
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-labelledby="ai-insight-title"
      data-testid="ai-insight-modal"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={cardRef} tabIndex={-1}
        className="relative w-full max-w-[680px] max-h-[85vh] flex flex-col bg-card border border-border rounded-xl shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="ai-insight-title" className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" /> AI Debt Analysis
              </h3>
              <p className="mt-1 text-[11px] font-mono text-muted-foreground break-all">{filePath}</p>
            </div>
            <button
              onClick={onClose} aria-label="Close" data-testid="button-close-insight-modal"
              className="text-muted-foreground hover:text-foreground p-1 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide", SEVERITY_STYLE[insight.severity])}>
              {insight.severity} severity
            </span>
            <span className="text-[11px] text-muted-foreground">
              Estimated effort: <span className="text-foreground font-medium">{insight.estimatedEffort}</span>
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <section>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Summary</div>
            <p className="text-[13px] text-foreground leading-relaxed">{insight.summary}</p>
          </section>
          {insight.debtDrivers.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Debt drivers</div>
              <div className="flex flex-wrap gap-1.5">
                {insight.debtDrivers.map((d, i) => (
                  <span key={i} className="text-[12px] bg-muted/60 border border-border rounded-md px-2 py-1 text-foreground">{d}</span>
                ))}
              </div>
            </section>
          )}
          {insight.refactorSteps.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Refactor plan</div>
              <ol className="space-y-2.5">
                {insight.refactorSteps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="text-[13px] text-foreground leading-relaxed pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-border flex items-center justify-between gap-2">
          <a
            href={blobUrl(repoUrl, filePath)} target="_blank" rel="noreferrer"
            className="text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1"
          >
            Open on GitHub <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={onClose}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-400"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AiInsightCard({ repoId, fileId, filePath, repoUrl, cached }: {
  repoId: number; fileId: number; filePath: string; repoUrl: string; cached: AiInsight | null;
}) {
  // Seed from the cached analysis (saved on the file record) so a prior run just
  // shows up when you reopen the file — no button, no re-spend on Claude.
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(cached ? "done" : "idle");
  const [insight, setInsight] = useState<AiInsight | null>(cached);
  const [error, setError] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // Explicit user action → always request a fresh run (force=true); the backend
  // saves it so it persists next time.
  async function run() {
    setState("loading");
    setError("");
    try {
      const token = getToken();
      const res = await fetch(`/api/repositories/${repoId}/files/${fileId}/ai-insight?force=true`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      setInsight(await res.json());
      setState("done");
      setModalOpen(true); // jump straight to the roomy, readable view
      // Refresh the cached file so a later reopen seeds from the now-saved insight.
      queryClient.invalidateQueries({ queryKey: getGetFileQueryKey(repoId, fileId) });
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
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full border uppercase", SEVERITY_STYLE[insight.severity])}>
              {insight.severity} severity
            </span>
            <span className="text-[9px] text-muted-foreground">Effort: {insight.estimatedEffort}</span>
          </div>
          <p className="text-[11px] text-foreground leading-relaxed line-clamp-2">{insight.summary}</p>
          <button
            onClick={() => setModalOpen(true)}
            className="w-full mt-0.5 inline-flex items-center justify-center gap-1 h-7 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            data-testid="button-view-full-insight"
          >
            View full analysis <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      )}

      {modalOpen && insight && (
        <AiInsightModal insight={insight} filePath={filePath} repoUrl={repoUrl} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}

function FilePanel({ repoId, fileId, repoUrl, onClose }: { repoId: number; fileId: number; repoUrl: string; onClose: () => void }) {
  const [tab, setTab] = useState<"overview" | "history" | "contributors">("overview");
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
            </div>
            <div className={cn("mt-1 inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full border", riskBadge(file.riskScore))}>
              {riskLabel(file.riskScore)}
            </div>
            {/* Hidden for now: History has known issues; Snapshots isn't developed yet.
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Link href={`/history?repo=${repoId}&path=${encodeURIComponent(file.path)}`}>
                <button
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25"
                  data-testid="button-file-history"
                >
                  <History className="h-3.5 w-3.5" /> History charts
                </button>
              </Link>
              <Link href="/snapshots">
                <button
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/15 px-2.5 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/25"
                  data-testid="button-file-snapshots"
                >
                  <Camera className="h-3.5 w-3.5" /> What's the risk?
                </button>
              </Link>
            </div>
            */}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 shrink-0" data-testid="button-close-panel">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Tabs */}
        <div className="flex gap-3 mt-2.5">
          {(["overview", "history", "contributors"] as const).map((t) => (
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
              <MetricCard label="Cognitive Cplx" value={ext(file).cognitiveComplexity ?? 0} />
              <MetricCard label="Functions" value={ext(file).functionCount ?? 0} />
              <MetricCard
                label="Duplicated Blocks"
                value={ext(file).duplicatedBlocks ?? 0}
                color={(ext(file).duplicatedBlocks ?? 0) > 0 ? "text-orange-400" : undefined}
              />
              <MetricCard
                label="Coupling"
                value={ext(file).couplingDegree ?? 0}
                color={(ext(file).couplingDegree ?? 0) > 0 ? "text-violet-400" : undefined}
              />
              <MetricCard label="Comment Lines" value={ext(file).commentLines ?? 0} />
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
            <AiInsightCard
              key={fileId}
              repoId={repoId}
              fileId={fileId}
              filePath={file.path}
              repoUrl={repoUrl}
              cached={ext(file).aiInsight ?? null}
            />
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
        {tab === "contributors" && (
          <div className="space-y-2">
            {(ext(file).contributors ?? []).length > 0 ? (
              (ext(file).contributors ?? []).slice(0, 8).map((c) => (
                <div key={c.name} className="flex items-center gap-2 p-2 bg-background/40 rounded-md">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">
                    {c.name.trim().charAt(0).toUpperCase() || "?"}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {c.commits} commit{c.commits === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {file.authors > 0
                  ? "Contributor details will appear after re-analyzing this repository."
                  : "No contributor data for this file."}
              </p>
            )}
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
  // Persisted per repo so leaving this page (e.g. to History) and coming
  // back restores the same file, view, and filters instead of resetting.
  const [selectedFileId, setSelectedFileId] = usePersistedState<number | null>(`repoview-${repoId}-selectedFileId`, null);
  const [viewMode, setViewMode] = usePersistedState<ViewMode>(`repoview-${repoId}-viewMode`, "3d");
  const [colorBy, setColorBy] = usePersistedState<ColorMode>(`repoview-${repoId}-colorBy`, "risk");
  const [search, setSearch] = usePersistedState(`repoview-${repoId}-search`, "");
  const [codeOnly, setCodeOnly] = usePersistedState(`repoview-${repoId}-codeOnly`, true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Apply the account's default color mode/view the first time this repo is
  // opened (i.e. no per-repo choice has been saved here yet). Settings load
  // async, so this can't be usePersistedState's initializer — it just checks
  // sessionStorage directly and only ever wins when nothing's there yet, so a
  // manual choice (or a later settings refetch) never gets clobbered.
  const { data: userSettings } = useSettings();
  useEffect(() => {
    if (!userSettings) return;
    if (sessionStorage.getItem(`rp-state:repoview-${repoId}-viewMode`) === null && userSettings.defaultView) {
      setViewMode(userSettings.defaultView as ViewMode);
    }
    if (sessionStorage.getItem(`rp-state:repoview-${repoId}-colorBy`) === null && userSettings.defaultColorBy) {
      setColorBy(userSettings.defaultColorBy as ColorMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSettings, repoId]);

  const [refreshing, setRefreshing] = useState(false);

  // 5-minute refresh cooldown (also enforced server-side). Persisted per repo so
  // it survives reloads/navigation; a 1s ticker updates the countdown.
  const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
  const cooldownKey = `rp-refresh-${repoId}`;
  const [cooldownUntil, setCooldownUntil] = useState<number>(() => {
    try { return Number(localStorage.getItem(cooldownKey)) || 0; } catch { return 0; }
  });
  // Re-read the cooldown when switching repos — this view doesn't remount on the
  // :id change, so the initializer above would otherwise keep the first repo's
  // cooldown and wrongly disable refresh on every other repo.
  useEffect(() => {
    try { setCooldownUntil(Number(localStorage.getItem(`rp-refresh-${repoId}`)) || 0); }
    catch { setCooldownUntil(0); }
  }, [repoId]);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (Date.now() >= cooldownUntil) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  const startCooldown = (ms: number) => {
    const until = Date.now() + ms;
    setCooldownUntil(until);
    try { localStorage.setItem(cooldownKey, String(until)); } catch { /* ignore */ }
  };

  const { data: repo, isLoading: repoLoading } = useGetRepository(repoId, {
    query: { queryKey: getGetRepositoryQueryKey(repoId) },
  });
  const { data: files, isLoading: filesLoading } = useListFiles(repoId, {
    query: { queryKey: getListFilesQueryKey(repoId) },
  });

  const selectedFile = useMemo(
    () => files?.find((f) => f.id === selectedFileId) ?? null,
    [files, selectedFileId],
  );
  const setSelectedFile = (f: FileNode | null) => setSelectedFileId(f?.id ?? null);

  // Hide config/data/docs/lockfiles/assets by default — only programming files
  // make it onto the map unless "Code only" is turned off. (Directories pass
  // through; the visualizations skip them anyway.)
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

  // Suggestions shown under the search box as the user types — matched by name/path.
  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !files) return [];
    return files
      .filter((f) => !f.isDirectory && f.name.toLowerCase().startsWith(q))
      .slice(0, 8);
  }, [search, files]);

  useEffect(() => {
    setSearchActiveIndex(0);
  }, [search]);

  const selectSearchMatch = (f: FileNode) => {
    setSelectedFile(f);
    setSearch(f.name);
    setSearchOpen(false);
  };

  // Refresh = pull only the new commits into the existing clone and recompute,
  // then refetch everything (analysis + cached tours regenerate server-side).
  const refresh = async () => {
    if (refreshing || cooldownLeft > 0) return;
    setRefreshing(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/repositories/${repoId}/reanalyze`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 429) {
        // Server cooldown — sync our timer to its Retry-After.
        const retry = parseInt(res.headers.get("Retry-After") || "", 10);
        startCooldown((Number.isFinite(retry) && retry > 0 ? retry : 300) * 1000);
        let detail = "Just refreshed — please wait a bit.";
        try { detail = (await res.json()).detail ?? detail; } catch { /* ignore */ }
        toast({ title: "Refreshing too soon", description: detail });
        return;
      }
      if (!res.ok) {
        let detail = `Refresh failed (${res.status})`;
        try { detail = (await res.json()).detail ?? detail; } catch { /* ignore */ }
        toast({ title: "Refresh failed", description: detail, variant: "destructive" });
        return;
      }
      startCooldown(REFRESH_COOLDOWN_MS);
      queryClient.invalidateQueries(); // re-pull analysis, commits, coupling, tours
      toast({ title: "Refreshed", description: "Pulled the latest commits and recomputed the analysis." });
    } catch {
      toast({ title: "Refresh failed", description: "Couldn't reach the server.", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
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
              <span>Last analyzed {formatLastAnalyzed(repo.lastAnalyzed)}</span>
            </div>
            <button
              onClick={refresh}
              disabled={refreshing || cooldownLeft > 0}
              title={
                cooldownLeft > 0
                  ? `Refresh available in ${Math.floor(cooldownLeft / 60)}m ${cooldownLeft % 60}s`
                  : "Pull the latest commits and re-analyze"
              }
              className="text-muted-foreground hover:text-foreground p-1 transition-colors disabled:opacity-40 disabled:hover:text-muted-foreground"
              data-testid="button-refresh"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
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
              data-testid="button-open-chat"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ask AI</span>
            </button>
          </div>
        </div>

        {/* Row 2 — toolbar */}
        <div className="flex items-center gap-2 px-4 h-11 border-t border-border/60">
          {/* Search */}
          <div className="relative w-56 max-w-[40%]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 100)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSearchActiveIndex((i) => Math.min(i + 1, searchMatches.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSearchActiveIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  const hit = searchMatches[searchActiveIndex];
                  if (hit) selectSearchMatch(hit);
                } else if (e.key === "Escape") {
                  setSearchOpen(false);
                }
              }}
              type="search"
              placeholder="Search files..."
              className="w-full h-8 bg-muted/40 border border-border rounded-md pl-8 pr-9 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="input-search-files"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground border border-border rounded px-1 py-0.5 bg-background/60">⌘K</kbd>

            {searchOpen && searchMatches.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-lg">
                {searchMatches.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectSearchMatch(f); }}
                    onMouseEnter={() => setSearchActiveIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs",
                      i === searchActiveIndex ? "bg-accent text-accent-foreground" : "text-foreground",
                    )}
                    data-testid={`option-search-file-${f.id}`}
                  >
                    <FileText className="w-3 h-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{f.name}</span>
                    <span className="truncate text-muted-foreground text-[10px] ml-auto">{f.path}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Code-only filter */}
          <button
            onClick={() => setCodeOnly((v) => !v)}
            title={codeOnly
              ? "Showing only programming files — click to include configs, data, docs, lockfiles & assets"
              : "Showing all files — click to hide configs, data, docs, lockfiles & assets"}
            className={cn(
              "flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs transition-colors",
              codeOnly
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                : "border-border bg-muted/40 text-foreground hover:bg-muted/70",
            )}
            data-testid="button-code-only"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Code only</span>
          </button>

          {/* View */}
          <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-muted/40 text-xs">
            <span className="text-muted-foreground hidden lg:inline">View</span>
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <SelectTrigger
                className="h-6 w-auto gap-1 border-0 bg-transparent px-0 text-xs text-foreground shadow-none focus:ring-0"
                data-testid="select-view-mode"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3d">3D City</SelectItem>
                <SelectItem value="2d">2D Map</SelectItem>
                <SelectItem value="coupling">Coupling</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Color by */}
          <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-muted/40 text-xs">
            <span className="text-muted-foreground hidden lg:inline">Color by</span>
            <Select value={colorBy} onValueChange={(v) => setColorBy(v as ColorMode)}>
              <SelectTrigger
                className="h-6 w-auto gap-1 border-0 bg-transparent px-0 text-xs text-foreground shadow-none focus:ring-0"
                data-testid="select-color-by"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLOR_BY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

        {/* Right panel — slides in when a file is selected */}
        <AnimatePresence>
          {selectedFile && (
            <motion.div
              key="file-panel"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.25, ease }}
              className="w-80 shrink-0 border-l border-border bg-card overflow-hidden flex flex-col"
            >
              <FilePanel repoId={repoId} fileId={selectedFile.id} repoUrl={repo.url} onClose={() => setSelectedFile(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ChatDrawer
        repoId={repoId}
        selectedFile={selectedFile}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
}