import { useState } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation, useRoute } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useListRepositories } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Studio from "@/pages/Studio";
import Repositories from "@/pages/Repositories";
import RepositoryView from "@/pages/RepositoryView";
import Snapshots from "@/pages/Snapshots";
import Compare from "@/pages/Compare";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AnalysisProvider } from "@/lib/analysis-context";
import AnalysisOverlay from "@/components/AnalysisOverlay";
import AvatarButton from "@/components/AvatarButton";
import {
  LayoutDashboard,
  GitBranch,
  Camera,
  GitCompare,
  Settings2,
  Activity,
  Plus,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const queryClient = new QueryClient();

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Repositories", icon: GitBranch, href: "/repositories" },
  { label: "Snapshots", icon: Camera, href: "/snapshots" },
  { label: "Compare", icon: GitCompare, href: "/compare" },
  { label: "Settings", icon: Settings2, href: "/settings" },
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
  const { user, logout } = useAuth();
  const recent = repos ? [...repos].reverse().slice(0, 6) : [];

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
            <span className="text-sm font-bold text-sidebar-foreground tracking-tight">Repo-Pulse</span>
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
        <nav className={cn("flex flex-col gap-0.5", collapsed ? "items-center px-2 pt-3" : "px-2")}>
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  title={item.label}
                  className={cn(
                    "flex items-center rounded-md cursor-pointer transition-colors",
                    collapsed ? "justify-center w-9 h-9" : "gap-2.5 px-2.5 h-8",
                    isActive
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {!collapsed && <span className="text-[13px] font-medium">{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Recent repositories */}
        {!collapsed && (
          <>
            <SectionLabel>Recent Repositories</SectionLabel>
            <div className="px-2 space-y-0.5">
              {recent.length === 0 ? (
                <p className="px-2.5 py-1.5 text-[11px] text-sidebar-foreground/40">No repositories yet</p>
              ) : (
                recent.map((r) => {
                  const isActive = activeRepoId === r.id;
                  return (
                    <Link key={r.id} href={`/repositories/${r.id}`}>
                      <div
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors",
                          isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
                        )}
                        data-testid={`recent-repo-${r.id}`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: riskDot(r.avgRiskScore) }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className={cn("text-[12px] truncate", isActive ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80")}>
                            {r.name}
                          </div>
                          <div className="text-[10px] text-sidebar-foreground/40 truncate">{r.lastAnalyzed}</div>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Account */}
      <div className="shrink-0 border-t border-sidebar-border">
        {!collapsed && <SectionLabel>Account</SectionLabel>}
        <div className={cn("flex items-center", collapsed ? "justify-center py-3" : "gap-2.5 px-3 py-2.5")}>
          <AvatarButton size={28} className="shrink-0" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-sidebar-foreground truncate">{user?.name ?? "—"}</div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={logout}
              title="Log out"
              className="text-sidebar-foreground/50 hover:text-red-400 p-1 rounded-md hover:bg-sidebar-accent transition-colors shrink-0"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Collapse toggle */}
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

function Layout({ children }: { children: React.ReactNode }) {
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
      <main className="flex-1 overflow-hidden min-w-0">{children}</main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Studio} />
      <Route path="/repositories" component={Repositories} />
      <Route path="/repositories/:id" component={RepositoryView} />
      <Route path="/snapshots" component={Snapshots} />
      <Route path="/compare" component={Compare} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Gates the app behind auth: a loading splash while the stored token is
// validated, the login page when signed out, the app when signed in.
function AuthGate() {
  const { user, loading } = useAuth();

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
