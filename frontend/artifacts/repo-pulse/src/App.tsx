import { useState } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation, useRoute } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useListRepositories, useGetDashboardSummary } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/Dashboard";
import Repositories from "@/pages/Repositories";
import Learn from "@/pages/Learn";
import RepositoryView from "@/pages/RepositoryView";
import Snapshots from "@/pages/Snapshots";
import HistoryPage from "@/pages/History";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AnalysisProvider } from "@/lib/analysis-context";
import AnalysisOverlay from "@/components/AnalysisOverlay";
import ProfileMenu from "@/components/ProfileMenu";
import {
  LayoutDashboard,
  GitBranch,
  BookOpen,
  Camera,
  History,
  Activity,
  Plus,
  ChevronsLeft,
  ChevronsRight,
  HelpCircle,
  Bell,
  Loader2,
  ArrowRight,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { cn, formatLastAnalyzed } from "@/lib/utils";

const queryClient = new QueryClient();

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Repositories", icon: GitBranch, href: "/repositories" },
  { label: "History", icon: History, href: "/history" },
  { label: "Snapshots", icon: Camera, href: "/snapshots" },
  { label: "Learn", icon: BookOpen, href: "/learn" },
];

// Risk score → status-dot color (matches the visualization's risk palette)
function riskDot(score: number): string {
  if (score < 0.3) return "#22c55e";
  if (score < 0.5) return "#eab308";
  if (score < 0.7) return "#f97316";
  return "#ef4444";
}

