import { useEffect, useState } from "react";
import { Activity, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { resetPassword, validateResetToken } from "@/lib/auth";
import { PasswordField, PasswordStrength, isStrong } from "@/components/PasswordFields";

const HOME = import.meta.env.BASE_URL || "/";

function tokenFromUrl(): string {
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

export default function ResetPassword() {
  const [token] = useState(tokenFromUrl);
  const [status, setStatus] = useState<"checking" | "valid" | "invalid">(token ? "checking" : "invalid");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Check the token before showing the form — a used/expired link reads as dead.
  useEffect(() => {
    if (!token) return;
    validateResetToken(token).then((valid) => setStatus(valid ? "valid" : "invalid"));
  }, [token]);

  const strong = isStrong(password);
  const matches = password === confirm;
  const canSubmit = !busy && status === "valid" && strong && matches;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/15">
            <Activity className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">Repo-Pulse</span>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-xl">
          {done ? (
            <div className="text-center py-3">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-sm text-foreground">Password updated</p>
              <p className="mt-1 text-xs text-muted-foreground">You can now log in with your new password.</p>
              <a href={HOME} className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors">
                Go to log in
              </a>
            </div>
          ) : status === "checking" ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
            </div>
          ) : status === "invalid" ? (
            <div className="text-center py-3">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-400/15">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <p className="text-sm text-foreground">Link expired or already used</p>
              <p className="mt-1 text-xs text-muted-foreground">Reset links work once and expire after 1 hour. Request a fresh one from the login page.</p>
              <a href={HOME} className="mt-4 inline-block text-xs text-emerald-400 font-semibold hover:underline">Back to log in</a>
            </div>
          ) : (
            <>
              <h1 className="text-base font-bold text-foreground">Choose a new password</h1>
              <p className="text-xs text-muted-foreground mt-1 mb-5">Enter a strong password for your account.</p>
              <form onSubmit={onSubmit} className="space-y-3" noValidate>
                <PasswordField
                  label="New password"
                  value={password}
                  onChange={setPassword}
                  show={show}
                  onToggle={() => setShow((s) => !s)}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                />
                {password.length > 0 && <PasswordStrength pw={password} />}
                <PasswordField
                  label="Confirm password"
                  value={confirm}
                  onChange={setConfirm}
                  show={show}
                  onToggle={() => setShow((s) => !s)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  invalid={confirm.length > 0 && !matches}
                  hint={confirm.length > 0 && !matches ? "Passwords don't match" : undefined}
                />

                {error && (
                  <div className="text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-2.5 py-2">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full h-9 rounded-md bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  data-testid="button-reset-submit"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Update password
                </button>
              </form>
              <div className="mt-4 text-center">
                <a href={HOME} className="text-xs text-muted-foreground hover:text-foreground">Back to log in</a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
