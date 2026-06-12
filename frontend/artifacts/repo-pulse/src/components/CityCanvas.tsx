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

function metricT(file: FileNode, mode: ColorMode): number {
  switch (mode) {
    case "hotspot": return Math.min(1, ext(file).hotspotScore ?? 0);
    case "churn":   return Math.min(1, file.churnCommits / 100);
    case "complexity": return Math.min(1, file.complexity / 30);
    case "coverage": return 1 - file.testCoverage / 100;
    case "risk":
    default: return file.riskScore;
  }
}

// Vivid color scale matching the reference image
function scaleToHex(t: number): string {
  if (t < 0.2) return "#00ff66";
  if (t < 0.4) return "#8cff00";
  if (t < 0.55) return "#ffe600";
  if (t < 0.7) return "#ff9d00";
  if (t < 0.85) return "#ff3300";
  return "#ff00ff";
}

export function metricHex(file: FileNode, mode: ColorMode): string {
  return scaleToHex(metricT(file, mode));
}

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
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let seed = (variant + 1) * 99991;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pad = 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rnd() > 0.3;
      const v = lit ? 0.6 + rnd() * 0.4 : 0.04;
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
  file, colorBy, position, selected, hovered, bevel,
  onPointerOver, onPointerOut, onClick, animationProgress,
}: {
  file: FileNode; colorBy: ColorMode;
  position: [number, number, number];
  selected: boolean; hovered: boolean; bevel: boolean;
  onPointerOver: () => void; onPointerOut: () => void;
  onClick: () => void; animationProgress: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const t = metricT(file, colorBy);
  const color = scaleToHex(t);

  // Height based on churn, capped for visibility
  const riskFactor = Math.pow(file.riskScore, 1.8);

const height =
  Math.max(
    0.8,
    Math.min(
      18,
      (file.linesOfCode / 120) * 0.25 +
      file.complexity * 0.35 +
      file.churnCommits * 0.08 +
      riskFactor * 12
    )
  ) * animationProgress;
  // Width based on lines of code
  const baseSize = Math.max(0.4, Math.min(1.0, (file.linesOfCode / 800)));

  // Strong emissive so colors are vivid and visible
  const emissiveBase = 2.0 + t * 3.5;
  const isHighRisk = file.riskScore > 0.65;
  const isCritical = file.riskScore > 0.85;

  const landmark =
   file.riskScore > 0.9 &&
   file.linesOfCode > 1000;
  const finalHeight = landmark ? height * 2.2 : height; 

  const winRows = Math.min(20, Math.max(3, Math.round(height * 2)));
  const windowTex = useMemo(() => getWindowTexture(file.id % 8, winRows), [file.id, winRows]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    let pulse = 0;
    if (isHighRisk) pulse = (Math.sin(state.clock.elapsedTime * 2.5) * 0.5 + 0.5) * 0.6;
    const target = selected ? emissiveBase + 2.5 : hovered ? emissiveBase + 1.2 : emissiveBase + pulse;
    mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, target, 0.15);
  });

  const args: [number, number, number] = [
  isCritical ? baseSize * 1.4 : baseSize,
  finalHeight,
  isCritical ? baseSize * 1.4 : baseSize,
  ];
  const material = (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveMap={windowTex}
      emissiveIntensity={emissiveBase}
      roughness={0.15}
      metalness={0.75}
      envMapIntensity={1.0}
    />
  );

  const common = {
    ref: meshRef as never,
    position: [position[0], finalHeight / 2, position[2]] as [number, number, number],
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onPointerOver(); },
    onPointerOut,
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onClick(); },
    castShadow: true,
    receiveShadow: true,
  };

  return (
    <>
      {bevel ? (
        <RoundedBox {...common} args={args} radius={0.05} smoothness={3}>{material}</RoundedBox>
      ) : (
        <mesh {...common}><boxGeometry args={args} />{material}</mesh>
      )}
      {/* Glow ring for high risk */}
      {isHighRisk && (
          <mesh position={[position[0], 0.02, position[2]]}>
          <cylinderGeometry
                          args={[
                       baseSize * 1.8,
                          baseSize * 2.2,
                             0.08,
                                   32,
                                         ]}
                                                  />
          <meshBasicMaterial color={color} transparent opacity={0.9} />
        </mesh>
      )}
    </>
  );
}

