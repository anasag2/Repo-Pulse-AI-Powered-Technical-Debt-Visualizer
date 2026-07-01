import { useMemo, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useListRepositories } from "@workspace/api-client-react";
import {
  Compass,
  DoorOpen,
  Flame,
  Link2,
  Network,
  Anchor,
  ShieldAlert,
  BookOpen,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Map as MapIcon,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Cpu,
  Boxes,
  Database,
  Wrench,
  Layers,
  Activity,
  RefreshCw,
  Code2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/lib/use-persisted-state";
import { useTour, useRegenerateTour, useFileContent } from "@/lib/learn-api";
import RepoCardGrid from "@/components/RepoCardGrid";
import type { ConceptKind, MetricTone, RepoTour, TourKind, TourStop } from "@/lib/learn-types";

// ─── Concept theming ─────────────────────────────────────────────────────────
// Full literal class strings (Tailwind can't see dynamically-built ones); glow
// uses the hex via inline style.
const CONCEPTS: Record<
  ConceptKind,
  { icon: typeof Compass; label: string; chip: string; text: string; hex: string }
> = {
  // shared
  overview:   { icon: Compass,     label: "Overview",    chip: "bg-slate-400/10 text-slate-300 border-slate-400/25",       text: "text-slate-300",   hex: "#94a3b8" },
  entrypoint: { icon: DoorOpen,    label: "Entry point", chip: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25", text: "text-emerald-300", hex: "#34d399" },
  // code walkthrough
  core:       { icon: Cpu,         label: "Core logic",  chip: "bg-indigo-400/10 text-indigo-300 border-indigo-400/25",    text: "text-indigo-300",  hex: "#818cf8" },
  module:     { icon: Boxes,       label: "Module",      chip: "bg-blue-400/10 text-blue-300 border-blue-400/25",          text: "text-blue-300",    hex: "#60a5fa" },
  data:       { icon: Database,    label: "Data",        chip: "bg-cyan-400/10 text-cyan-300 border-cyan-400/25",          text: "text-cyan-300",    hex: "#22d3ee" },
  api:        { icon: Network,     label: "Interface",   chip: "bg-fuchsia-400/10 text-fuchsia-300 border-fuchsia-400/25", text: "text-fuchsia-300", hex: "#e879f9" },
  utility:    { icon: Wrench,      label: "Helpers",     chip: "bg-lime-400/10 text-lime-300 border-lime-400/25",          text: "text-lime-300",    hex: "#a3e635" },
  // technical debt
  hotspot:    { icon: Flame,       label: "Hotspot",     chip: "bg-red-400/10 text-red-300 border-red-400/25",            text: "text-red-300",     hex: "#f87171" },
  coupling:   { icon: Link2,       label: "Coupling",    chip: "bg-amber-400/10 text-amber-300 border-amber-400/25",      text: "text-amber-300",   hex: "#fbbf24" },
  complexity: { icon: Network,     label: "Complexity",  chip: "bg-violet-400/10 text-violet-300 border-violet-400/25",   text: "text-violet-300",  hex: "#a78bfa" },
  stable:     { icon: Anchor,      label: "Stable",      chip: "bg-sky-400/10 text-sky-300 border-sky-400/25",            text: "text-sky-300",     hex: "#38bdf8" },
  tests:      { icon: ShieldAlert, label: "Coverage",    chip: "bg-teal-400/10 text-teal-300 border-teal-400/25",         text: "text-teal-300",    hex: "#2dd4bf" },
};

const TONE: Record<MetricTone, string> = {
  good: "text-emerald-400",
  warn: "text-amber-400",
  bad: "text-red-400",
  neutral: "text-foreground/70",
};

// Shared motion variants
const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } };
const rise: Variants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } };

