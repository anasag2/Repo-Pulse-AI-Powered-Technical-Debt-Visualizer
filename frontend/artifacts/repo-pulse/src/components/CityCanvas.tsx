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

type ExtMetrics = { hotspotScore: number; bugCommits: number; ageDays: number; todoMarkers: number; functionCount: number; };
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

// Color scale: green → lime → yellow → orange → red → magenta (critical)
function scaleToHex(t: number): string {
  if (t < 0.20) return "#00ff44";   // bright green
  if (t < 0.40) return "#aaff00";   // lime-yellow
  if (t < 0.55) return "#ffcc00";   // yellow
  if (t < 0.70) return "#ff6600";   // orange
  if (t < 0.85) return "#ff1111";   // red
  return "#ff00cc";                  // magenta/critical
}

function scaleToGlow(t: number): string {
  if (t < 0.20) return "#00ff44";
  if (t < 0.40) return "#88ff00";
  if (t < 0.55) return "#ffaa00";
  if (t < 0.70) return "#ff4400";
  if (t < 0.85) return "#ff0000";
  return "#ff00cc";
}

export function metricHex(file: FileNode, mode: ColorMode): string { return scaleToHex(metricT(file, mode)); }

// Window texture for buildings
const windowTexCache = new Map<string, THREE.CanvasTexture>();
function getWindowTexture(variant: number, rows: number): THREE.CanvasTexture {
  const key = `${variant}:${rows}`;
  if (windowTexCache.has(key)) return windowTexCache.get(key)!;
  const cols = 4, cell = 14;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell; canvas.height = rows * cell;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  let seed = (variant + 1) * 99991;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rnd() > 0.28;
      const v = lit ? 0.6 + rnd() * 0.4 : 0.03;
      ctx.fillStyle = `rgba(255,255,200,${v})`;
      ctx.fillRect(c * cell + 2, r * cell + 2, cell - 4, cell - 4);
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
  const glowColor = scaleToGlow(t);

  // Height: churn-based, exponential for high risk
  const riskMult = 1 + file.riskScore * 2.5;
  const rawHeight = Math.max(0.4, (file.churnCommits / 18) * riskMult);
  const height = Math.min(rawHeight, 7.0) * animationProgress;

  // Width: lines of code based
  const baseSize = Math.max(0.35, Math.min(1.1, file.linesOfCode / 700));

  const emissiveBase = 0.7 + t * 1.8;
  const isCritical = file.riskScore > 0.8;
  const isHigh = file.riskScore > 0.6;

  const winRows = Math.min(24, Math.max(3, Math.round(height * 2.5)));
  const windowTex = useMemo(() => getWindowTexture(file.id % 10, winRows), [file.id, winRows]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    let pulse = 0;
    if (isCritical) pulse = (Math.sin(state.clock.elapsedTime * 3.0) * 0.5 + 0.5) * 1.2;
    else if (isHigh) pulse = (Math.sin(state.clock.elapsedTime * 2.0) * 0.5 + 0.5) * 0.5;
    const target = selected ? emissiveBase + 3.0 : hovered ? emissiveBase + 1.5 : emissiveBase + pulse;
    mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, target, 0.15);
  });

  const args: [number, number, number] = [baseSize, height, baseSize];
  const material = (
    <meshStandardMaterial
      color={color}
      emissive={glowColor}
      emissiveMap={windowTex}
      emissiveIntensity={emissiveBase}
      roughness={0.15}
      metalness={0.75}
      envMapIntensity={1.2}
    />
  );

  const common = {
    ref: meshRef as never,
    position: [position[0], height / 2, position[2]] as [number, number, number],
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
      {/* Glow halo for critical files */}
      {isCritical && (
        <mesh position={[position[0], 0.03, position[2]]}>
          <cylinderGeometry args={[baseSize * 2.0, baseSize * 2.5, 0.06, 20]} />
          <meshBasicMaterial color={glowColor} transparent opacity={0.45} />
        </mesh>
      )}
      {isHigh && !isCritical && (
        <mesh position={[position[0], 0.02, position[2]]}>
          <cylinderGeometry args={[baseSize * 1.4, baseSize * 1.7, 0.04, 16]} />
          <meshBasicMaterial color={glowColor} transparent opacity={0.3} />
        </mesh>
      )}
    </>
  );
}