// A labelled section header inside the sidebar
function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-4 pb-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
        {children}
      </span>
      {action}
    </div>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const [location] = useLocation();
  const [, repoParams] = useRoute("/repositories/:id");
  const activeRepoId = repoParams?.id ? parseInt(repoParams.id) : null;
  const { data: repos } = useListRepositories();
  const { data: summary } = useGetDashboardSummary();
  // Top 3 by share of risky files (not raw count) — 2 risky out of 10 files
  // outranks 3 risky out of 200, since the former is proportionally worse.
  const recent = repos ? [...repos].sort((a, b) => b.riskyFilesPercent - a.riskyFilesPercent).slice(0, 3) : [];

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-sidebar border-r border-sidebar-border shrink-0 transition-[width] duration-200",
        collapsed ? "w-14" : "w-60"
      )}
    >
      {/* Brand */}
      <div className={cn("flex items-center h-14 border-b border-sidebar-border shrink-0", collapsed ? "justify-center px-0" : "px-3 gap-2")}>
        {collapsed ? (
          // Collapsed: the logo doubles as the expand control (chevron on hover).
          <button
            onClick={onToggle}
            title="Expand sidebar"
            className="group flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 hover:bg-sidebar-accent transition-colors"
            data-testid="button-expand-sidebar"
          >
            <Activity className="w-4 h-4 text-emerald-400 group-hover:hidden" />
            <ChevronsRight className="w-4 h-4 text-sidebar-foreground hidden group-hover:block" />
          </button>
        ) : (
          <>
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 shrink-0">
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-sm font-bold text-sidebar-foreground tracking-tight truncate">Repo-Pulse</span>
              <span className="text-[10px] text-sidebar-foreground/45 truncate">AI Repository Analyzer</span>
            </div>
            <button
              onClick={onToggle}
              title="Collapse sidebar"
              className="ml-auto text-sidebar-foreground/50 hover:text-sidebar-foreground p-1 rounded-md hover:bg-sidebar-accent transition-colors"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Analyze New Repository */}
      <div className={cn("shrink-0", collapsed ? "px-2 pt-3" : "px-3 pt-3")}>
        <Link href="/repositories">
          <button
            title="Analyze New Repository"
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-400 transition-colors w-full",
              collapsed ? "h-9" : "h-9 px-3"
            )}
            data-testid="button-analyze-new"
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Analyze New Repository</span>}
          </button>
        </Link>
      </div>

      {/* Navigation + recent repos */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {!collapsed && <SectionLabel>Navigation</SectionLabel>}
        <nav className={cn("flex flex-col gap-1", collapsed ? "items-center px-2 pt-3" : "px-2")}>
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  title={item.label}
                  className={cn(
                    "flex items-center rounded-lg cursor-pointer transition-colors",
                    collapsed ? "justify-center w-10 h-10" : "gap-3 px-3 h-10",
                    isActive
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0" />
                  {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Recent repositories */}
        {!collapsed && (
          <>
            <SectionLabel>Recent Repositories</SectionLabel>
            <div className="px-2 space-y-1.5">
              {recent.length === 0 ? (
                <p className="px-2.5 py-1.5 text-[11px] text-sidebar-foreground/40">No repositories yet</p>
              ) : (
                recent.map((r) => {
                  const isActive = activeRepoId === r.id;
                  return (
                    <Link key={r.id} href={`/repositories/${r.id}`}>
                      <div
                        className={cn(
                          "relative flex items-center gap-3 pl-4 pr-3 py-3.5 rounded-lg border cursor-pointer transition-colors overflow-hidden",
                          isActive
                            ? "bg-sidebar-accent border-emerald-400/40"
                            : "border-sidebar-border bg-sidebar-accent/40 hover:bg-sidebar-accent/80 hover:border-sidebar-border"
                        )}
                        data-testid={`recent-repo-${r.id}`}
                      >
                        <span
                          className="absolute left-0 top-0 bottom-0 w-1"
                          style={{ backgroundColor: riskDot(r.avgRiskScore) }}
                        />
                        <span
                          className="w-3 h-3 rounded-full shrink-0 ring-4"
                          style={{
                            backgroundColor: riskDot(r.avgRiskScore),
                            // @ts-expect-error -- ring color via CSS var isn't in the Tailwind type
                            "--tw-ring-color": `${riskDot(r.avgRiskScore)}33`,
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className={cn("text-base font-bold truncate", isActive ? "text-sidebar-foreground" : "text-sidebar-foreground")}>
                            {r.name}
                          </div>
                          <div className="text-xs font-semibold text-sidebar-foreground/70 truncate">{formatLastAnalyzed(r.lastAnalyzed)}</div>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
            <Link href="/repositories">
              <div className="mx-2 mt-1.5 flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[12px] font-medium text-emerald-400 cursor-pointer transition-colors hover:bg-sidebar-accent/60" data-testid="link-view-all-repositories">
                <span>View All Repositories</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Link>

            {/* Workspace — compact totals, mirrors the dashboard's stat row */}
            <SectionLabel>Workspace</SectionLabel>
            <div className="flex items-start justify-between gap-2 px-2.5 pb-2">
              <div className="flex flex-col items-start gap-1">
                <GitBranch className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-sm font-bold text-sidebar-foreground">{summary?.totalRepositories ?? 0}</span>
                <span className="text-[10px] text-sidebar-foreground/50">Repositories</span>
              </div>
              <div className="flex flex-col items-start gap-1">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-sm font-bold text-sidebar-foreground">{summary?.totalFiles ?? 0}</span>
                <span className="text-[10px] text-sidebar-foreground/50">Files analyzed</span>
              </div>
              <div className="flex flex-col items-start gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-sm font-bold text-sidebar-foreground">{summary?.totalHighRiskFiles ?? 0}</span>
                <span className="text-[10px] text-sidebar-foreground/50">High-risk files</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Collapse toggle */}
      <div className="shrink-0 border-t border-sidebar-border">
        <button
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex items-center gap-2 w-full text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors border-t border-sidebar-border",
            collapsed ? "justify-center h-10" : "px-3 h-9"
          )}
          data-testid="button-toggle-sidebar"
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
          {!collapsed && <span className="text-[12px] font-medium">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

// Current top-level section name, for the top-bar label.
function sectionLabel(location: string): string {
  if (location === "/") return "Dashboard";
  if (location.startsWith("/repositories")) return "Repositories";
  if (location.startsWith("/learn")) return "Learn";
  if (location.startsWith("/snapshots")) return "Snapshots";
  if (location.startsWith("/history")) return "History";
  if (location.startsWith("/settings")) return "Settings";
  return "";
}

function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("rp-sidebar-collapsed") === "1";
  });
  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("rp-sidebar-collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar px-4">
          <span className="text-[13px] font-semibold text-foreground/70">{sectionLabel(location)}</span>
          <div className="flex items-center gap-0.5">
            <button title="Help" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
              <HelpCircle className="h-4 w-4" />
            </button>
            <button title="Notifications" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
              <Bell className="h-4 w-4" />
            </button>
            <div className="mx-2 h-5 w-px bg-sidebar-border" />
            <ProfileMenu />
          </div>
        </header>
        <main className="flex-1 overflow-hidden min-w-0">{children}</main>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/repositories" component={Repositories} />
      <Route path="/repositories/:id" component={RepositoryView} />
      <Route path="/learn" component={Learn} />
      <Route path="/learn/:id" component={Learn} />
      <Route path="/snapshots" component={Snapshots} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Gates the app behind auth: a loading splash while the stored token is
// validated, the login page when signed out, the app when signed in.
function AuthGate() {
  const { user, loading } = useAuth();

  // The password-reset page is opened from an emailed link, so it must work
  // while logged out — handle it before the auth gate.
  if (window.location.pathname.replace(/\/+$/, "").endsWith("/reset-password")) {
    return <ResetPassword />;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <AnalysisProvider>
        <Layout>
          <Router />
        </Layout>
        <AnalysisOverlay />
        <Toaster />
      </AnalysisProvider>
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