// ─── Inline source viewer (fills the space under a file stop) ─────────────────
function CodeViewer({ repoId, fileId }: { repoId: number; fileId: number }) {
  const [open, setOpen] = useState(true);
  const { data, isLoading, isError } = useFileContent(repoId, fileId);
  const lineCount = data ? data.content.split("\n").length : 0;

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-border bg-[#0b0e14]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between px-3 text-xs transition-colors hover:bg-white/5"
      >
        <span className="flex items-center gap-2 font-medium text-foreground/80">
          <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
          Source
          {data && <span className="text-muted-foreground">· {lineCount} lines{data.truncated ? " (truncated)" : ""}</span>}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="overflow-hidden border-t border-border"
          >
            {isLoading ? (
              <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading source…
              </div>
            ) : isError || !data?.content ? (
              <p className="p-4 text-xs text-muted-foreground">Source unavailable for this file.</p>
            ) : (
              <div className="max-h-80 overflow-auto">
                <pre className="p-3 text-[12px] leading-relaxed">
                  <code className="font-mono text-foreground/80">{data.content}</code>
                </pre>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Shared stop detail (used by both Tour and Explore) ──────────────────────
function StopDetail({ stop, repoId, kind }: { stop: TourStop; repoId: number; kind: TourKind }) {
  const c = CONCEPTS[stop.concept];
  const Icon = c.icon;
  // The second layer means different things per lens.
  const calloutLabel = kind === "code" ? "How it fits" : "Lesson";
  return (
    <div className="relative">
      {/* concept glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-10 -left-6 h-40 w-40 rounded-full blur-3xl"
        style={{ backgroundColor: c.hex, opacity: 0.16 }}
        animate={{ opacity: [0.1, 0.22, 0.1], scale: [1, 1.08, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", c.chip)}>
            <Icon className="h-3.5 w-3.5" />
            {c.label}
          </span>
          {stop.path && (
            <code className="truncate rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
              {stop.path}
            </code>
          )}
        </div>

        <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{stop.title}</h2>

        {/* The "what" */}
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-foreground/80">{stop.role}</p>

        {/* Facts / metrics */}
        {stop.metrics.length > 0 && (
          <motion.div variants={stagger} initial="hidden" animate="show" className="mt-5 flex flex-wrap gap-2">
            {stop.metrics.map((m) => (
              <motion.div
                key={m.label}
                variants={rise}
                className="rounded-lg border border-border bg-card/60 px-3 py-2"
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
                <div className={cn("text-sm font-semibold", TONE[m.tone])}>{m.value}</div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* The second layer: architecture fit (code) or debt lesson */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4, ease }}
          className="mt-6 rounded-xl border border-border bg-card/40 p-4"
          style={{ boxShadow: `inset 3px 0 0 ${c.hex}` }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className={cn("h-4 w-4", c.text)} />
            <span className={cn("text-xs font-semibold uppercase tracking-wider", c.text)}>
              {calloutLabel} · {stop.conceptTitle}
            </span>
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-foreground/75">{stop.lesson}</p>
        </motion.div>

        {stop.fileId != null && (
          <>
            <Link href={`/repositories/${repoId}`}>
              <button className="mt-5 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground/90 transition-colors hover:border-emerald-400/40 hover:text-emerald-300">
                <Sparkles className="h-4 w-4" />
                Ask about this file
                <ChevronRight className="h-4 w-4" />
              </button>
            </Link>
            <CodeViewer repoId={repoId} fileId={stop.fileId} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tour mode (linear walkthrough) ──────────────────────────────────────────
function TourMode({ tour, repoId, kind }: { tour: RepoTour; repoId: number; kind: TourKind }) {
  const ordered = tour.stops;
  const [currentId, setCurrentId] = usePersistedState(`learn-${repoId}-${kind}-stop`, ordered[0]?.id);

  const index = Math.max(0, ordered.findIndex((s) => s.id === currentId));
  const stop = ordered[index] ?? ordered[0];
  const go = (i: number) => setCurrentId(ordered[Math.min(Math.max(i, 0), ordered.length - 1)].id);

  return (
    <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      {/* Left rail: the stop list */}
      <div className="relative flex-1 overflow-y-auto rounded-xl border border-border bg-card/30 p-2">
        {ordered.map((s, i) => {
          const c = CONCEPTS[s.concept];
          const Icon = c.icon;
          const active = s.id === stop.id;
          return (
            <button
              key={s.id}
              onClick={() => setCurrentId(s.id)}
              className={cn(
                "relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                active ? "bg-emerald-500/10" : "hover:bg-muted/60"
              )}
            >
              {active && (
                <motion.div layoutId="stop-active" className="absolute inset-0 rounded-lg ring-1 ring-emerald-400/40" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
              )}
              <span className={cn("relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", c.chip)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="relative min-w-0 flex-1">
                <span className={cn("block truncate text-[13px] font-medium", active ? "text-foreground" : "text-foreground/75")}>
                  {s.title}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">{s.path ?? "Overview"}</span>
              </span>
              <span className="relative text-[10px] font-semibold text-muted-foreground">{i + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Right: the current stop */}
      <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card/30 p-6">
        <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Stop {index + 1} of {ordered.length}</span>
          <div className="flex gap-1.5">
            {ordered.map((s, i) => (
              <button key={s.id} onClick={() => go(i)} aria-label={`Go to stop ${i + 1}`} className="group py-1">
                <span
                  className={cn(
                    "block h-1.5 rounded-full transition-all",
                    i === index ? "w-6 bg-emerald-400" : "w-1.5 bg-muted-foreground/30 group-hover:bg-muted-foreground/60"
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={stop.id}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.3, ease }}
            >
              <StopDetail stop={stop} repoId={repoId} kind={kind} />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
          <button
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors enabled:hover:bg-muted disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" /> Prev
          </button>
          <button
            onClick={() => go(index + 1)}
            disabled={index === ordered.length - 1}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors enabled:hover:bg-emerald-400 disabled:opacity-30"
          >
            Next <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Explore mode ────────────────────────────────────────────────────────────
function ExploreMode({ tour, repoId, kind }: { tour: RepoTour; repoId: number; kind: TourKind }) {
  const files = useMemo(() => tour.stops.filter((s) => s.fileId != null), [tour]);
  const [selectedId, setSelectedId] = usePersistedState(`learn-${repoId}-${kind}-selected`, files[0]?.id ?? null);
  const selected = files.find((s) => s.id === selectedId) ?? files[0];

  return (
    <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-card/30 p-2">
        <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {files.length} files · click any to explore
        </p>
        {files.map((s) => {
          const c = CONCEPTS[s.concept];
          const Icon = c.icon;
          const active = s.id === selected?.id;
          return (
            <motion.button
              key={s.id}
              variants={rise}
              onClick={() => setSelectedId(s.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                active ? "border-emerald-400/40 bg-emerald-500/10" : "border-transparent hover:border-border hover:bg-muted/60"
              )}
            >
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", c.chip)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-foreground/85">{s.title}</span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">{s.path}</span>
              </span>
            </motion.button>
          );
        })}
      </motion.div>

      <div className="min-h-0 overflow-y-auto rounded-xl border border-border bg-card/30 p-6">
        {selected ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.28, ease }}
            >
              <StopDetail stop={selected} repoId={repoId} kind={kind} />
            </motion.div>
          </AnimatePresence>
        ) : (
          <p className="text-sm text-muted-foreground">No files to explore yet.</p>
        )}
      </div>
    </div>
  );
}

type Mode = "code" | "debt" | "explore";

// ─── Repo learning environment ───────────────────────────────────────────────
function LearnRepo({ repoId }: { repoId: number }) {
  const { data: repos } = useListRepositories();
  const repo = repos?.find((r) => r.id === repoId);
  const [mode, setMode] = usePersistedState<Mode>(`learn-${repoId}-mode`, "code");
  // Explore reuses the code walkthrough's files.
  const tourKind: TourKind = mode === "debt" ? "debt" : "code";
  const { data: tour, isLoading, isError, error } = useTour(repoId, tourKind);
  const regenerate = useRegenerateTour(repoId, tourKind);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
      className="flex h-full flex-col p-6"
    >
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/learn">
            <button className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{repo?.name ?? `Repository #${repoId}`}</h1>
              {tour && (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    tour.generated
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      : "border-sky-400/30 bg-sky-400/10 text-sky-300"
                  )}
                  title={tour.generated ? `AI-authored · ${tour.model}` : "Generated from this repo's metrics (no AI)"}
                >
                  {tour.generated ? "AI-authored" : "heuristic"}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {mode === "debt"
                ? "Where the risk lives — hotspots, coupling, and coverage."
                : "Understand the codebase — how it's built and how the pieces connect."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Regenerate (forces a fresh, paid AI run; cached otherwise) */}
          {tour?.generated && (
            <button
              onClick={() => regenerate.mutate()}
              disabled={regenerate.isPending}
              title="Regenerate this walkthrough (uses AI credits)"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", regenerate.isPending && "animate-spin")} />
              {regenerate.isPending ? "Regenerating…" : "Regenerate"}
            </button>
          )}

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border bg-card/50 p-1 text-sm">
          {([
            ["code", "How it works", Layers],
            ["debt", "Tech debt", Activity],
            ["explore", "Explore", MapIcon],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={cn(
                "relative flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition-colors",
                mode === key ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              {mode === key && (
                <motion.div layoutId="mode-pill" className="absolute inset-0 rounded-md bg-emerald-500/15 ring-1 ring-emerald-400/30" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
              )}
              <Icon className="relative h-4 w-4" />
              <span className="relative">{label}</span>
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2 text-sm">Building the walkthrough…</span>
          </div>
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            <p className="text-sm text-foreground/80">Couldn't build the walkthrough for this repository.</p>
            <p className="max-w-md text-xs text-muted-foreground">{(error as Error)?.message}</p>
          </div>
        ) : tour ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {mode === "explore" ? (
                <ExploreMode tour={tour} repoId={repoId} kind={tourKind} />
              ) : (
                <TourMode tour={tour} repoId={repoId} kind={tourKind} />
              )}
            </motion.div>
          </AnimatePresence>
        ) : null}
      </div>
    </motion.div>
  );
}

// ─── Learn home: pick a repo to learn ────────────────────────────────────────
function LearnHome() {
  const { data: repos } = useListRepositories();
  const [, navigate] = useLocation();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <div className="flex items-center gap-2 text-emerald-400">
          <BookOpen className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">Learn</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Understand any repo, fast.</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Repositories are black boxes to newcomers. Pick one and take the{" "}
          <span className="text-foreground/80">How it works</span> tour to learn the architecture and what
          each part does, switch to <span className="text-foreground/80">Tech debt</span> to see where the
          risk lives, or <span className="text-foreground/80">Explore</span> freely and click any file for a
          plain-English explanation.
        </p>
      </motion.div>

      <div className="mt-8">
        <RepoCardGrid repos={repos ?? []} actionLabel="Start tour" onPick={(id) => navigate(`/learn/${id}`)} />
      </div>
    </div>
  );
}

export default function Learn() {
  const [match, params] = useRoute("/learn/:id");
  if (match && params?.id) {
    return <LearnRepo repoId={parseInt(params.id, 10)} />;
  }
  return <LearnHome />;
}
