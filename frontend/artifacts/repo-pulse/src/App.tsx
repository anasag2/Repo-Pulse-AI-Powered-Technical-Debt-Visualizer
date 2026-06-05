import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Studio from "@/pages/Studio";
import Repositories from "@/pages/Repositories";
import RepositoryView from "@/pages/RepositoryView";
import Snapshots from "@/pages/Snapshots";
import Compare from "@/pages/Compare";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import {
  LayoutDashboard,
  GitBranch,
  Camera,
  GitCompare,
  Settings2,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const queryClient = new QueryClient();

const navItems = [
  { label: "Studio", icon: LayoutDashboard, href: "/" },
  { label: "Repositories", icon: GitBranch, href: "/repositories" },
  { label: "Snapshots", icon: Camera, href: "/snapshots" },
  { label: "Compare", icon: GitCompare, href: "/compare" },
  { label: "Settings", icon: Settings2, href: "/settings" },
];

function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="flex flex-col h-full bg-sidebar border-r border-sidebar-border shrink-0 w-14">
      {/* Logo */}
      <div className="flex items-center justify-center w-14 h-14 border-b border-sidebar-border shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20">
          <Activity className="w-4 h-4 text-primary" />
        </div>
      </div>

      {/* Navigation icons */}
      <nav className="flex-1 flex flex-col items-center gap-1 py-3">
        {navItems.map((item) => {
          const isActive =
            location === item.href ||
            (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                title={item.label}
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-md cursor-pointer transition-colors",
                  isActive
                    ? "bg-primary/20 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="w-4.5 h-4.5" />
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Account avatar */}
      <div className="flex items-center justify-center pb-3">
        <div
          title="Anas · anas@example.com"
          className="w-7 h-7 rounded-full bg-primary/30 flex items-center justify-center text-xs font-bold text-primary cursor-pointer"
        >
          A
        </div>
      </div>
    </aside>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Layout>
            <Router />
          </Layout>
          <Toaster />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
