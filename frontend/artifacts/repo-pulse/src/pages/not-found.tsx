import { Link } from "wouter";
import { motion } from "framer-motion";
import { Activity, ArrowLeft, GitBranch } from "lucide-react";
import { ease } from "@/lib/motion";

export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
        className="w-full max-w-md text-center"
      >
        {/* Brand mark */}
        <div className="mb-6 inline-flex items-center gap-2 text-emerald-400">
          <Activity className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">Repo-Pulse</span>
        </div>

        {/* 404 with a flatlining EKG — this page has no pulse */}
        <div className="relative mx-auto w-fit">
          <div className="bg-gradient-to-b from-foreground to-foreground/40 bg-clip-text text-7xl font-black tracking-tight text-transparent">
            404
          </div>
          <svg viewBox="0 0 300 40" className="mt-1 h-8 w-full" fill="none" aria-hidden>
            <motion.path
              d="M0 20 H120 L130 20 L138 7 L146 33 L154 20 H300"
              stroke="#34d399"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0.2 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.6, ease }}
            />
          </svg>
        </div>

        <h1 className="mt-6 text-xl font-bold text-foreground">
          Looks like we haven't <span className="text-emerald-400">developed</span> this amazing page yet.
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The page you're after doesn't exist — or it's still sitting in our backlog. No pulse here.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/">
            <button
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-400"
              data-testid="link-go-home"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </button>
          </Link>
          <Link href="/repositories">
            <button className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/50 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-emerald-400/40">
              <GitBranch className="h-4 w-4 text-emerald-400" /> Browse repositories
            </button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
