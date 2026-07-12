import { useState } from "react";
import { Activity, Github, Loader2, MailCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { startGitHubLogin, startGoogleLogin, requestPasswordReset } from "@/lib/auth";
import { PasswordField, PasswordStrength, isStrong } from "@/components/PasswordFields";
import { cn } from "@/lib/utils";

// Google's multicolor "G" mark (lucide-react ships no brand icon for it).
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.06 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.38z" />
      <path fill="#34A853" d="M12 24c3.1 0 5.7-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.55-2.03-6.46-4.76H1.7v2.98A11.5 11.5 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.54 14.66a6.9 6.9 0 0 1 0-4.41V7.27H1.7a11.5 11.5 0 0 0 0 10.37l3.84-2.98z" />
      <path fill="#EA4335" d="M12 4.77c1.69 0 3.2.58 4.4 1.72l3.3-3.3C17.7 1.2 15.1 0 12 0A11.5 11.5 0 0 0 1.7 7.27l3.84 2.98C6.45 6.8 9 4.77 12 4.77z" />
    </svg>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Mode = "login" | "signup" | "forgot";

export default function Login() {
  const { login, signup, oauthError } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const displayError = error || (isForgot ? "" : oauthError) || "";

  const emailValid = EMAIL_RE.test(email.trim());
  const strong = isStrong(password);
  const matches = password === confirm;
  const signupValid = emailValid && name.trim().length > 0 && strong && matches;
  const canSubmit = busy
    ? false
    : isForgot
      ? emailValid
      : isSignup
        ? signupValid
        : email.trim().length > 0 && password.length > 0;

  function go(next: Mode) {
    setMode(next);
    setError("");
    setConfirm("");
    setShowPw(false);
    setForgotSent(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setBusy(true);
    try {
      if (isForgot) {
        await requestPasswordReset(email.trim());
        setForgotSent(true);
      } else if (isSignup) {
        await signup(email.trim(), name.trim(), password);
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const heading = isForgot ? "Reset your password" : isSignup ? "Create your account" : "Welcome back";
  const subtitle = isForgot
    ? "Enter your email and we'll send you a reset link."
    : isSignup
      ? "Sign up to analyze and track your repositories."
      : "Log in to continue to your dashboard.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className={cn("w-full transition-[max-width]", isSignup ? "max-w-md" : "max-w-sm")}>
        {/* Brand */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/15">
            <Activity className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">Repo-Pulse</span>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-xl">
          <h1 className="text-base font-bold text-foreground">{heading}</h1>
          <p className="text-xs text-muted-foreground mt-1 mb-5">{subtitle}</p>

          {isForgot && forgotSent ? (
            <div className="text-center py-2">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15">
                <MailCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-sm text-foreground">Check your inbox</p>
              <p className="mt-1 text-xs text-muted-foreground">
                If an account exists for <span className="text-foreground">{email.trim()}</span>, a reset
                link is on its way. It expires in 1 hour.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3" noValidate>
              {isSignup && <Field label="Name" type="text" value={name} onChange={setName} placeholder="Your name" autoComplete="name" />}

              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoComplete="email"
                invalid={(isSignup || isForgot) && email.length > 0 && !emailValid}
                hint={(isSignup || isForgot) && email.length > 0 && !emailValid ? "Enter a valid email address" : undefined}
              />

              {!isForgot && (
                <PasswordField
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  show={showPw}
                  onToggle={() => setShowPw((s) => !s)}
                  placeholder={isSignup ? "Create a strong password" : "••••••••"}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                />
              )}

              {isSignup && password.length > 0 && <PasswordStrength pw={password} />}

              {isSignup && (
                <PasswordField
                  label="Confirm password"
                  value={confirm}
                  onChange={setConfirm}
                  show={showPw}
                  onToggle={() => setShowPw((s) => !s)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  invalid={confirm.length > 0 && !matches}
                  hint={confirm.length > 0 && !matches ? "Passwords don't match" : undefined}
                />
              )}

              {mode === "login" && (
                <div className="text-right -mt-1">
                  <button type="button" onClick={() => go("forgot")} className="text-[11px] text-emerald-400 hover:underline" data-testid="button-forgot-password">
                    Forgot password?
                  </button>
                </div>
              )}

              {displayError && (
                <div className="text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-2.5 py-2">
                  {displayError}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full h-9 rounded-md bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                data-testid="button-auth-submit"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {isForgot ? "Send reset link" : isSignup ? "Create account" : "Log in"}
              </button>
            </form>
          )}

          {/* Social login — only on login/signup */}
          {!isForgot && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={startGitHubLogin} className="w-full h-9 rounded-md border border-border bg-background text-sm font-semibold text-foreground hover:bg-foreground/5 transition-colors flex items-center justify-center gap-2" data-testid="button-auth-github">
                  <Github className="w-4 h-4" />
                  Continue with GitHub
                </button>
                <button type="button" onClick={startGoogleLogin} className="w-full h-9 rounded-md border border-border bg-background text-sm font-semibold text-foreground hover:bg-foreground/5 transition-colors flex items-center justify-center gap-2" data-testid="button-auth-google">
                  <GoogleIcon className="w-4 h-4" />
                  Continue with Google
                </button>
              </div>
            </>
          )}

          <div className="mt-4 text-center text-xs text-muted-foreground">
            {isForgot ? (
              <button onClick={() => go("login")} className="text-emerald-400 font-semibold hover:underline" data-testid="button-back-to-login">
                Back to log in
              </button>
            ) : (
              <>
                {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
                <button onClick={() => go(isSignup ? "login" : "signup")} className="text-emerald-400 font-semibold hover:underline" data-testid="button-auth-toggle">
                  {isSignup ? "Log in" : "Sign up"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, onChange, invalid, hint, ...props
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <input
        {...props}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "mt-1 w-full h-9 rounded-md bg-background border px-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-1 transition-colors",
          invalid ? "border-red-400/60 focus:border-red-400 focus:ring-red-400/30" : "border-border focus:border-emerald-500/60 focus:ring-emerald-500/30",
        )}
      />
      {hint && <span className="mt-1 block text-[10px] text-red-400">{hint}</span>}
    </label>
  );
}
