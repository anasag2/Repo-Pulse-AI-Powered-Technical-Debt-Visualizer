import { useLocation } from "wouter";
import { HelpCircle, Flame, Link2, Gauge, GraduationCap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

const GLOSSARY = [
  { icon: Gauge, term: "Risk score", desc: "A 0–1 technical-debt score from a weighted model of 8 code + git metrics." },
  { icon: Flame, term: "Hotspot", desc: "A file that changes often AND is complex — the riskiest combination." },
  { icon: Link2, term: "Temporal coupling", desc: "Files that keep changing together, so edits tend to ripple." },
];

// A quick "what am I looking at?" glossary — de-blackboxes the metrics for newcomers
// and points to the guided Learn tour.
export default function HelpButton() {
  const [, navigate] = useLocation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title="Help"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
          data-testid="button-help"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">What am I looking at?</p>
          <p className="text-[11px] text-muted-foreground">Repo-Pulse maps a codebase's technical debt.</p>
        </div>

        <div className="space-y-0.5 p-2">
          {GLOSSARY.map(({ icon: Icon, term, desc }) => (
            <div key={term} className="flex gap-2 rounded-md px-2 py-1.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <p className="text-xs font-medium text-foreground">{term}</p>
                <p className="text-[11px] leading-snug text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <div
              className="h-3 w-16 shrink-0 rounded-full"
              style={{ background: "linear-gradient(90deg,#22c55e,#eab308,#f97316,#ef4444)" }}
            />
            <p className="text-[11px] text-muted-foreground">
              Color runs <span className="text-foreground">green → red</span> as debt rises.
            </p>
          </div>
        </div>

        <div className="border-t border-border p-2">
          <button
            onClick={() => navigate("/learn")}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
            data-testid="button-help-tour"
          >
            <GraduationCap className="h-3.5 w-3.5" /> Take the guided tour
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
