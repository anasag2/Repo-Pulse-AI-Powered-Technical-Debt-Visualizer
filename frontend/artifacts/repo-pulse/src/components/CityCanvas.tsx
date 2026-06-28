import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Grid, RoundedBox, Sparkles } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { FileNode } from "@workspace/api-client-react";

export type ColorMode = "risk" | "hotspot" | "churn" | "complexity" | "coverage";

type ExtMetrics = { hotspotScore: number; bugCommits: number; ageDays: number; todoMarkers: number; functionCount: number };
export function ext(file: FileNode): Partial<ExtMetrics> { return file as FileNode & Partial<ExtMetrics>; }

function metricT(file: FileNode, mode: ColorMode): number {
  switch (mode) {
    case "hotspot":    return Math.min(1, ext(file).hotspotScore ?? 0);
    case "churn":      return Math.min(1, file.churnCommits / 100);
    case "complexity": return Math.min(1, file.complexity / 30);
    case "coverage":   return 1 - file.testCoverage / 100;
    case "risk":
    default:           return file.riskScore;
  }
}

// Vibrant-but-not-neon sequential scale: green → lime → yellow → orange → red.
// Tailwind-500 family — lively and full of life, and matches the toolbar legend.
function scaleToHex(t: number): string {
  if (t < 0.25) return "#22c55e"; // green
  if (t < 0.45) return "#84cc16"; // lime
  if (t < 0.60) return "#eab308"; // yellow
  if (t < 0.78) return "#f97316"; // orange
  return "#ef4444";               // red
}

export function metricHex(file: FileNode, mode: ColorMode): string { return scaleToHex(metricT(file, mode)); }

// ─── Treemap layout ──────────────────────────────────────────────────────────

type Rect = { x: number; z: number; w: number; d: number };
type TreeNode = { name: string; path: string; file?: FileNode; children: TreeNode[]; weight: number };

function buildTree(files: FileNode[]): TreeNode {
  const root: TreeNode = { name: "root", path: "", children: [], weight: 0 };
  for (const f of files) {
    if (f.isDirectory) continue;
    const parts = f.path.split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      let child = node.children.find((c) => !c.file && c.name === seg);
      if (!child) {
        child = { name: seg, path: parts.slice(0, i + 1).join("/"), children: [], weight: 0 };
        node.children.push(child);
      }
      node = child;
    }
    node.children.push({ name: f.name, path: f.path, file: f, children: [], weight: Math.max(1, f.linesOfCode) });
  }
  const compute = (n: TreeNode): number => {
    if (n.file) return n.weight;
    n.weight = n.children.reduce((s, c) => s + compute(c), 0) || 1;
    return n.weight;
  };
  compute(root);
  return root;
}

// Squarified treemap (Bruls, Huizing, van Wijk): lay weighted items into a rect
// with good aspect ratios. Returns one rect per item.
function squarify<T>(items: { weight: number; data: T }[], rect: Rect): { data: T; rect: Rect }[] {
  const out: { data: T; rect: Rect }[] = [];
  const sorted = items.filter((i) => i.weight > 0).sort((a, b) => b.weight - a.weight);
  const total = sorted.reduce((s, i) => s + i.weight, 0);
  if (total <= 0 || rect.w <= 0 || rect.d <= 0) return out;
  const scale = (rect.w * rect.d) / total;

  let free: Rect = { ...rect };
  let row: { weight: number; data: T }[] = [];

  const worst = (r: { weight: number }[], side: number): number => {
    if (!r.length) return Infinity;
    const areas = r.map((i) => i.weight * scale);
    const sum = areas.reduce((a, b) => a + b, 0);
    const s2 = side * side;
    return Math.max((s2 * Math.max(...areas)) / (sum * sum), (sum * sum) / (s2 * Math.min(...areas)));
  };

  const layoutRow = (r: { weight: number; data: T }[]) => {
    const sum = r.reduce((a, b) => a + b.weight, 0) * scale;
    if (free.w >= free.d) {
      const stripW = sum / free.d;
      let z = free.z;
      for (const it of r) {
        const h = (it.weight * scale) / stripW;
        out.push({ data: it.data, rect: { x: free.x, z, w: stripW, d: h } });
        z += h;
      }
      free = { x: free.x + stripW, z: free.z, w: free.w - stripW, d: free.d };
    } else {
      const stripH = sum / free.w;
      let x = free.x;
      for (const it of r) {
        const w = (it.weight * scale) / stripH;
        out.push({ data: it.data, rect: { x, z: free.z, w, d: stripH } });
        x += w;
      }
      free = { x: free.x, z: free.z + stripH, w: free.w, d: free.d - stripH };
    }
  };

  for (const item of sorted) {
    const side = Math.min(free.w, free.d);
    const withItem = [...row, item];
    if (!row.length || worst(withItem, side) <= worst(row, side)) row = withItem;
    else { layoutRow(row); row = [item]; }
  }
  if (row.length) layoutRow(row);
  return out;
}

