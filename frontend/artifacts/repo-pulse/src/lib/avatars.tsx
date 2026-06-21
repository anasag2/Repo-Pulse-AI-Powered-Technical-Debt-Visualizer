import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Preset avatars — gradient tiles with a simple glyph, themed to the app's
// emerald/tech vibe. Rendered as inline SVG so there are no image assets to ship.
export interface AvatarPreset { id: string; c1: string; c2: string; glyph: ReactNode }

const line = { fill: "none", stroke: "#ffffff", strokeWidth: 6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const solid = { fill: "#ffffff" } as const;

export const AVATAR_PRESETS: AvatarPreset[] = [
  // terminal prompt
  { id: "terminal", c1: "#10b981", c2: "#047857", glyph: (<g {...line}><polyline points="30,36 44,50 30,64" /><line x1="50" y1="66" x2="68" y2="66" /></g>) },
  // hexagon
  { id: "hex", c1: "#14b8a6", c2: "#0e7490", glyph: (<polygon points="50,24 73,37 73,63 50,76 27,63 27,37" {...line} />) },
  // target rings
  { id: "rings", c1: "#8b5cf6", c2: "#4f46e5", glyph: (<g><circle cx="50" cy="50" r="22" {...line} /><circle cx="50" cy="50" r="7" {...solid} /></g>) },
  // diamond / cube
  { id: "diamond", c1: "#f59e0b", c2: "#ea580c", glyph: (<polygon points="50,24 76,50 50,76 24,50" {...line} />) },
  // pulse / ECG line
  { id: "pulse", c1: "#f43f5e", c2: "#be123c", glyph: (<polyline points="24,50 38,50 45,32 55,68 62,50 76,50" {...line} />) },
  // waveform bars
  { id: "bars", c1: "#0ea5e9", c2: "#2563eb", glyph: (<g {...solid}><rect x="30" y="44" width="8" height="20" rx="2" /><rect x="46" y="32" width="8" height="36" rx="2" /><rect x="62" y="50" width="8" height="14" rx="2" /></g>) },
  // leaf / spark
  { id: "spark", c1: "#84cc16", c2: "#16a34a", glyph: (<g {...line}><path d="M50 28 C66 36 66 60 50 72 C34 60 34 36 50 28 Z" /><line x1="50" y1="38" x2="50" y2="64" /></g>) },
  // 3x3 grid of dots
  { id: "grid", c1: "#64748b", c2: "#334155", glyph: (<g {...solid}>{[34, 50, 66].flatMap((y) => [34, 50, 66].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" />))}</g>) },
];

function PresetAvatar({ preset, size, className }: { preset: AvatarPreset; size: number; className?: string }) {
  const gid = useId().replace(/:/g, "") + preset.id;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={cn("rounded-full block", className)}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={preset.c1} />
          <stop offset="100%" stopColor={preset.c2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gid})`} />
      {preset.glyph}
    </svg>
  );
}

/** Render a user's avatar: a preset, a custom data-URL image, or initials. */
export function Avatar({ avatar, name, size = 28, className }: {
  avatar?: string; name?: string; size?: number; className?: string;
}) {
  if (avatar?.startsWith("preset:")) {
    const preset = AVATAR_PRESETS.find((p) => `preset:${p.id}` === avatar);
    if (preset) return <PresetAvatar preset={preset} size={size} className={className} />;
  }
  if (avatar?.startsWith("data:")) {
    return (
      <img
        src={avatar}
        alt={name ?? "avatar"}
        className={cn("rounded-full object-cover block", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn("rounded-full bg-emerald-500/20 flex items-center justify-center font-bold text-emerald-400", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {(name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}
