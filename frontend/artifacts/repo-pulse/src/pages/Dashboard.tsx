import { useGetDashboardSummary, useListRepositories } from "@workspace/api-client-react";
import { Link } from "wouter";
import { FileText, AlertTriangle, Shield, TestTube, RefreshCw, ArrowRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

function riskColor(score: number) {
  if (score < 0.3) return "text-green-400";
  if (score < 0.5) return "text-yellow-400";
  if (score < 0.7) return "text-orange-400";
  return "text-red-400";
}

function riskBg(score: number) {
  if (score < 0.3) return "bg-green-400/10 border-green-400/20";
  if (score < 0.5) return "bg-yellow-400/10 border-yellow-400/20";
  if (score < 0.7) return "bg-orange-400/10 border-orange-400/20";
  return "bg-red-400/10 border-red-400/20";
}

function statusDot(score: number) {
  if (score < 0.3) return "bg-green-400";
  if (score < 0.5) return "bg-yellow-400";
  if (score < 0.7) return "bg-orange-400";
  return "bg-red-400";
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: repos, isLoading: reposLoading } = useListRepositories();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Overview of your repositories and code health</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: "Repositories",
            value: summaryLoading ? "—" : String(summary?.totalRepositories ?? 0),
            icon: FileText,
            color: "text-blue-400",
            bg: "bg-blue-400/10",
          },
          {
            label: "Total Files",
            value: summaryLoading ? "—" : (summary?.totalFiles ?? 0).toLocaleString(),
            icon: FileText,
            color: "text-slate-300",
            bg: "bg-slate-400/10",
          },
          {
            label: "High Risk Files",
            value: summaryLoading ? "—" : String(summary?.totalHighRiskFiles ?? 0),
            icon: AlertTriangle,
            color: "text-red-400",
            bg: "bg-red-400/10",
          },
          {
            label: "Avg Risk Score",
            value: summaryLoading ? "—" : String(summary?.avgRiskScore ?? 0),
            icon: Shield,
            color: riskColor(summary?.avgRiskScore ?? 0),
            bg: riskBg(summary?.avgRiskScore ?? 0),
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-card border border-card-border rounded-lg p-4"
            data-testid={`card-${card.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">{card.label}</span>
              <div className={cn("p-1.5 rounded-md", card.bg)}>
                <card.icon className={cn("w-3.5 h-3.5", card.color)} />
              </div>
            </div>
            <div className={cn("text-2xl font-bold", card.color)}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Repositories list */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
          <h2 className="text-sm font-semibold text-foreground">Recent Repositories</h2>
          <Link href="/repositories">
            <button className="text-xs text-primary hover:underline flex items-center gap-1" data-testid="link-view-all">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </Link>
        </div>

        {reposLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
        ) : !repos || repos.length === 0 ? (
          <div className="p-10 text-center">
            <RefreshCw className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">No repositories yet</p>
            <Link href="/repositories">
              <button className="mt-3 text-xs text-primary hover:underline" data-testid="button-analyze-first">
                Analyze your first repository
              </button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-card-border">
            {repos.slice(-5).reverse().map((repo) => (
              <Link key={repo.id} href={`/repositories/${repo.id}`}>
                <div
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
                  data-testid={`repo-row-${repo.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", statusDot(repo.avgRiskScore))} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{repo.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{repo.url}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0 ml-4">
                    <div className="text-right hidden sm:block">
                      <div className="text-xs text-muted-foreground">Files</div>
                      <div className="text-xs font-medium text-foreground">{repo.totalFiles.toLocaleString()}</div>
                    </div>
                    <div className="text-right hidden md:block">
                      <div className="text-xs text-muted-foreground">Risk</div>
                      <div className={cn("text-xs font-bold", riskColor(repo.avgRiskScore))}>{repo.avgRiskScore}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Analyzed</div>
                      <div className="text-xs text-foreground">{repo.lastAnalyzed}</div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Test Coverage card */}
      {summary && (
        <div className="mt-3 bg-card border border-card-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TestTube className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-foreground">Avg Test Coverage</span>
            </div>
            <span className="text-sm font-bold text-green-400">{summary.avgTestCoverage}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-green-400 h-1.5 rounded-full transition-all"
              style={{ width: `${summary.avgTestCoverage}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
