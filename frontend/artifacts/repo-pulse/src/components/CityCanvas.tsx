import { useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Html,
  Environment,
  Lightformer,
  MeshReflectorMaterial,
  Grid,
  RoundedBox,
  SoftShadows,
  Sparkles,
} from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { FileNode } from "@workspace/api-client-react";

export type ColorMode = "risk" | "hotspot" | "churn" | "complexity" | "coverage";

// Extended metrics the backend now returns but that aren't in the generated
// FileNode type yet. Accessed defensively so older payloads still render.
type ExtMetrics = {
  hotspotScore: number;
  bugCommits: number;
  ageDays: number;
  todoMarkers: number;
  functionCount: number;
};
export function ext(file: FileNode): Partial<ExtMetrics> {
  return file as FileNode & Partial<ExtMetrics>;
}

// Normalized metric value in [0,1] for the active "Color by" mode.
function metricT(file: FileNode, mode: ColorMode): number {
  switch (mode) {
    case "hotspot": return Math.min(1, ext(file).hotspotScore ?? 0);
    case "churn": return Math.min(1, file.churnCommits / 100);
    case "complexity": return Math.min(1, file.complexity / 30);
    case "coverage": return 1 - file.testCoverage / 100; // low coverage = hot
    case "risk":
    default: return file.riskScore;
  }
}

function scaleToHex(t: number): string {
  // t in [0,1]: green → yellow → orange → red
  if (t < 0.3) return "#22c55e";
  if (t < 0.5) return "#eab308";
  if (t < 0.7) return "#f97316";
  return "#ef4444";
}

// Map a file to a color based on the active "Color by" metric.
export function metricHex(file: FileNode, mode: ColorMode): string {
  return scaleToHex(metricT(file, mode));
}

// Procedural "lit windows" texture used as an emissiveMap so buildings read as
// glass towers at night rather than solid glowing blocks. Cached by
// (variant, rows) so a few hundred buildings share ~30 GPU textures.
const windowTexCache = new Map<string, THREE.CanvasTexture>();
function getWindowTexture(variant: number, rows: number): THREE.CanvasTexture {
  const key = `${variant}:${rows}`;
  const cached = windowTexCache.get(key);
  if (cached) return cached;

  const cols = 4;
  const cell = 16;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000"; // black = no emission (dark facade)
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Deterministic PRNG so each variant has a stable lit-window pattern.
  let seed = (variant + 1) * 99991;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const pad = 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rnd() > 0.32;
      const v = lit ? 0.55 + rnd() * 0.45 : 0.05;
      ctx.fillStyle = `rgba(255,255,255,${v})`;
      ctx.fillRect(c * cell + pad, r * cell + pad, cell - pad * 2, cell - pad * 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  windowTexCache.set(key, tex);
  return tex;
}

function Building({
  file,
  colorBy,
  position,
  selected,
  hovered,
  bevel,
  onPointerOver,
  onPointerOut,
  onClick,
}: {
  file: FileNode;
  colorBy: ColorMode;
  position: [number, number, number];
  selected: boolean;
  hovered: boolean;
  bevel: boolean;
  onPointerOver: () => void;
  onPointerOut: () => void;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const t = metricT(file, colorBy);
  const color = scaleToHex(t);
  const height = Math.max(0.3, (file.churnCommits / 100) * 4);
  const baseSize = Math.max(0.3, (file.linesOfCode / 800) * 0.8);
  // Only the lit windows glow now (via emissiveMap), so push intensity higher
  // than the old solid-glow value to keep the bloom pass reading hot.
  const baseEmissive = 0.6 + t * 1.7;

  // Window rows scale with building height; emissive only on lit windows.
  const winRows = Math.min(14, Math.max(2, Math.round(height * 2)));
  const windowTex = useMemo(() => getWindowTexture(file.id % 6, winRows), [file.id, winRows]);
  // Dark, risk-tinted glass facade so the lit windows pop against it.
  const facade = useMemo(() => new THREE.Color(color).multiplyScalar(0.22).getStyle(), [color]);

  useFrame(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    const target = selected ? baseEmissive + 1.6 : hovered ? baseEmissive + 0.8 : baseEmissive;
    mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, target, 0.12);
  });

  const args: [number, number, number] = [baseSize, height, baseSize];
  const material = (
    <meshStandardMaterial
      color={facade}
      emissive={color}
      emissiveMap={windowTex}
      emissiveIntensity={baseEmissive}
      roughness={0.28}
      metalness={0.62}
      envMapIntensity={1.0}
    />
  );
  const common = {
    ref: meshRef as never,
    position: [position[0], height / 2, position[2]] as [number, number, number],
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onPointerOver(); },
    onPointerOut: onPointerOut,
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onClick(); },
    castShadow: true,
    receiveShadow: true,
  };

  // RoundedBox gives soft beveled edges; fall back to plain box when heavy.
  return bevel ? (
    <RoundedBox {...common} args={args} radius={0.045} smoothness={2}>
      {material}
    </RoundedBox>
  ) : (
    <mesh {...common}>
      <boxGeometry args={args} />
      {material}
    </mesh>
  );
}

