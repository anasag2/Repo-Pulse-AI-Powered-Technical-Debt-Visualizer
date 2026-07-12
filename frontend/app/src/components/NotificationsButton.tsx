import { useLocation } from "wouter";
import { Bell, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useListRepositories } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// Repos not re-analyzed within this many days are flagged as stale.
const STALE_DAYS = 7;
// Repo-average risk at/above this is flagged as needing attention.
const HIGH_RISK = 0.5;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

type Note = {
  id: string;
  kind: "stale" | "risk";
  repoId: number;
  title: string;
  detail: string;
};

// Notifications are derived from the repo list — no backend/polling needed.
function buildNotes(
  repos: { id: number; name: string; lastAnalyzed: string; avgRiskScore: number }[],
): Note[] {
  const notes: Note[] = [];
  for (const r of repos) {
    const d = daysSince(r.lastAnalyzed);
    if (d !== null && d >= STALE_DAYS) {
      notes.push({
        id: `stale-${r.id}`,
        kind: "stale",
        repoId: r.id,
        title: `${r.name} needs a refresh`,
        detail: `Not re-analyzed in ${d} days — its metrics may be out of date.`,
      });
    }
    if (r.avgRiskScore >= HIGH_RISK) {
      notes.push({
        id: `risk-${r.id}`,
        kind: "risk",
        repoId: r.id,
        title: `${r.name} carries high risk`,
        detail: `Average risk ${r.avgRiskScore.toFixed(2)} — worth reviewing its hotspots.`,
      });
    }
  }
  return notes;
}

export default function NotificationsButton() {
  const { data: repos } = useListRepositories();
  const [, navigate] = useLocation();
  const notes = buildNotes(repos ?? []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title="Notifications"
          className="relative rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
          data-testid="button-notifications"
        >
          <Bell className="h-4 w-4" />
          {notes.length > 0 && (
            <span
              className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-sidebar"
              aria-label={`${notes.length} notifications`}
            />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {notes.length > 0 && (
            <span className="text-[10px] font-normal text-muted-foreground">{notes.length}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {notes.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <p className="text-xs text-muted-foreground">You're all caught up.</p>
          </div>
        ) : (
          notes.map((n) => (
            <DropdownMenuItem
              key={n.id}
              onClick={() => navigate(`/repositories/${n.repoId}`)}
              className="flex flex-col items-start gap-0.5 py-2"
              data-testid={`notification-${n.id}`}
            >
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                {n.kind === "stale" ? (
                  <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                )}
                <span className="truncate">{n.title}</span>
              </div>
              <span className="pl-5 text-[11px] leading-snug text-muted-foreground">{n.detail}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
