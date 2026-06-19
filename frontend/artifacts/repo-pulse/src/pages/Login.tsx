import { useState } from "react";
import { Activity, Github, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { startGitHubLogin } from "@/lib/auth";

export default function Login() {
  const { login, signup, oauthError } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";
  // Show a failed-OAuth message until the user starts typing a normal login.
  const displayError = error || oauthError || "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isSignup) await signup(email.trim(), name.trim(), password);
      else await login(email.trim(), password);
      // On success the AuthProvider sets the user and the app unmounts this page.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/15">
            <Activity className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">Repo-Pulse</span>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-xl">
          <h1 className="text-base font-bold text-foreground">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-xs text-muted-foreground mt-1 mb-5">
            {isSignup
              ? "Sign up to analyze and track your repositories."
              : "Log in to continue to your dashboard."}
          </p>

          <form onSubmit={onSubmit} className="space-y-3">
            {isSignup && (
              <Field
                label="Name"
                type="text"
                value={name}
                onChange={setName}
                placeholder="Your name"
                autoComplete="name"
                required
              />
            )}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder={isSignup ? "At least 8 characters" : "••••••••"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={isSignup ? 8 : undefined}
              required
            />

            {displayError && (
              <div className="text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-2.5 py-2">
                {displayError}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full h-9 rounded-md bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              data-testid="button-auth-submit"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSignup ? "Create account" : "Log in"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
              or
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Social login */}
          <button
            type="button"
            onClick={startGitHubLogin}
            className="w-full h-9 rounded-md border border-border bg-background text-sm font-semibold text-foreground hover:bg-foreground/5 transition-colors flex items-center justify-center gap-2"
            data-testid="button-auth-github"
          >
            <Github className="w-4 h-4" />
            Continue with GitHub
          </button>

          <div className="mt-4 text-center text-xs text-muted-foreground">
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => {
                setMode(isSignup ? "login" : "signup");
                setError("");
              }}
              className="text-emerald-400 font-semibold hover:underline"
              data-testid="button-auth-toggle"
            >
              {isSignup ? "Log in" : "Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  onChange,
  ...props
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <input
        {...props}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-9 rounded-md bg-background border border-border px-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
      />
    </label>
  );
}
