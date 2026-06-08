import { useState, useMemo, Component } from "react";
import {
  useGetDashboardSummary,
  useListRepositories,
  useListFiles,
  getListFilesQueryKey,
  useGetFile,
  getGetFileQueryKey,
  useGetRepository,
  getGetRepositoryQueryKey,
} from "@workspace/api-client-react";
import type { FileNode, Repository } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  X, Star, GitCommit, FileText, Users, Layers, TestTube,
  RefreshCw, AlertTriangle, Box, Shield, Database, ChevronRight, ExternalLink,
} from "lucide-react";

// ─── Color helpers ─────────────────────────────────────────────────────────

export function riskToHex(score: number): string {
  if (score < 0.3) return "#22c55e";
  if (score < 0.5) return "#eab308";
  if (score < 0.7) return "#f97316";
  return "#ef4444";
}

export function riskLabel(score: number) {
  if (score < 0.3) return "Low";
  if (score < 0.5) return "Med";
  if (score < 0.7) return "Hi-Med";
  return "High";
}

function riskText(score: number) {
  if (score < 0.3) return "text-green-400";
  if (score < 0.5) return "text-yellow-400";
  if (score < 0.7) return "text-orange-400";
  return "text-red-400";
}

// Best-effort GitHub blob URL for a file path within the repo.
function blobUrl(repoUrl: string, path: string): string {
  const base = repoUrl.replace(/\/$/, "").replace(/^(?!https?:\/\/)/, "https://").replace(/\.git$/, "");
  return `${base}/blob/HEAD/${path}`;
}

function riskBadge(score: number) {
  if (score < 0.3) return "bg-green-400/15 text-green-400 border-green-400/25";
  if (score < 0.5) return "bg-yellow-400/15 text-yellow-400 border-yellow-400/25";
  if (score < 0.7) return "bg-orange-400/15 text-orange-400 border-orange-400/25";
  return "bg-red-400/15 text-red-400 border-red-400/25";
}

// ─── WebGL helpers ──────────────────────────────────────────────────────────

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch { return false; }
}

interface EBState { hasError: boolean }
class WebGLBoundary extends Component<{ children: React.ReactNode; fallback: React.ReactNode }, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

// ─── 3D scene loader ────────────────────────────────────────────────────────

function CityScene3D({ files, onFileClick, selectedId }: {
  files: FileNode[];
  onFileClick: (f: FileNode) => void;
  selectedId: number | null;
}) {
  const webgl = useMemo(() => hasWebGL(), []);
  const [Canvas, setCanvas] = useState<React.ComponentType<{ files: FileNode[]; onFileClick: (f: FileNode) => void; selectedId: number | null }> | null>(null);
  const [err, setErr] = useState(false);

  useMemo(() => {
    if (!webgl) return;
    import("@/components/CityCanvas").then((m) => setCanvas(() => m.default)).catch(() => setErr(true));
  }, [webgl]);

  if (!webgl || err) return <City2DFallback files={files} onFileClick={onFileClick} selectedId={selectedId} />;
  if (!Canvas) return (
    <div className="flex h-full items-center justify-center bg-[#060a14]">
      <RefreshCw className="w-5 h-5 text-primary animate-spin" />
    </div>
  );
  return (
    <WebGLBoundary fallback={<City2DFallback files={files} onFileClick={onFileClick} selectedId={selectedId} />}>
      <Canvas files={files} onFileClick={onFileClick} selectedId={selectedId} />
    </WebGLBoundary>
  );
}

