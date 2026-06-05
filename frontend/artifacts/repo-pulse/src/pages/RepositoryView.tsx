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
import { cn } from "@/lib/utils";
import {
  X,
  Star,
  GitCommit,
  FileText,
  Users,
  Layers,
  TestTube,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  Box,
} from "lucide-react";
import { Link } from "wouter";

// ─── Color helpers ───────────────────────────────────────────────────────────

function riskToHex(score: number): string {
  if (score < 0.3) return "#22c55e";
  if (score < 0.5) return "#eab308";
  if (score < 0.7) return "#f97316";
  return "#ef4444";
}

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

function CityScene3D({ files, onFileClick, selectedId }: {
  files: FileNode[];
  onFileClick: (f: FileNode) => void;
  selectedId: number | null;
}) {
  const webglAvailable = useMemo(() => hasWebGL(), []);
  const [Loaded, setLoaded] = useState<React.ComponentType<{
    files: FileNode[];
    onFileClick: (f: FileNode) => void;
    selectedId: number | null;
  }> | null>(null);
  const [loadError, setLoadError] = useState(false);

  useMemo(() => {
    if (!webglAvailable) return;
    import("@/components/CityCanvas")
      .then((m) => setLoaded(() => m.default))
      .catch(() => setLoadError(true));
  }, [webglAvailable]);

  if (!webglAvailable || loadError) {
    return <City2DFallback files={files} onFileClick={onFileClick} selectedId={selectedId} />;
  }
  if (!Loaded) return (
    <div className="flex h-full items-center justify-center bg-[#060a14]">
      <RefreshCw className="w-5 h-5 text-primary animate-spin" />
    </div>
  );

  return (
    <WebGLErrorBoundary fallback={<City2DFallback files={files} onFileClick={onFileClick} selectedId={selectedId} />}>
      <Loaded files={files} onFileClick={onFileClick} selectedId={selectedId} />
    </WebGLErrorBoundary>
  );
}

// ─── 2D Treemap fallback ─────────────────────────────────────────────────────

function City2DFallback({ files, onFileClick, selectedId }: {
  files: FileNode[];
  onFileClick: (f: FileNode) => void;
  selectedId: number | null;
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
                        backgroundColor: riskToHex(file.riskScore),
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

function MetricCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-background/60 border border-border rounded-md p-3">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-xl font-bold", color ?? "text-foreground")}>{value}</div>
    </div>
  );
}

