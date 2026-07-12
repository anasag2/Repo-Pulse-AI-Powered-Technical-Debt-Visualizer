import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Share2 } from "lucide-react";
import type { FileNode } from "@workspace/api-client-react";
import type { ColorMode } from "@/components/CityCanvas";
import { getToken } from "@/lib/auth";

// Coupling endpoint isn't in the generated client, so fetch it directly.
interface CouplingPair {
  fileAId: number; fileBId: number;
  fileA: string; fileB: string;
  pathA: string; pathB: string;
  coChanges: number; degree: number;
}

// Local metric→color (vibrant scale, matches CityCanvas) — kept here so this 2D
// view never pulls in the three.js bundle.
function riskToHex(score: number): string {
  if (score < 0.25) return "#22c55e";
  if (score < 0.45) return "#84cc16";
  if (score < 0.60) return "#eab308";
  if (score < 0.78) return "#f97316";
  return "#ef4444";
}
function metricHex(file: FileNode | undefined, mode: ColorMode): string {
  if (!file) return "#64748b";
  switch (mode) {
    case "hotspot": return riskToHex(Math.min(1, (file as FileNode & { hotspotScore?: number }).hotspotScore ?? 0));
    case "churn": return riskToHex(Math.min(1, file.churnCommits / 100));
    case "complexity": return riskToHex(Math.min(1, file.complexity / 30));
    case "coverage": return riskToHex(1 - file.testCoverage / 100);
    case "risk":
    default: return riskToHex(file.riskScore);
  }
}

const W = 1000;
const H = 700;

type GraphNode = { id: number; name: string; path: string; file?: FileNode; degree: number };
type GraphEdge = { a: number; b: number; coChanges: number; degree: number };

function buildGraph(pairs: CouplingPair[], files: FileNode[]) {
  const byId = new Map(files.map((f) => [f.id, f]));
  const nodes = new Map<number, GraphNode>();
  const ensure = (id: number, name: string, path: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, name, path, file: byId.get(id), degree: 0 });
    return nodes.get(id)!;
  };
  const edges: GraphEdge[] = [];
  for (const p of pairs) {
    const a = ensure(p.fileAId, p.fileA, p.pathA);
    const b = ensure(p.fileBId, p.fileB, p.pathB);
    a.degree += 1; b.degree += 1;
    edges.push({ a: p.fileAId, b: p.fileBId, coChanges: p.coChanges, degree: p.degree });
  }
  return { nodes: [...nodes.values()], edges };
}

// Deterministic force-directed layout (Eades-style), run to convergence once and
// then fit to the viewBox. Small graphs (≤~100 nodes) settle quickly.
function computeLayout(nodes: GraphNode[], edges: GraphEdge[]): Map<number, { x: number; y: number }> {
  const pos = new Map<number, { x: number; y: number; vx: number; vy: number }>();
  const n = nodes.length;
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, n);
    pos.set(node.id, { x: 500 + Math.cos(angle) * 250, y: 350 + Math.sin(angle) * 250, vx: 0, vy: 0 });
  });
  if (n === 0) return new Map();

  const REP = 9000, SPRING = 0.015, REST = 90, CENTER = 0.01, STEP = 0.85, ITER = 420;
  for (let it = 0; it < ITER; it++) {
    const cool = 1 - it / ITER;
    for (const node of nodes) {
      const pa = pos.get(node.id)!;
      let fx = 0, fy = 0;
      // repulsion
      for (const other of nodes) {
        if (other.id === node.id) continue;
        const pb = pos.get(other.id)!;
        let dx = pa.x - pb.x, dy = pa.y - pb.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.01; }
        const f = REP / d2;
        const d = Math.sqrt(d2);
        fx += (dx / d) * f; fy += (dy / d) * f;
      }
      // centering
      fx += (500 - pa.x) * CENTER; fy += (350 - pa.y) * CENTER;
      pa.vx = (pa.vx + fx) * 0.5; pa.vy = (pa.vy + fy) * 0.5;
    }
    // springs
    for (const e of edges) {
      const pa = pos.get(e.a)!, pb = pos.get(e.b)!;
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const d = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
      const f = (d - REST) * SPRING;
      const ux = (dx / d) * f, uy = (dy / d) * f;
      pa.vx += ux; pa.vy += uy; pb.vx -= ux; pb.vy -= uy;
    }
    for (const node of nodes) {
      const p = pos.get(node.id)!;
      p.x += p.vx * STEP * cool; p.y += p.vy * STEP * cool;
    }
  }

  // Fit to viewBox with padding.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pos.values()) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const pad = 60;
  const sx = (W - 2 * pad) / Math.max(1, maxX - minX);
  const sy = (H - 2 * pad) / Math.max(1, maxY - minY);
  const s = Math.min(sx, sy);
  const out = new Map<number, { x: number; y: number }>();
  for (const [id, p] of pos) out.set(id, { x: pad + (p.x - minX) * s, y: pad + (p.y - minY) * s });
  return out;
}