type PlacedBuilding = { file: FileNode; rect: Rect; depth: number };
type PlacedFolder = { name: string; rect: Rect; depth: number };

function layoutTree(
  node: TreeNode, rect: Rect, depth: number, pad: number,
  buildings: PlacedBuilding[], folders: PlacedFolder[],
) {
  const placed = squarify(node.children.map((c) => ({ weight: c.weight, data: c })), rect);
  for (const { data: child, rect: r } of placed) {
    if (child.file) {
      buildings.push({ file: child.file, rect: r, depth });
    } else {
      folders.push({ name: child.name, rect: r, depth });
      const inset: Rect = {
        x: r.x + pad, z: r.z + pad,
        w: Math.max(0.01, r.w - 2 * pad), d: Math.max(0.01, r.d - 2 * pad),
      };
      layoutTree(child, inset, depth + 1, Math.max(0.04, pad * 0.7), buildings, folders);
    }
  }
}

// ─── Building ────────────────────────────────────────────────────────────────

function Building({
  file, colorBy, cx, cz, w, d, heightUnit, heightScale,
  selected, hovered, bevel, animationProgress, pulse, onPointerOver, onPointerOut, onClick,
}: {
  file: FileNode; colorBy: ColorMode;
  cx: number; cz: number; w: number; d: number; heightUnit: number; heightScale: number;
  selected: boolean; hovered: boolean; bevel: boolean; animationProgress: number; pulse: boolean;
  onPointerOver: () => void; onPointerOut: () => void; onClick: () => void;
}) {
  const t = metricT(file, colorBy);
  const color = scaleToHex(t);

  const churnT = Math.min(1.5, file.churnCommits / heightScale);
  const height = Math.max(0.18, (0.22 + churnT) * heightUnit * (1 + file.riskScore * 0.6)) * animationProgress;

  // A gentle base self-glow gives every building some life; it ramps up for hot
  // files, and selection/hover add a controlled highlight.
  const emissive = 0.14 + Math.max(0, t - 0.45) * 0.85 + (selected ? 0.9 : hovered ? 0.5 : 0);

  // Hotspots get a slow "heartbeat" on their glow — the on-brand Repo-Pulse beat,
  // kept subtle. Only hot buildings do per-frame work (see `pulse` from the scene).
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const phase = (file.id % 97) * 0.37;
  useFrame(({ clock }) => {
    const m = matRef.current;
    if (!m || !pulse) return;
    m.emissiveIntensity = emissive + Math.max(0, Math.sin(clock.elapsedTime * 1.8 + phase)) * 0.7;
  });

  const fw = Math.max(0.05, w * 0.84);
  const fd = Math.max(0.05, d * 0.84);
  const args: [number, number, number] = [fw, height, fd];

  const common = {
    position: [cx, height / 2, cz] as [number, number, number],
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onPointerOver(); },
    onPointerOut,
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onClick(); },
    castShadow: true,
    receiveShadow: true,
  };
  const material = (
    <meshStandardMaterial
      ref={matRef}
      color={color}
      emissive={color}
      emissiveIntensity={emissive}
      roughness={0.55}
      metalness={0.18}
    />
  );

  return bevel
    ? <RoundedBox {...common} args={args} radius={0.04} smoothness={2}>{material}</RoundedBox>
    : <mesh {...common}><boxGeometry args={args} />{material}</mesh>;
}

// ─── Atmosphere (prototype) ──────────────────────────────────────────────────