function FilePanel({ repoId, fileId, onClose }: { repoId: number; fileId: number; onClose: () => void }) {
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
              <MetricCard label="Risk Score" value={file.riskScore} color={
                file.riskScore < 0.3 ? "text-green-400" :
                file.riskScore < 0.5 ? "text-yellow-400" :
                file.riskScore < 0.7 ? "text-orange-400" : "text-red-400"
              } />
              <MetricCard label="Churn (Commits)" value={file.churnCommits} />
              <MetricCard label="Lines of Code" value={file.linesOfCode.toLocaleString()} />
              <MetricCard label="Complexity" value={file.complexity} />
              <MetricCard
                label="Test Coverage"
                value={`${file.testCoverage}%`}
                color={file.testCoverage >= 60 ? "text-green-400" : file.testCoverage >= 40 ? "text-yellow-400" : "text-red-400"}
              />
              <MetricCard label="Authors" value={file.authors} />
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
                <h4 className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <GitCommit className="w-3 h-3 text-blue-400" /> Recent Commits
                </h4>
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
          <div className="text-center py-8">
            <GitCommit className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-xs text-muted-foreground">Commit history coming soon</p>
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

      <div className="px-3 py-2 border-t border-border shrink-0">
        <button className="w-full flex items-center justify-center gap-1.5 text-xs text-primary hover:underline" data-testid="button-view-file-repo">
          View File in Repository <FileText className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main RepositoryView ─────────────────────────────────────────────────────

export default function RepositoryView() {
  const { id } = useParams<{ id: string }>();
  const repoId = parseInt(id ?? "0");
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);

  const { data: repo, isLoading: repoLoading } = useGetRepository(repoId, {
    query: { queryKey: getGetRepositoryQueryKey(repoId) },
  });
  const { data: files, isLoading: filesLoading } = useListFiles(repoId, {
    query: { queryKey: getListFilesQueryKey(repoId) },
  });

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
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border bg-card shrink-0">
        <Link href="/repositories">
          <button className="text-muted-foreground hover:text-foreground p-1 transition-colors" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <h1 className="text-sm font-bold text-foreground truncate">{repo.name}</h1>
        {repo.isPublic && (
          <span className="text-[10px] px-1.5 py-0.5 bg-blue-400/10 text-blue-400 border border-blue-400/20 rounded-full shrink-0">Public</span>
        )}
        <div className="text-xs text-muted-foreground hidden sm:block truncate flex-1">{repo.url}</div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
          <RefreshCw className="w-3 h-3" />
          Last analyzed {repo.lastAnalyzed}
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className="w-52 shrink-0 border-r border-border bg-card flex flex-col overflow-y-auto">
          <div className="p-3 border-b border-border">
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
          <div className="p-3 border-b border-border">
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Building Legend</h3>
            <div className="space-y-1.5 text-[10px]">
              <div className="flex gap-2"><span className="text-muted-foreground">Height</span><span className="text-foreground">Churn (Commits)</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground">Base Size</span><span className="text-foreground">Lines of Code</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground">Color</span><span className="text-foreground">Risk Score</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground">Glow</span><span className="text-foreground">Test Coverage</span></div>
            </div>
          </div>
          <div className="p-3">
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Risk Score</h3>
            <div className="flex items-center gap-1 mb-3">
              <span className="text-[9px] text-muted-foreground">Low</span>
              <div className="flex-1 h-2 rounded-full" style={{ background: "linear-gradient(90deg, #22c55e, #eab308, #f97316, #ef4444)" }} />
              <span className="text-[9px] text-muted-foreground">High</span>
            </div>
            {files && (
              <div className="space-y-1">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Directories</h4>
                {Array.from(new Set(files.filter((f) => f.isDirectory).map((f) => f.name))).map((dir) => {
                  const dirFiles = files.filter((f) => !f.isDirectory && f.parentPath === dir);
                  const avgRisk = dirFiles.length ? dirFiles.reduce((a, b) => a + b.riskScore, 0) / dirFiles.length : 0;
                  return (
                    <div key={dir} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: riskToHex(avgRisk) }} />
                      <span className="text-[10px] text-foreground truncate">{dir}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{dirFiles.length}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Center — visualization */}
        <div className="flex-1 min-w-0 relative overflow-hidden">
          {files && files.length > 0 ? (
            <CityScene3D
              files={files}
              onFileClick={(f) => setSelectedFile(f)}
              selectedId={selectedFile?.id ?? null}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-[#060a14]">
              <p className="text-sm text-muted-foreground">No files to visualize</p>
            </div>
          )}

          {/* Bottom stats bar */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center gap-6 px-4 py-2 bg-black/70 backdrop-blur-sm border-t border-border/50 text-[11px] flex-wrap">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Total Files: <span className="text-foreground font-medium">{repo.totalFiles.toLocaleString()}</span></span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span>High Risk: <span className="text-red-400 font-medium">{repo.riskyFiles} ({repo.riskyFilesPercent}%)</span></span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>Avg Risk: <span className={cn("font-medium",
                repo.avgRiskScore < 0.3 ? "text-green-400" :
                repo.avgRiskScore < 0.5 ? "text-yellow-400" :
                repo.avgRiskScore < 0.7 ? "text-orange-400" : "text-red-400"
              )}>{repo.avgRiskScore}</span></span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <TestTube className="w-3.5 h-3.5 text-green-400" />
              <span>Coverage: <span className="text-green-400 font-medium">{repo.testCoverage}%</span></span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-3.5 h-3.5 text-purple-400" />
              <span>Tech Debt: <span className="text-foreground font-medium">{repo.technicalDebt}</span></span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        {selectedFile && (
          <div className="w-64 shrink-0 border-l border-border bg-card overflow-hidden flex flex-col">
            <FilePanel repoId={repoId} fileId={selectedFile.id} onClose={() => setSelectedFile(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
