import { useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { FileNode } from "@workspace/api-client-react";

function riskToHex(score: number): string {
  if (score < 0.3) return "#22c55e";
  if (score < 0.5) return "#eab308";
  if (score < 0.7) return "#f97316";
  return "#ef4444";
}

function Building({
  file,
  position,
  selected,
  hovered,
  onPointerOver,
  onPointerOut,
  onClick,
}: {
  file: FileNode;
  position: [number, number, number];
  selected: boolean;
  hovered: boolean;
  onPointerOver: () => void;
  onPointerOut: () => void;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = riskToHex(file.riskScore);
  const height = Math.max(0.3, (file.churnCommits / 100) * 4);
  const baseSize = Math.max(0.3, (file.linesOfCode / 800) * 0.8);

  useFrame(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    const target = selected ? 0.6 : hovered ? 0.3 : 0.05;
    mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, target, 0.1);
  });

  return (
    <mesh
      ref={meshRef}
      position={[position[0], height / 2, position[2]]}
      onPointerOver={(e) => { e.stopPropagation(); onPointerOver(); }}
      onPointerOut={onPointerOut}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      castShadow
    >
      <boxGeometry args={[baseSize, height, baseSize]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.05} roughness={0.4} metalness={0.3} />
    </mesh>
  );
}

function District({
  dir,
  buildings,
  offsetX,
  offsetZ,
  onBuildingClick,
  selectedId,
}: {
  dir: string;
  buildings: FileNode[];
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
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[size, 0.1, size]} />
        <meshStandardMaterial color={`hsl(${220 + avgRisk * 20}, 20%, ${10 + avgRisk * 5}%)`} roughness={0.9} />
      </mesh>
      <Html position={[0, 0.5, -size / 2 - 0.5]} center>
        <div style={{ pointerEvents: "none", userSelect: "none", whiteSpace: "nowrap", padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700, color: "#67e8f9", backgroundColor: "rgba(9,10,20,0.85)", border: "1px solid rgba(103,232,249,0.2)" }}>
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
}: {
  files: FileNode[];
  onFileClick: (f: FileNode) => void;
  selectedId: number | null;
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

  return (
    <Canvas
      shadows
      camera={{ position: [12, 14, 12], fov: 45 }}
      style={{ background: "#060a14", width: "100%", height: "100%" }}
      gl={{ antialias: true, failIfMajorPerformanceCaveat: false }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1.2} castShadow />
      <pointLight position={[-10, 10, -10]} intensity={0.6} color="#3b82f6" />
      {/* Ground grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]}>
        <planeGeometry args={[80, 80, 40, 40]} />
        <meshStandardMaterial color="#0a0f1e" wireframe opacity={0.3} transparent />
      </mesh>
      {filesByDir.map(([dir, buildings], i) => (
        <District
          key={dir}
          dir={dir}
          buildings={buildings}
          offsetX={positions[i][0]}
          offsetZ={positions[i][1]}
          onBuildingClick={onFileClick}
          selectedId={selectedId}
        />
      ))}
      <OrbitControls enableDamping dampingFactor={0.05} minDistance={4} maxDistance={50} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
