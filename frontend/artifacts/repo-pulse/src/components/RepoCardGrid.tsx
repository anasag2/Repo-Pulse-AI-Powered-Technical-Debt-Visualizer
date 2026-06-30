import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, GitBranch, ArrowRight, Check } from "lucide-react";
import type { Repository } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { stagger, rise } from "@/lib/motion";
import { getRecentOrder, recordRecentRepo } from "@/lib/recent-repos";

// A searchable grid of repo "islands". The most-recently-clicked repo floats to
// the front (live), so it scales as the number of repos grows. Reused by the
// Learn and History pages.
export default function RepoCardGrid({
  repos,
  onPick,
  selectedId = null,
  actionLabel = "Open",
}: {
  repos: Repository[];
  onPick: (id: number) => void;
  selectedId?: number | null;
  actionLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<number[]>(() => getRecentOrder());

  const ordered = useMemo(() => {
    const rank = new Map(recent.map((id, i) => [id, i]));
    return [...repos].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  }, [repos, recent]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((r) => r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q));
  }, [ordered, search]);

  const pick = (id: number) => {
    recordRecentRepo(id);
    setRecent(getRecentOrder()); // float to front immediately
    onPick(id);
  };

  return (
    <div>
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          type="search"
          placeholder="Search repositories…"
          className="w-full rounded-md border border-border bg-card/50 py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
          data-testid="input-repo-search"
        />
      </div>

      {repos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No repositories yet. Analyze one first.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No repositories match “{search}”.
        </div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => {
            const active = selectedId === r.id;
            return (
              <motion.button
                key={r.id}
                layout
                variants={rise}
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                onClick={() => pick(r.id)}
                className={cn(
                  "group rounded-xl border bg-card/40 p-4 text-left transition-colors",
                  active ? "border-emerald-400/60 ring-1 ring-emerald-400/30" : "border-border hover:border-emerald-400/40",
                )}
                data-testid={`repo-card-${r.id}`}
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="truncate font-semibold text-foreground">{r.name}</span>
                  {active && <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-400" />}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{r.totalFiles} files</span>
                  {!active && (
                    <span className="inline-flex items-center gap-1 text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100">
                      {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