// ─── 2D fallback ────────────────────────────────────────────────────────────

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
    <div className="h-full overflow-auto p-5 bg-[#060a14]">
      <div className="text-[10px] text-muted-foreground mb-4 flex items-center gap-1.5">
        <Box className="w-3 h-3" />
        File map — click any block to inspect · 3D city loads in WebGL-capable browsers
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        {byDir.map(([dir, dirFiles]) => {
          const avg = dirFiles.reduce((a, b) => a + b.riskScore, 0) / dirFiles.length;
          return (
            <div key={dir} className="border rounded-lg overflow-hidden" style={{ borderColor: riskToHex(avg) + "35" }}>
              <div className="px-3 py-2 text-[10px] font-bold flex items-center justify-between"
                style={{ backgroundColor: riskToHex(avg) + "18", color: riskToHex(avg) }}>
                <span className="truncate">{dir}</span>
                <span className="opacity-60 ml-2 shrink-0">{dirFiles.length} files</span>
              </div>
              <div className="p-2 flex flex-wrap gap-1">
                {dirFiles.map((file) => {
                  const h = Math.max(24, Math.min(56, (file.churnCommits / 100) * 56));
                  return (
                    <div
                      key={file.id}
                      title={`${file.name}\nRisk: ${file.riskScore}  Lines: ${file.linesOfCode}  Churn: ${file.churnCommits}`}
                      onClick={() => onFileClick(file)}
                      className={cn(
                        "cursor-pointer rounded transition-all hover:scale-110 hover:brightness-125",
                        selectedId === file.id && "ring-2 ring-white/50 scale-110"
                      )}
                      style={{ backgroundColor: riskToHex(file.riskScore), width: 28, height: h, opacity: 0.65 + file.riskScore * 0.35 }}
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

// ─── File inspector panel ────────────────────────────────────────────────────

function FilePanel({ repoId, fileId, onClose }: { repoId: number; fileId: number; onClose: () => void }) {
  const [tab, setTab] = useState<"overview" | "history" | "contributors">("overview");
  const { data: file, isLoading } = useGetFile(repoId, fileId, {
    query: { queryKey: getGetFileQueryKey(repoId, fileId) },
  });
  const { data: repo } = useGetRepository(repoId, {
    query: { queryKey: getGetRepositoryQueryKey(repoId) },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
    </div>
  );
  if (!file) return null;

  const parts = file.path.split("/");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1 flex-wrap">
              {parts.map((p, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="opacity-40">/</span>}
                  <span className={i === parts.length - 1 ? "text-foreground" : ""}>{p}</span>
                </span>
              ))}
            </div>
            <h3 className="text-sm font-bold text-foreground truncate">{file.name}</h3>
            <div className={cn("mt-1.5 inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full border", riskBadge(file.riskScore))}>
              {riskLabel(file.riskScore)} Risk · {file.riskScore}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-3 mt-2.5">
          {(["overview", "history", "contributors"] as const).map((t) => (
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
              {[
                { label: "Risk Score", value: file.riskScore, cls: riskText(file.riskScore) },
                { label: "Churn", value: `${file.churnCommits} commits`, cls: "" },
                { label: "Lines of Code", value: file.linesOfCode.toLocaleString(), cls: "" },
                { label: "Complexity", value: file.complexity, cls: "" },
                { label: "Test Coverage", value: `${file.testCoverage}%`, cls: file.testCoverage >= 60 ? "text-green-400" : file.testCoverage >= 40 ? "text-yellow-400" : "text-red-400" },
                { label: "Authors", value: file.authors, cls: "" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="bg-background/60 border border-border rounded-md p-2.5">
                  <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
                  <div className={cn("text-lg font-bold text-foreground", cls)}>{value}</div>
                </div>
              ))}
            </div>
            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                <span>Coverage</span><span>{file.testCoverage}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div className={cn("h-1.5 rounded-full", file.testCoverage >= 60 ? "bg-green-400" : file.testCoverage >= 40 ? "bg-yellow-400" : "bg-red-400")}
                  style={{ width: `${file.testCoverage}%` }} />
              </div>
            </div>
            {file.riskFactors?.length > 0 && (
              <div className="mb-3">
                <h4 className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-orange-400" /> Risk Factors
                </h4>
                <div className="space-y-1.5">
                  {file.riskFactors.map((rf) => (
                    <div key={rf.name} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: riskToHex(Math.min(1, rf.score * 3)) }} />
                      <span className="text-[11px] text-foreground flex-1">{rf.name}</span>
                      <div className="w-14 bg-muted rounded-full h-1">
                        <div className="h-1 rounded-full" style={{ width: `${Math.min(100, rf.score * 300)}%`, backgroundColor: riskToHex(Math.min(1, rf.score * 3)) }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-7 text-right">{rf.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {file.recentCommits?.length > 0 && (
              <div>
                <h4 className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <GitCommit className="w-3 h-3 text-blue-400" /> Recent Commits
                </h4>
                <div className="space-y-2">
                  {file.recentCommits.map((c) => (
                    <div key={c.id} className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary shrink-0 mt-0.5">
                        {c.authorInitials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-foreground truncate">{c.message}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] text-muted-foreground">{c.author}</span>
                          <span className="text-[9px] text-muted-foreground">{c.timeAgo}</span>
                          <span className="text-[9px] font-mono text-blue-400">{c.hash}</span>
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
          <div className="text-center py-10">
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

      {repo && (
        <div className="px-3 py-2.5 border-t border-border shrink-0">
          <a
            href={blobUrl(repo.url, file.path)}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-1.5 h-9 rounded-md bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-400 transition-colors"
            data-testid="button-view-file-repo"
          >
            View File in Repository <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Stat chip ───────────────────────────────────────────────────────────────

function Stat({ icon: Icon, label, value, cls }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  cls?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="w-3 h-3" />{label}
      </div>
      <div className={cn("text-base font-bold", cls ?? "text-foreground")}>{value}</div>
    </div>
  );
}

// ─── Repo row ────────────────────────────────────────────────────────────────

function RepoRow({ repo, active, onClick }: { repo: Repository; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-left",
        active
          ? "bg-primary/15 border border-primary/30"
          : "hover:bg-muted/30 border border-transparent"
      )}
    >
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: riskToHex(repo.avgRiskScore) }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-foreground truncate">{repo.name}</div>
        <div className="text-[10px] text-muted-foreground truncate">{repo.totalFiles.toLocaleString()} files</div>
      </div>
      <div className="shrink-0 text-right">
        <div className={cn("text-xs font-bold", riskText(repo.avgRiskScore))}>{repo.avgRiskScore}</div>
        <div className="text-[10px] text-muted-foreground">{riskLabel(repo.avgRiskScore)}</div>
      </div>
      {active && <ChevronRight className="w-3 h-3 text-primary shrink-0" />}
    </button>
  );
}

// ─── Main Studio page ────────────────────────────────────────────────────────

export default function Studio() {
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);

  const { data: summary } = useGetDashboardSummary();
  const { data: repos } = useListRepositories();
  const { data: repo } = useGetRepository(selectedRepoId ?? 0, {
    query: {
      queryKey: getGetRepositoryQueryKey(selectedRepoId ?? 0),
      enabled: selectedRepoId !== null,
    },
  });
  const { data: files, isLoading: filesLoading } = useListFiles(selectedRepoId ?? 0, {
    query: {
      queryKey: getListFilesQueryKey(selectedRepoId ?? 0),
      enabled: selectedRepoId !== null,
    },
  });

  // Auto-select first repo once list loads
  useMemo(() => {
    if (repos && repos.length > 0 && selectedRepoId === null) {
      setSelectedRepoId(repos[repos.length - 1].id);
    }
  }, [repos, selectedRepoId]);

  const handleRepoSelect = (id: number) => {
    setSelectedRepoId(id);
    setSelectedFile(null);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left dashboard panel ──────────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-border bg-card overflow-hidden">
        {/* Summary stats */}
        <div className="px-4 py-4 border-b border-border space-y-3">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Fleet Overview</div>
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={Database} label="Repos" value={summary?.totalRepositories ?? "—"} cls="text-blue-400" />
            <Stat icon={FileText} label="Files" value={summary ? (summary.totalFiles).toLocaleString() : "—"} />
            <Stat
              icon={AlertTriangle}
              label="High Risk"
              value={summary?.totalHighRiskFiles ?? "—"}
              cls="text-red-400"
            />
            <Stat
              icon={Shield}
              label="Avg Risk"
              value={summary?.avgRiskScore ?? "—"}
              cls={summary ? riskText(summary.avgRiskScore) : undefined}
            />
          </div>
          {summary && (
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span className="flex items-center gap-1"><TestTube className="w-3 h-3 text-green-400" /> Coverage</span>
                <span className="text-green-400 font-medium">{summary.avgTestCoverage}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div className="bg-green-400 h-1.5 rounded-full" style={{ width: `${summary.avgTestCoverage}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Repo list */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 pt-3 pb-1">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Repositories</div>
          </div>
          {repos && repos.length > 0 ? (
            <div className="px-2 pb-2 space-y-1">
              {[...repos].reverse().map((r) => (
                <RepoRow
                  key={r.id}
                  repo={r}
                  active={selectedRepoId === r.id}
                  onClick={() => handleRepoSelect(r.id)}
                />
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">No repositories yet</p>
            </div>
          )}
        </div>

        {/* Selected repo stats */}
        {repo && (
          <div className="border-t border-border px-4 py-3 space-y-2 shrink-0">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {repo.name}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
              {[
                { label: "Lines", value: repo.linesOfCode.toLocaleString() },
                { label: "Authors", value: String(repo.authors) },
                { label: "Risky", value: `${repo.riskyFiles} (${repo.riskyFilesPercent}%)`, red: true },
                { label: "Last commit", value: repo.lastCommit },
              ].map(({ label, value, red }) => (
                <div key={label}>
                  <div className="text-muted-foreground">{label}</div>
                  <div className={cn("font-medium", red ? "text-red-400" : "text-foreground")}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── Center 3D canvas ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 relative flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 h-10 border-b border-border bg-card/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-2">
            {repo ? (
              <>
                <span className="text-xs font-semibold text-foreground">{repo.name}</span>
                {repo.isPublic && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-400/10 text-blue-400 border border-blue-400/20 rounded-full">
                    Public
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Select a repository to visualize</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="hidden sm:flex items-center gap-1"><Box className="w-3 h-3" /> Drag to orbit · Scroll to zoom</span>
            {repo && <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> {repo.lastAnalyzed}</span>}
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 min-h-0 relative">
          {!selectedRepoId ? (
            <div className="flex h-full items-center justify-center bg-[#060a14]">
              <div className="text-center">
                <Box className="w-10 h-10 text-primary/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Select a repository from the left panel</p>
              </div>
            </div>
          ) : filesLoading ? (
            <div className="flex h-full items-center justify-center bg-[#060a14]">
              <div className="text-center">
                <RefreshCw className="w-6 h-6 text-primary animate-spin mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Loading visualization…</p>
              </div>
            </div>
          ) : files && files.length > 0 ? (
            <CityScene3D
              files={files}
              onFileClick={setSelectedFile}
              selectedId={selectedFile?.id ?? null}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-[#060a14]">
              <p className="text-sm text-muted-foreground">No files to visualize</p>
            </div>
          )}

          {/* Bottom stats bar */}
          {repo && (
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-5 px-4 py-2 bg-black/70 backdrop-blur border-t border-border/40 text-[11px] flex-wrap">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Files: <span className="text-foreground font-medium">{repo.totalFiles.toLocaleString()}</span></span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span>High Risk: <span className="text-red-400 font-medium">{repo.riskyFiles} ({repo.riskyFilesPercent}%)</span></span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>Avg Risk: <span className={cn("font-medium", riskText(repo.avgRiskScore))}>{repo.avgRiskScore}</span></span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <TestTube className="w-3.5 h-3.5 text-green-400" />
                <span>Coverage: <span className="text-green-400 font-medium">{repo.testCoverage}%</span></span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="w-3.5 h-3.5 text-purple-400" />
                <span>Tech Debt: <span className="text-foreground font-medium">{repo.technicalDebt}</span></span>
              </div>
              {selectedFile && (
                <div className="ml-auto flex items-center gap-1.5 text-blue-400 animate-pulse">
                  <Star className="w-3.5 h-3.5" />
                  <span>{selectedFile.name} selected</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right file inspector ─────────────────────────────────────── */}
      {selectedFile && selectedRepoId && (
        <aside className="w-64 shrink-0 border-l border-border bg-card overflow-hidden flex flex-col">
          <FilePanel
            repoId={selectedRepoId}
            fileId={selectedFile.id}
            onClose={() => setSelectedFile(null)}
          />
        </aside>
      )}
    </div>
  );
}