function District({
  dir, buildings, colorBy, bevel, offsetX, offsetZ,
  onBuildingClick, selectedId, animationProgress,
}: {
  dir: string; buildings: FileNode[]; colorBy: ColorMode; bevel: boolean;
  offsetX: number; offsetZ: number;
  onBuildingClick: (f: FileNode) => void;
  selectedId: number | null; animationProgress: number;
}) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const avgRisk = buildings.length
    ? buildings.reduce((a, b) => a + b.riskScore, 0) / buildings.length : 0;

  const cols = Math.ceil(Math.sqrt(buildings.length));
  const spacing = 1.25;
  const platformSize = Math.max(4.5, cols * spacing + 2.0);
  const borderColor = scaleToHex(avgRisk);

  // Platform: dark base with colored border glow
  const platEmissive = avgRisk < 0.25 ? "#001a00" : avgRisk < 0.5 ? "#1a0e00" : avgRisk < 0.75 ? "#1a0500" : "#1a0015";
  const platEmissiveIntensity = 0.15 + avgRisk * 0.5;

  return (
    <group position={[offsetX, 0, offsetZ]}>
      {/* Dark platform */}
      <mesh position={[0, -0.07, 0]} receiveShadow>
        <boxGeometry args={[platformSize, 0.14, platformSize]} />
        <meshStandardMaterial
          color="#050810"
          emissive={platEmissive}
          emissiveIntensity={platEmissiveIntensity}
          roughness={0.4}
          metalness={0.8}
        />
      </mesh>

      {/* Neon border */}
      {([
        [-platformSize/2, -platformSize/2, platformSize/2, -platformSize/2],
        [platformSize/2, -platformSize/2, platformSize/2, platformSize/2],
        [platformSize/2, platformSize/2, -platformSize/2, platformSize/2],
        [-platformSize/2, platformSize/2, -platformSize/2, -platformSize/2],
      ] as [number, number, number, number][]).map(([x1, z1, x2, z2], idx) => (
        <line key={idx}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([x1, 0.01, z1, x2, 0.01, z2])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color={borderColor} />
        </line>
      ))}

      {/* Label */}
      <Html position={[0, 0.6, -platformSize / 2 - 0.4]} center distanceFactor={15}>
        <div style={{
          color: "#e0e0e0",
          fontSize: "11px",
          fontWeight: 700,
          whiteSpace: "nowrap",
          padding: "2px 8px",
          backgroundColor: "rgba(4,8,20,0.92)",
          border: `1px solid ${borderColor}88`,
          borderRadius: "4px",
          boxShadow: `0 0 8px ${borderColor}50`,
          pointerEvents: "none",
          fontFamily: "monospace",
          letterSpacing: "0.5px",
        }}>
          □ {dir || "root"} ({buildings.length})
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
    const spacing = 8;
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
    for (const [x, z] of positions) max = Math.max(max, Math.sqrt(x*x + z*z) + 8);
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
  const heavy = totalBuildings > 600;
  const bevel = !heavy;

  // Isometric camera — close, angled like reference
  const cameraPos = useMemo((): [number, number, number] => {
    const d = maxDist * 1.0;
    return [d * 0.75, d * 0.55, d * 0.75];
  }, [maxDist]);

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: cameraPos, fov: 42, near: 0.1, far: 1000 }}
      style={{ width: "100%", height: "100%" }}
      gl={{
        antialias: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.95,
      }}
    >
      <color attach="background" args={["#040810"]} />
      <fogExp2 attach="fog" args={["#040810", 0.008]} />

      {!heavy && <SoftShadows size={22} samples={8} focus={0.85} />}

      {/* Lighting — strong enough for vivid colors */}
      <ambientLight intensity={0.4} color="#556688" />
      <directionalLight
        position={[25, 40, 20]}
        intensity={1.4}
        castShadow
        color="#ffffff"
        shadow-mapSize={heavy ? [1024, 1024] : [2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={250}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
      />
      <pointLight position={[-40, 30, -40]} intensity={0.5} color="#00ff88" distance={200} />
      <pointLight position={[40, 30, 40]}  intensity={0.5} color="#ff0066" distance={200} />
      <pointLight position={[0, 20, 0]}    intensity={0.3} color="#4466ff" distance={150} />

      <Environment resolution={256}>
        <Lightformer intensity={1.2} position={[0, 18, 0]} scale={[30, 30, 1]} color="#3355ff" />
        <Lightformer intensity={0.9} position={[-25, 12, -20]} scale={[15, 18, 1]} color="#00ff88" />
        <Lightformer intensity={0.8} position={[25, 12, 20]}  scale={[15, 18, 1]} color="#ff0066" />
      </Environment>

      {/* Particles */}
      <Sparkles count={80} scale={[120, 40, 120]} position={[0, 10, 0]} size={1.5} speed={0.15} opacity={0.25} color="#00ffff" />
      <Sparkles count={40} scale={[60, 15, 60]}  position={[0, 4, 0]}  size={1.0} speed={0.1}  opacity={0.2}  color="#ff00cc" />

      {/* Reflective floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <MeshReflectorMaterial
          resolution={heavy ? 512 : 1024}
          mirror={0.35}
          blur={[600, 200]}
          mixBlur={2.0}
          mixStrength={3.5}
          roughness={0.92}
          depthScale={1.3}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#010305"
          metalness={0.9}
        />
      </mesh>

      {/* Neon grid — like reference */}
      <Grid
        position={[0, -0.27, 0]}
        args={[400, 400]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.4}
        cellColor="#00aaaa"
        sectionSize={5}
        sectionThickness={0.9}
        sectionColor="#cc00aa"
        fadeDistance={100}
        fadeStrength={1.2}
      />

      {/* Districts */}
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
        dampingFactor={0.06}
        minDistance={5}
        maxDistance={maxDist * 3}
        maxPolarAngle={Math.PI * 0.50}
        autoRotate={false}
      />

      <AnimationController />

      <EffectComposer enableNormalPass={false}>
        <Bloom
          intensity={1.4}
          luminanceThreshold={0.18}
          luminanceSmoothing={0.85}
          mipmapBlur
          radius={0.85}
        />
        <Vignette offset={0.2} darkness={0.6} />
      </EffectComposer>
    </Canvas>
  );
}