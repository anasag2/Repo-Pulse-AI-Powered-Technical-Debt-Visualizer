import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  History as HistoryIcon, GitCommit, ArrowLeft, Loader2, Folder, FolderOpen, FileCode2,
  ChevronRight, ChevronDown, FolderTree, Code2, Search,
} from "lucide-react";
import { useListRepositories, useListFiles, getListFilesQueryKey } from "@workspace/api-client-react";
import type { FileNode } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { isCodeFile } from "@/lib/file-classify";
import { pageEnter, stagger, rise, ease } from "@/lib/motion";
import RepoCardGrid from "@/components/RepoCardGrid";

interface ActivityPoint {
  month: string; commits: number; additions: number; deletions: number; authors: number;
}

function useActivity(repoId: number | null, path: string | null) {
  return useQuery({
    queryKey: ["activity", repoId, path],
    enabled: repoId != null,
    staleTime: 60_000,
    queryFn: async (): Promise<ActivityPoint[]> => {
      const token = getToken();
      const qs = path ? `?path=${encodeURIComponent(path)}` : "";
      const res = await fetch(`/api/repositories/${repoId}/activity${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Activity request failed (${res.status})`);
      return res.json();
    },
  });
}

const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return `${d.toLocaleDateString(undefined, { month: "short" })} '${y.slice(2)}`;
};

// Compact axis labels so big numbers don't get clipped (3750 → "3.8k").
const fmtNum = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1000) return `${(n / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(n);
};

type Series = { key: string; name: string; color: string };

// One area chart. Series render as direct/mapped children (NOT fragment-wrapped —
// recharts silently drops fragment-wrapped series).
function TrendChart({ title, data, series }: {
  title: string; data: Record<string, unknown>[]; series: Series[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card/30 p-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#9aa6b2", fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fill: "#9aa6b2", fontSize: 10 }} width={46} tickFormatter={fmtNum} />
            <Tooltip
              contentStyle={{ background: "#0f1722", border: "1px solid #ffffff22", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#cbd5e1" }}
            />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} fill={`url(#grad-${s.key})`} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <motion.div variants={rise} className="rounded-xl border border-border bg-card/40 p-3">
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </motion.div>
  );
}

// ─── File tree (built from the flat file list) ────────────────────────────────
type TreeNode = { name: string; path: string; isDir: boolean; children: TreeNode[] };

function buildTree(files: FileNode[]): TreeNode {
  const root: TreeNode = { name: "", path: "", isDir: true, children: [] };
  for (const f of files) {
    if (f.isDirectory) continue;
    const parts = f.path.split("/").filter(Boolean);
    let node = root;
    let acc = "";
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      const isLast = i === parts.length - 1;
      let child = node.children.find((c) => c.name === part && c.isDir === !isLast);
      if (!child) { child = { name: part, path: acc, isDir: !isLast, children: [] }; node.children.push(child); }
      node = child;
    });
  }
  const sortRec = (n: TreeNode) => {
    n.children.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)));
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root;
}

