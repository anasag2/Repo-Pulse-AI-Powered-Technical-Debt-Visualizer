import { Link } from "wouter";
import { motion } from "framer-motion";
import { useGetDashboardSummary, useListRepositories } from "@workspace/api-client-react";
import {
  BookOpen,
  GitBranch,
  History,
  Camera,
  ArrowRight,
  FileText,
  AlertTriangle,
  Sparkles,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { stagger, rise, pageEnter } from "@/lib/motion";

function riskColor(score: number) {
  if (score < 0.3) return "bg-green-400";
  if (score < 0.5) return "bg-yellow-400";
  if (score < 0.7) return "bg-orange-400";
  return "bg-red-400";
}

// Big navigation cards — the primary "where do I go" surface.
const ACTIONS = [
  {
    href: "/learn",
    icon: BookOpen,
    title: "Learn a codebase",
    desc: "Take an AI-guided walkthrough of how a repo works, or where its risk lives.",
    accent: "text-emerald-400",
    ring: "hover:border-emerald-400/40",
  },
  {
    href: "/repositories",
    icon: GitBranch,
    title: "Repositories",
    desc: "Browse your analyzed repos, or add a new one to map and explore.",
    accent: "text-blue-400",
    ring: "hover:border-blue-400/40",
  },
  {
    href: "/history",
    icon: History,
    title: "History",
    desc: "See how a repository's activity and churn have changed over time.",
    accent: "text-violet-400",
    ring: "hover:border-violet-400/40",
  },
  {
    href: "/snapshots",
    icon: Camera,
    title: "Snapshots",
    desc: "Track how a repository's health changes over time.",
    accent: "text-amber-400",
    ring: "hover:border-amber-400/40",
  },
] as const;

const TIPS = [
  "Add a repository under Repositories, then open Learn for an AI walkthrough of how it's built.",
  "In Learn, switch between “How it works” and “Tech debt” to see the codebase from two angles.",
  "Click any file in a walkthrough to read its source and ask the AI about it.",
];

export default function Dashboard() {
  const { user } = useAuth();
  const { data: summary } = useGetDashboardSummary();
  const { data: repos } = useListRepositories();
  const recent = repos ? [...repos].reverse().slice(0, 5) : [];

  const stats = [
    { label: "Repositories", value: summary?.totalRepositories ?? 0, icon: GitBranch, color: "text-blue-400" },
    { label: "Files analyzed", value: summary?.totalFiles ?? 0, icon: FileText, color: "text-emerald-400" },
    { label: "High-risk files", value: summary?.totalHighRiskFiles ?? 0, icon: AlertTriangle, color: "text-red-400" },
  ];

  return (
    <motion.div {...pageEnter} className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-6">
        {/* Welcome */}
        <div className="flex items-center gap-2 text-emerald-400">
          <Sparkles className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">Repo-Pulse</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Repo-Pulse turns a repository into something you can actually understand — an AI walkthrough of
          how the code works, and a clear view of where the technical debt and risk live. Pick a place to start.
        </p>

        {/* Quick stats */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="mt-6 grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <motion.div key={s.label} variants={rise} className="rounded-xl border border-border bg-card/40 p-4">
              <s.icon className={cn("h-4 w-4", s.color)} />
              <div className="mt-2 text-2xl font-bold text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Navigation cards */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ACTIONS.map((a) => (
            <motion.div key={a.href} variants={rise} whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}>
              <Link href={a.href}>
                <div className={cn("group h-full cursor-pointer rounded-xl border border-border bg-card/40 p-5 transition-colors", a.ring)}>
                  <div className="flex items-center justify-between">
                    <a.icon className={cn("h-5 w-5", a.accent)} />
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="mt-3 font-semibold text-foreground">{a.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{a.desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Recent repositories */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.4 }} className="rounded-xl border border-border bg-card/30 p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Recent repositories</h2>
            {recent.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No repositories yet.{" "}
                <Link href="/repositories"><span className="cursor-pointer text-emerald-400 hover:underline">Add your first one →</span></Link>
              </div>
            ) : (
              <div className="space-y-1">
                {recent.map((r) => (
                  <Link key={r.id} href={`/repositories/${r.id}`}>
                    <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors hover:bg-muted/60">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", riskColor(r.avgRiskScore))} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-foreground/90">{r.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{r.totalFiles} files · {r.lastAnalyzed}</span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </motion.div>

          {/* Tips */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }} className="rounded-xl border border-border bg-card/30 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Lightbulb className="h-4 w-4 text-amber-400" /> Tips to get started
            </h2>
            <ul className="space-y-2.5">
              {TIPS.map((tip, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-semibold text-emerald-400">
                    {i + 1}
                  </span>
                  {tip}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