function District({
  dir, buildings, colorBy, bevel, offsetX, offsetZ,
  onBuildingClick, selectedId, animationProgress,
}: {
  dir: string; buildings: FileNode[]; colorBy: ColorMode;
  bevel: boolean; offsetX: number; offsetZ: number;
  onBuildingClick: (f: FileNode) => void;
  selectedId: number | null; animationProgress: number;
}) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const avgRisk = buildings.length
    ? buildings.reduce((a, b) => a + b.riskScore, 0) / buildings.length : 0;

  // Tight grid — matches reference image density
  const cols = Math.ceil(Math.sqrt(buildings.length));
  const spacing = 0.85;
  const platformSize = Math.max(4.0, cols * spacing + 2.0);
  const platformColor = scaleToHex(avgRisk);

  return (
    <group position={[offsetX, 0, offsetZ]}>
      {/* Platform */}
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <boxGeometry args={[platformSize, 0.12, platformSize]} />
        <meshStandardMaterial
          color="#0d3f20"
          emissive="#00ff66"
          emissiveIntensity={0.35}
          roughness={0.3}
          metalness={0.8}
        />
      </mesh>

      {/* Neon border */}
      {[
        [-platformSize/2, -platformSize/2, platformSize/2, -platformSize/2],
        [platformSize/2, -platformSize/2, platformSize/2, platformSize/2],
        [platformSize/2, platformSize/2, -platformSize/2, platformSize/2],
        [-platformSize/2, platformSize/2, -platformSize/2, -platformSize/2],
      ].map(([x1, z1, x2, z2], idx) => (
        <line key={idx}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([x1, 0.01, z1, x2, 0.01, z2])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color={platformColor} linewidth={2} />
        </line>
      ))}

      {/* District label */}
      <Html position={[0, 0.5, -platformSize / 2 - 0.3]} center distanceFactor={14}>
        <div style={{
         color: "#ffffff",
        fontSize: "14px",
         fontWeight: 600,
         whiteSpace: "nowrap",
        padding: "6px 12px",
        backgroundColor: "#111827",
        border: "1px solid #22c55e",
        borderRadius: "6px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        pointerEvents: "none",
        fontFamily: "Inter, sans-serif",
      }}>
          {dir || "root"} ({buildings.length})
        </div>
      </Html>

      {/* Buildings */}
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
            animationProgress={animationProgress}
          />
        );
      })}
    </group>
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
  const animationRef = useRef(0);
  const [animationProgress, setAnimationProgress] = useState(0);

  const filesByDir = useMemo(() => {
    const map: Record<string, FileNode[]> = {};
    for (const f of files) {
      if (!f.isDirectory) {
        const dir = f.parentPath || "root";
        if (!map[dir]) map[dir] = [];
        map[dir].push(f);
      }
    }
    const entries = Object.entries(map);
    for (const [, b] of entries) b.sort((a, b) => b.riskScore - a.riskScore);
    entries.sort((a, b) => {
      const avgA = a[1].reduce((s, f) => s + f.riskScore, 0) / a[1].length;
      const avgB = b[1].reduce((s, f) => s + f.riskScore, 0) / b[1].length;
      return avgB - avgA;
    });
    return entries;
  }, [files]);

  const positions = useMemo(() => {
    const spacing = 5;
    const cols = Math.ceil(Math.sqrt(filesByDir.length));
    return filesByDir.map((_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return [
        (col - (cols - 1) / 2) * spacing,
        (row - (cols - 1) / 2) * spacing,
      ] as [number, number];
    });
  }, [filesByDir]);

  const maxDist = useMemo(() => {
    if (!positions.length) return 20;
    let max = 0;
    for (const [x, z] of positions) {
      const d = Math.sqrt(x * x + z * z) + 8;
      max = Math.max(max, d);
    }
    return max;
  }, [positions]);

  const AnimationController = () => {
    useFrame(() => {
      if (animationRef.current < 1) {
        animationRef.current += 0.02;
        setAnimationProgress(Math.min(animationRef.current, 1));
      }
    });
    return null;
  };

  const totalBuildings = useMemo(() => files.filter(f => !f.isDirectory).length, [files]);
  const heavy = totalBuildings > 500;
  const bevel = !heavy;

  // Camera: isometric angle, close enough to see details
  const cameraPos = useMemo((): [number, number, number] => {
    const d = maxDist * 1.1;
    return [d * 0.95, d * 0.85, d * 0.95];
  }, [maxDist]);

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: cameraPos, fov: 45, near: 0.1, far: 1000 }}
      style={{ width: "100%", height: "100%" }}
      gl={{
        antialias: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
    >
      <color attach="background" args={["#020202"]} />
      <fogExp2 attach="fog" args={["#020202", 0.006]} />

      {!heavy && <SoftShadows size={20} samples={8} focus={0.9} />}

      {/* Lighting — bright enough to show vivid colors */}
      <ambientLight intensity={0.5} color="#6688aa" />
      <directionalLight
        position={[20, 35, 15]}
        intensity={1.5}
        castShadow
        color="#ffffff"
        shadow-mapSize={heavy ? [1024, 1024] : [2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={200}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />
      <pointLight position={[-30, 25, -30]} intensity={0.6} color="#00ffff" distance={150} />
      <pointLight position={[30, 25, 30]}  intensity={0.5} color="#ff44aa" distance={150} />
      <pointLight position={[0, 15, 0]}    intensity={0.4} color="#ffffff"  distance={100} />

      <Environment resolution={256}>
        <Lightformer intensity={1.5} position={[0, 15, 0]} scale={[25, 25, 1]} color="#5577ff" />
        <Lightformer intensity={1.0} position={[-20, 10, -15]} scale={[12, 14, 1]} color="#00ffff" />
        <Lightformer intensity={0.8} position={[20, 10, 15]}  scale={[12, 14, 1]} color="#ff44aa" />
      </Environment>

      <Sparkles count={60} scale={[100, 30, 100]} position={[0, 8, 0]} size={1.8} speed={0.2} opacity={0.3} color="#00ffff" />

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]} receiveShadow>
        <planeGeometry args={[300, 300]} />
        <MeshReflectorMaterial
          resolution={heavy ? 512 : 1024}
          mirror={0.4}
          blur={[500, 150]}
          mixBlur={1.5}
          mixStrength={3.0}
          roughness={0.9}
          depthScale={1.2}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color="#020508"
          metalness={0.8}
        />
      </mesh>

      <Grid
        position={[0, -0.28, 0]}
        args={[300, 300]}
        infiniteGrid
        cellSize={0.8} 
        cellThickness={0.8}
        cellColor="#00ffff"
        sectionSize={4}
        sectionThickness={1.5}
        sectionColor="#ff00ff"
        fadeDistance={120}
        fadeStrength={0.5}
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
          animationProgress={animationProgress}
        />
      ))}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.07}
        minDistance={6}
        maxDistance={maxDist * 3}
        maxPolarAngle={Math.PI * 0.52}
        autoRotate={false}
      />

      <AnimationController />

      <EffectComposer enableNormalPass={false}>
        <Bloom intensity={2.8} luminanceThreshold={0.1} luminanceSmoothing={0.95} mipmapBlur radius={1.2} />
        <Vignette offset={0.25} darkness={0.55} />
      </EffectComposer>
    </Canvas>
  );
}