// Vertical gradient backdrop so the sky isn't an empty void — deep navy up top,
// a touch warmer/lighter toward the horizon (where the fog + skyline sit).
function GradientSky() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color("#0a1322") },
          horizon: { value: new THREE.Color("#16273d") },
          glow: { value: new THREE.Color("#27557f") },
        },
        vertexShader:
          "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "varying vec3 vDir; uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; void main(){ float h = vDir.y; float t = clamp(h * 0.5 + 0.5, 0.0, 1.0); vec3 base = mix(horizon, top, pow(t, 0.85)); float band = exp(-pow((h - 0.015) / 0.05, 2.0)); gl_FragColor = vec4(base + glow * band, 1.0); }",
      }),
    [],
  );
  return (
    <mesh material={material} frustumCulled={false}>
      <sphereGeometry args={[900, 32, 16]} />
    </mesh>
  );
}

// Dense concentric bands of distant skyscraper silhouettes on the horizon, so the
// code city sits inside a larger metropolis instead of an endless plane. Static
// and cheap; the scene fog hazes them in. A fraction are "lit" (warm windows) so
// the horizon reads as a living city at night.
function DistantSkyline({ side }: { side: number }) {
  const boxes = useMemo(() => {
    let seed = 1337;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const arr: { pos: [number, number, number]; size: [number, number, number]; lit: number }[] = [];
    // near → far: a low dense "inner ridge" of outskirts just past the code city,
    // rising to a taller downtown and the far horizon skyline. Radii are × side.
    const bands = [
      { rad: 0.95, count: 54, hMin: 1.2, hMax: 5 },
      { rad: 1.20, count: 66, hMin: 2, hMax: 9 },
      { rad: 1.55, count: 84, hMin: 3, hMax: 15 },
      { rad: 1.95, count: 104, hMin: 4, hMax: 19 },
    ];
    for (const b of bands) {
      for (let i = 0; i < b.count; i++) {
        const ang = (i / b.count) * Math.PI * 2 + rnd() * ((Math.PI * 2) / b.count);
        const r = side * b.rad * (0.96 + rnd() * 0.09);
        const h = b.hMin + rnd() * (b.hMax - b.hMin);
        const w = 0.9 + rnd() * 2.0;
        const lit = rnd() < 0.15 ? 0.45 + rnd() * 0.55 : 0.1; // a few windows lit
        arr.push({ pos: [Math.cos(ang) * r, h / 2, Math.sin(ang) * r], size: [w, h, w * (0.7 + rnd() * 0.6)], lit });
      }
    }
    return arr;
  }, [side]);

  return (
    <group>
      {boxes.map((b, i) => (
        <mesh key={i} position={b.pos}>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color="#0a1019" emissive="#d9b06a" emissiveIntensity={b.lit} roughness={1} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Scene ───────────────────────────────────────────────────────────────────

function CityScene({
  files, colorBy, onFileClick, selectedId,
}: {
  files: FileNode[]; colorBy: ColorMode; onFileClick: (f: FileNode) => void; selectedId: number | null;
}) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const animRef = useRef(0);
  const [anim, setAnim] = useState(0);

  const buildingCount = useMemo(() => files.filter((f) => !f.isDirectory).length, [files]);
  const heavy = buildingCount > 700;
  const bevel = !heavy;

  // Side length of the city scales gently with file count.
  const side = useMemo(() => Math.min(70, Math.max(14, Math.sqrt(Math.max(1, buildingCount)) * 1.7)), [buildingCount]);
  const heightUnit = Math.min(4, Math.max(0.9, side * 0.05));

  // 95th-percentile churn → height normalization (robust to a few huge outliers).
  const heightScale = useMemo(() => {
    const arr = files.filter((f) => !f.isDirectory).map((f) => f.churnCommits).sort((a, b) => a - b);
    return Math.max(8, arr[Math.floor(arr.length * 0.95)] ?? 8);
  }, [files]);

  const { buildings, folders } = useMemo(() => {
    const tree = buildTree(files);
    const b: PlacedBuilding[] = [];
    const f: PlacedFolder[] = [];
    layoutTree(tree, { x: -side / 2, z: -side / 2, w: side, d: side }, 0, side * 0.02, b, f);
    return { buildings: b, folders: f };
  }, [files, side]);

  useFrame(() => {
    if (animRef.current < 1) { animRef.current = Math.min(1, animRef.current + 0.025); setAnim(animRef.current); }
  });

  return (
    <>
      <color attach="background" args={["#0a0f17"]} />
      <GradientSky />
      {/* Haze the grid/buildings/skyline into the horizon instead of hard black */}
      <fog attach="fog" args={["#16273d", side * 1.2, side * 3.0]} />

      <hemisphereLight args={["#cfe0ff", "#0a0f17", 0.75]} />
      <directionalLight
        position={[side * 0.6, side * 0.9, side * 0.4]}
        intensity={1.15}
        castShadow={!heavy}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={side * 4}
        shadow-camera-left={-side}
        shadow-camera-right={side}
        shadow-camera-top={side}
        shadow-camera-bottom={-side}
      />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[side * 3, side * 3]} />
        <meshStandardMaterial color="#0c1320" roughness={0.95} metalness={0.0} />
      </mesh>
      <Grid
        position={[0, 0, 0]}
        args={[side * 3, side * 3]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1d2b3a"
        sectionSize={5}
        sectionThickness={0.8}
        sectionColor="#27405a"
        fadeDistance={side * 2.2}
        fadeStrength={1.4}
      />

      {/* Distant skyline: dense outskirts → downtown → horizon */}
      <DistantSkyline side={side} />

      {/* Folder plates (subtle, depth-tinted) */}
      {folders.map((f, i) => {
        const tint = 0.04 + f.depth * 0.03;
        return (
          <mesh key={`f${i}`} position={[f.rect.x + f.rect.w / 2, 0.005 + f.depth * 0.006, f.rect.z + f.rect.d / 2]} receiveShadow>
            <boxGeometry args={[Math.max(0.02, f.rect.w), 0.01, Math.max(0.02, f.rect.d)]} />
            <meshStandardMaterial color="#122030" transparent opacity={0.5} emissive="#1b2c40" emissiveIntensity={tint} roughness={0.9} />
          </mesh>
        );
      })}

      {/* Top-level folder labels only (keeps DOM light) */}
      {folders.filter((f) => f.depth === 0).map((f, i) => (
        <Html key={`l${i}`} position={[f.rect.x + f.rect.w / 2, 0.5, f.rect.z + 0.2]} center distanceFactor={Math.max(18, side * 0.5)}>
          <div style={{
            color: "#aeb9c8", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            padding: "1px 6px", background: "rgba(10,15,23,0.85)", border: "1px solid #ffffff14",
            borderRadius: 4, pointerEvents: "none", fontFamily: "monospace",
          }}>{f.name}</div>
        </Html>
      ))}

      {/* Buildings */}
      {buildings.map(({ file, rect }) => (
        <Building
          key={file.id}
          file={file}
          colorBy={colorBy}
          cx={rect.x + rect.w / 2}
          cz={rect.z + rect.d / 2}
          w={rect.w}
          d={rect.d}
          heightUnit={heightUnit}
          heightScale={heightScale}
          selected={selectedId === file.id}
          hovered={hoveredId === file.id}
          bevel={bevel}
          animationProgress={anim}
          pulse={!heavy && metricT(file, colorBy) > 0.72}
          onPointerOver={() => setHoveredId(file.id)}
          onPointerOut={() => setHoveredId(null)}
          onClick={() => onFileClick(file)}
        />
      ))}

      {/* Faint drifting particles — a touch of ambient life over the city */}
      <Sparkles count={50} scale={[side * 1.6, 9, side * 1.6]} position={[0, 4.5, 0]} size={3} speed={0.25} opacity={0.35} color="#9fc4e8" />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={side * 3}
        maxPolarAngle={Math.PI * 0.49}
      />

      <EffectComposer enableNormalPass={false}>
        <Bloom intensity={0.55} luminanceThreshold={0.65} luminanceSmoothing={0.4} mipmapBlur radius={0.6} />
        <Vignette offset={0.25} darkness={0.55} />
      </EffectComposer>
    </>
  );
}

export default function CityCanvas({
  files, onFileClick, selectedId, colorBy = "risk",
}: {
  files: FileNode[];
  onFileClick: (f: FileNode) => void;
  selectedId: number | null;
  colorBy?: ColorMode;
}) {
  const buildingCount = useMemo(() => files.filter((f) => !f.isDirectory).length, [files]);
  const side = Math.min(70, Math.max(14, Math.sqrt(Math.max(1, buildingCount)) * 1.7));
  const cam: [number, number, number] = [side * 0.85, side * 0.8, side * 0.85];

  return (
    <Canvas
      shadows={buildingCount <= 700}
      dpr={[1, 1.75]}
      camera={{ position: cam, fov: 42, near: 0.1, far: 2000 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
    >
      <CityScene files={files} colorBy={colorBy} onFileClick={onFileClick} selectedId={selectedId} />
    </Canvas>
  );
}