function FileTreeNode({ node, depth, selectedPath, onSelect, forceOpen }: {
  node: TreeNode; depth: number; selectedPath: string | null; onSelect: (p: string) => void; forceOpen: boolean;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isOpen = forceOpen || open;
  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ paddingLeft: depth * 10 + 4 }}
          className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          {isOpen ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400/80" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />}
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen && node.children.map((c) => (
          <FileTreeNode key={c.path} node={c} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} forceOpen={forceOpen} />
        ))}
      </div>
    );
  }
  const active = selectedPath === node.path;
  return (
    <button
      onClick={() => onSelect(node.path)}
      style={{ paddingLeft: depth * 10 + 18 }}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition-colors",
        active ? "bg-emerald-500/15 text-emerald-300" : "text-foreground/80 hover:bg-muted/50",
      )}
    >
      <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export default function History() {
  const { data: repos } = useListRepositories();
  const list = repos ?? [];
  // Deep link: the 3D map links here as /history?repo=<id>&path=<file> so a
  // building's "View history" opens straight to that file's trends.
  const initial = new URLSearchParams(window.location.search);
  const [picked, setPicked] = useState<number | null>(() => {
    const p = initial.get("repo");
    return p ? parseInt(p, 10) : null;
  });
  const [selectedPath, setSelectedPath] = useState<string | null>(() => initial.get("path"));
  const [codeOnly, setCodeOnly] = useState(true);
  const [fileSearch, setFileSearch] = useState("");
  const repo = list.find((r) => r.id === picked) ?? null;

  const { data: files } = useListFiles(picked ?? 0, {
    query: { queryKey: getListFilesQueryKey(picked ?? 0), enabled: picked != null },
  });
  const tree = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    const fs = (files ?? []).filter((f) =>
      !f.isDirectory
      && (codeOnly ? isCodeFile(f) : true)
      && (q ? f.path.toLowerCase().includes(q) : true),
    );
    return buildTree(fs);
  }, [files, codeOnly, fileSearch]);

  const { data: activity, isLoading, isError } = useActivity(picked, selectedPath);
  const data = useMemo(() => (activity ?? []).map((p) => ({ ...p, label: fmtMonth(p.month) })), [activity]);

  const summary = useMemo(() => {
    if (!data.length) return null;
    const totalCommits = data.reduce((s, p) => s + p.commits, 0);
    const net = data.reduce((s, p) => s + p.additions - p.deletions, 0);
    const peak = data.reduce((a, b) => (b.commits > a.commits ? b : a));
    return { totalCommits, net, peak, span: `${data[0].label} – ${data[data.length - 1].label}` };
  }, [data]);

  const pickRepo = (id: number) => { setPicked(id); setSelectedPath(null); };

  return (
    <motion.div {...pageEnter} className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-xl font-bold text-foreground">History</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">How a repository — or a single file — has changed over time.</p>

        {list.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border p-12 text-center">
            <HistoryIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-40" />
            <p className="text-sm text-foreground/80">Analyze a repository first, then come back to see its history.</p>
          </div>
        ) : !repo ? (
          <div className="mt-5">
            <RepoCardGrid repos={list} actionLabel="View trends" onPick={pickRepo} />
          </div>
        ) : (
          <div className="mt-5">
            {/* Header */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setPicked(null)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Repositories
              </button>
              <div className="flex items-center gap-2 truncate text-sm">
                <GitCommit className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="font-semibold text-foreground">{repo.name}</span>
                <span className="truncate text-muted-foreground">
                  {selectedPath ? `· ${selectedPath}` : "· whole repository"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[15rem_1fr]">
              {/* File tree sidebar */}
              <aside className="rounded-xl border border-border bg-card/30 p-2 lg:max-h-[72vh] lg:overflow-y-auto">
                <div className="mb-1 flex items-center justify-between gap-2 px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Files</span>
                  <button
                    onClick={() => setCodeOnly((v) => !v)}
                    title={codeOnly ? "Showing only code files — click to include all" : "Showing all files — click for code only"}
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                      codeOnly ? "bg-emerald-500/15 text-emerald-400" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Code2 className="h-3 w-3" /> Code only
                  </button>
                </div>
                <div className="relative mb-2 px-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={fileSearch}
                    onChange={(e) => setFileSearch(e.target.value)}
                    type="search"
                    placeholder="Search files…"
                    className="w-full rounded-md border border-border bg-card/50 py-1.5 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
                    data-testid="input-file-search"
                  />
                </div>
                <button
                  onClick={() => setSelectedPath(null)}
                  className={cn(
                    "mb-1 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs font-medium transition-colors",
                    selectedPath === null ? "bg-emerald-500/15 text-emerald-300" : "text-foreground/90 hover:bg-muted/50",
                  )}
                >
                  <FolderTree className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> Whole repository
                </button>
                {!files ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">Loading files…</div>
                ) : tree.children.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">
                    {fileSearch.trim() ? `No files match “${fileSearch}”.` : "No files."}
                  </div>
                ) : (
                  tree.children.map((c) => (
                    <FileTreeNode key={c.path} node={c} depth={0} selectedPath={selectedPath} onSelect={setSelectedPath} forceOpen={fileSearch.trim().length > 0} />
                  ))
                )}
              </aside>

              {/* Charts */}
              <div>
                {isLoading ? (
                  <div className="flex h-72 items-center justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" /><span className="ml-2 text-sm">Reading history…</span>
                  </div>
                ) : isError || data.length === 0 ? (
                  <div className="flex h-72 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                    <HistoryIcon className="h-6 w-6 opacity-40" />
                    {selectedPath ? "No history for this file in the kept window." : "No history available. Open the repo and hit Refresh to reload its clone."}
                  </div>
                ) : (
                  <>
                    {summary && (
                      <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Stat label="Commits (window)" value={summary.totalCommits.toLocaleString()} />
                        <Stat label="Net lines" value={`${summary.net >= 0 ? "+" : ""}${summary.net.toLocaleString()}`} />
                        <Stat label="Busiest month" value={`${summary.peak.label} (${summary.peak.commits})`} />
                        <Stat label="History span" value={summary.span} />
                      </motion.div>
                    )}

                    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <TrendChart title="Commits per month" data={data} series={[{ key: "commits", name: "Commits", color: "#34d399" }]} />
                      <TrendChart title="Contributors per month" data={data} series={[{ key: "authors", name: "Contributors", color: "#a78bfa" }]} />
                      <div className="xl:col-span-2">
                        <TrendChart
                          title="Code changes per month"
                          data={data}
                          series={[
                            { key: "additions", name: "Added", color: "#34d399" },
                            { key: "deletions", name: "Removed", color: "#f87171" },
                          ]}
                        />
                      </div>
                    </div>

                    <p className="mt-3 text-center text-[10px] text-muted-foreground">
                      Based on the last ~300 commits of history (the depth we keep on disk).
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