export default function CouplingGraph({
  repoId, files, onFileClick, selectedId, colorBy,
}: {
  repoId: number;
  files: FileNode[];
  onFileClick: (f: FileNode) => void;
  selectedId: number | null;
  colorBy: ColorMode;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const { data: pairs, isLoading, isError } = useQuery({
    queryKey: ["coupling", repoId],
    queryFn: async (): Promise<CouplingPair[]> => {
      const token = getToken();
      const res = await fetch(`/api/repositories/${repoId}/coupling`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Coupling request failed (${res.status})`);
      return res.json();
    },
  });

  const { nodes, edges } = useMemo(() => buildGraph(pairs ?? [], files), [pairs, files]);
  const layout = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);
  const maxCo = useMemo(() => Math.max(1, ...edges.map((e) => e.coChanges)), [edges]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0f17]">
        <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0f17] text-sm text-muted-foreground">
        Couldn't load coupling data.
      </div>
    );
  }
  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#0a0f17] text-center px-6">
        <Share2 className="w-7 h-7 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">No temporal coupling found</p>
        <p className="text-[11px] text-muted-foreground/70 max-w-xs">
          Files that repeatedly change together will appear here once there's enough shared commit history.
        </p>
      </div>
    );
  }

  const neighbors = (id: number) =>
    new Set(edges.filter((e) => e.a === id || e.b === id).flatMap((e) => [e.a, e.b]));
  const active = hovered != null ? neighbors(hovered) : null;

  return (
    <div className="h-full w-full bg-[#0a0f17]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* Edges */}
        {edges.map((e, i) => {
          const pa = layout.get(e.a), pb = layout.get(e.b);
          if (!pa || !pb) return null;
          const dim = active != null && !(active.has(e.a) && active.has(e.b));
          return (
            <line
              key={i}
              x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
              stroke="#3b82f6"
              strokeWidth={0.6 + (e.coChanges / maxCo) * 3.2}
              strokeOpacity={dim ? 0.05 : 0.12 + e.degree * 0.5}
            />
          );
        })}
        {/* Nodes */}
        {nodes.map((node) => {
          const p = layout.get(node.id);
          if (!p) return null;
          const r = Math.min(18, 5 + Math.sqrt(node.degree) * 2.4);
          const isSel = selectedId === node.id;
          const isHov = hovered === node.id;
          const dim = active != null && !active.has(node.id);
          const showLabel = isSel || isHov || node.degree >= 4;
          return (
            <g
              key={node.id}
              transform={`translate(${p.x},${p.y})`}
              style={{ cursor: node.file ? "pointer" : "default", opacity: dim ? 0.25 : 1 }}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => node.file && onFileClick(node.file)}
            >
              <circle
                r={r}
                fill={metricHex(node.file, colorBy)}
                stroke={isSel ? "#ffffff" : isHov ? "#ffffff99" : "#0a0f17"}
                strokeWidth={isSel ? 2.5 : 1.5}
              />
              {showLabel && (
                <text
                  x={0} y={-r - 4}
                  textAnchor="middle"
                  fontSize={12}
                  fontFamily="monospace"
                  fill="#cbd5e1"
                  style={{ pointerEvents: "none" }}
                >
                  {node.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