function District({
  dir,
  buildings,
  colorBy,
  bevel,
  offsetX,
  offsetZ,
  onBuildingClick,
  selectedId,
}: {
  dir: string;
  buildings: FileNode[];
  colorBy: ColorMode;
  bevel: boolean;
  offsetX: number;
  offsetZ: number;
  onBuildingClick: (f: FileNode) => void;
  selectedId: number | null;
}) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const cols = Math.max(1, Math.ceil(Math.sqrt(buildings.length)));
  const spacing = 1.2;
  const size = Math.max(3, cols * spacing + 1.5);
  const avgRisk = buildings.length ? buildings.reduce((a, b) => a + b.riskScore, 0) / buildings.length : 0;

  return (
    <group position={[offsetX, 0, offsetZ]}>
      {/* District platform */}
      <mesh position={[0, -0.04, 0]} receiveShadow>
        <boxGeometry args={[size, 0.08, size]} />
        <meshStandardMaterial
          color="#0b1020"
          roughness={0.55}
          metalness={0.45}
          emissive={scaleToHex(avgRisk)}
          emissiveIntensity={0.05}
          envMapIntensity={0.5}
        />
      </mesh>
      <Html position={[0, 0.5, -size / 2 - 0.5]} center distanceFactor={14}>
        <div style={{ pointerEvents: "none", userSelect: "none", whiteSpace: "nowrap", padding: "2px 7px", borderRadius: 5, fontSize: 11, fontWeight: 700, letterSpacing: 0.2, color: "#6ee7b7", backgroundColor: "rgba(7,10,18,0.82)", border: "1px solid rgba(52,211,153,0.25)", backdropFilter: "blur(4px)" }}>
          {dir || "root"}
        </div>
      </Html>
      {buildings.map((file, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const bx = (col - (cols - 1) / 2) * spacing;
        const bz = (row - (cols - 1) / 2) * spacing;
        return (
          <Building
            key={file.id}
            file={file}
            colorBy={colorBy}
            bevel={bevel}
            position={[bx, 0, bz]}
            selected={selectedId === file.id}
            hovered={hoveredId === file.id}
            onPointerOver={() => setHoveredId(file.id)}
            onPointerOut={() => setHoveredId(null)}
            onClick={() => onBuildingClick(file)}
          />
        );
      })}
    </group>
  );
}

export default function CityCanvas({
  files,
  onFileClick,
  selectedId,
  colorBy = "risk",
}: {
  files: FileNode[];
  onFileClick: (f: FileNode) => void;
  selectedId: number | null;
  colorBy?: ColorMode;
}) {
  const filesByDir = useMemo(() => {
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

  const positions = useMemo(() => {
    const spacing = 9;
    const cols = Math.ceil(Math.sqrt(filesByDir.length));
    return filesByDir.map((_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return [(col - (cols - 1) / 2) * spacing, (row - (cols - 1) / 2) * spacing] as [number, number];
    });
  }, [filesByDir]);

  // Perf guard: scale fidelity down for large repos.
  const totalBuildings = useMemo(() => files.filter((f) => !f.isDirectory).length, [files]);
  const heavy = totalBuildings > 500;
  const reflectorRes = heavy ? 512 : 1024;
  const bevel = !heavy;

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [13, 13, 13], fov: 42 }}
      style={{ width: "100%", height: "100%" }}
      gl={{
        antialias: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.15,
      }}
    >
      <color attach="background" args={["#05070f"]} />
      <fogExp2 attach="fog" args={["#05070f", 0.021]} />

      {!heavy && <SoftShadows size={26} samples={10} focus={0.7} />}

      {/* Lighting — soft key light + image-based reflections (no network HDRI) */}
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[12, 22, 8]}
        intensity={1.1}
        castShadow
        shadow-mapSize={heavy ? [1024, 1024] : [2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
      <Environment resolution={256}>
        <Lightformer intensity={1.4} position={[0, 8, 0]} scale={[12, 12, 1]} color="#bcd4ff" />
        <Lightformer intensity={0.8} position={[-8, 4, -6]} scale={[6, 8, 1]} color="#34d399" />
        <Lightformer intensity={0.7} position={[8, 3, 6]} scale={[6, 8, 1]} color="#60a5fa" />
      </Environment>

      <Sparkles count={36} scale={[44, 14, 44]} position={[0, 6, 0]} size={2} speed={0.25} opacity={0.35} color="#6ee7b7" />

      {/* Reflective floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <MeshReflectorMaterial
          resolution={reflectorRes}
          mirror={0.45}
          blur={[400, 120]}
          mixBlur={1.2}
          mixStrength={3}
          roughness={0.9}
          depthScale={1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color="#080b14"
          metalness={0.55}
        />
      </mesh>

      {/* Faint structural grid above the reflection */}
      <Grid
        position={[0, -0.24, 0]}
        args={[160, 160]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.5}
        cellColor="#15304a"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#1f6f54"
        fadeDistance={48}
        fadeStrength={1.5}
      />

      {filesByDir.map(([dir, buildings], i) => (
        <District
          key={dir}
          dir={dir}
          buildings={buildings}
          colorBy={colorBy}
          bevel={bevel}
          offsetX={positions[i][0]}
          offsetZ={positions[i][1]}
          onBuildingClick={onFileClick}
          selectedId={selectedId}
        />
      ))}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={4}
        maxDistance={55}
        maxPolarAngle={Math.PI / 2.05}
      />

      <EffectComposer enableNormalPass={false}>
        <Bloom intensity={0.85} luminanceThreshold={0.25} luminanceSmoothing={0.85} mipmapBlur radius={0.7} />
        <Vignette offset={0.25} darkness={0.72} />
      </EffectComposer>
    </Canvas>
  );
}
