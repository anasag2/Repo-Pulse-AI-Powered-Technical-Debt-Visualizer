import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  SlidersHorizontal, Bell, KeyRound, ChevronDown, Loader2, Check, Trash2, UserCircle2, Github, Link2, Pencil, X,
} from "lucide-react";
import { pageEnter, stagger, rise } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useSettings, useUpdateSettings } from "@/lib/use-settings";
import { getByokKey, setByokKey, fetchChatModels } from "@/lib/chat-api";
import { useAuth } from "@/lib/auth-context";
import { startGitHubLogin, startGoogleLogin } from "@/lib/auth";
import { Avatar } from "@/lib/avatars";
import { AvatarPicker } from "@/components/AvatarButton";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

// A collapsible settings row. `children` renders only while expanded, so
// sections that have nothing to configure yet (badge=true) stay inert.
function SettingsSection({
  icon: Icon, title, desc, badge, open, onToggle, children,
}: {
  icon: typeof SlidersHorizontal;
  title: string;
  desc: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <motion.div variants={rise} className="bg-card border border-card-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors hover:border-emerald-400/30"
        data-testid={`button-settings-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{title}</p>
              {badge && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
          </div>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && children && (
        <div className="px-4 pb-4 pt-1 border-t border-border">{children}</div>
      )}
    </motion.div>
  );
}

function AnalysisSettingsBody() {
  const { data: settings, isLoading } = useSettings();
  const update = useUpdateSettings();

  if (isLoading) {
    return <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="pt-3 space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Default color mode</span>
        <p className="text-[11px] text-muted-foreground/70 mb-1.5">Applied the first time you open a repository's map.</p>
        <select
          value={settings?.defaultColorBy ?? "risk"}
          onChange={(e) => update.mutate({ defaultColorBy: e.target.value })}
          className="w-full h-8 bg-muted/40 border border-border rounded-md px-2 text-xs text-foreground focus:outline-none"
          data-testid="select-default-color-by"
        >
          <option value="risk">Risk Score</option>
          <option value="hotspot">Hotspot</option>
          <option value="churn">Churn</option>
          <option value="complexity">Complexity</option>
          <option value="coverage">Test Coverage</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Default view</span>
        <p className="text-[11px] text-muted-foreground/70 mb-1.5">3D city or flat 2D map.</p>
        <select
          value={settings?.defaultView ?? "3d"}
          onChange={(e) => update.mutate({ defaultView: e.target.value })}
          className="w-full h-8 bg-muted/40 border border-border rounded-md px-2 text-xs text-foreground focus:outline-none"
          data-testid="select-default-view"
        >
          <option value="3d">3D City</option>
          <option value="2d">2D Map</option>
        </select>
      </label>
      {update.isPending && <p className="text-[11px] text-muted-foreground">Saving…</p>}
    </div>
  );
}

function ProfileBody() {
  const { user, updateProfile } = useAuth();
  const { data: settings } = useSettings();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setNameInput(user?.name ?? "");
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === user?.name) { setEditing(false); return; }
    setBusy(true);
    setError(null);
    try {
      await updateProfile(trimmed);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update your name.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPickerOpen(true)}
          title="Change profile picture"
          className="rounded-full shrink-0 ring-0 hover:ring-2 hover:ring-emerald-400/50 transition-shadow"
          data-testid="button-settings-avatar"
        >
          <Avatar avatar={settings?.avatar ?? ""} name={user?.name} size={44} />
        </button>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
                disabled={busy}
                autoFocus
                maxLength={80}
                className="h-8 min-w-0 flex-1 bg-muted/40 border border-border rounded-md px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
                data-testid="input-edit-name"
              />
              <button
                onClick={save}
                disabled={busy || !nameInput.trim()}
                className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 transition-colors"
                title="Save"
                data-testid="button-save-name"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={busy}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
                title="Cancel"
                data-testid="button-cancel-name"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group">
              <p className="text-sm font-medium text-foreground truncate">{user?.name ?? "—"}</p>
              <button
                onClick={startEdit}
                className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Edit name"
                data-testid="button-edit-name"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
        </div>
        <button
          onClick={() => setPickerOpen(true)}
          className="ml-auto h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          data-testid="button-change-picture"
        >
          Change picture
        </button>
      </div>
      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Email is tied to your login method and can't be changed here.
      </p>
      <AvatarPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}

// The user doc stores a single `provider` slot (github/google/none), so this
// shows the one active sign-in method rather than a list of "connections" —
// linking a different provider replaces it, it doesn't add a second one.
function SignInMethodBody() {
  const { user } = useAuth();
  const provider = user?.provider ?? null;

  return (
    <div className="pt-3 space-y-2">
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <Github className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground">GitHub</span>
        </div>
        {provider === "github" ? (
          <span className="text-[10px] font-medium text-emerald-400">Connected</span>
        ) : (
          <button onClick={startGitHubLogin} className="text-[11px] text-emerald-400 hover:underline" data-testid="button-connect-github">
            Connect
          </button>
        )}
      </div>
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <Link2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground">Google</span>
        </div>
        {provider === "google" ? (
          <span className="text-[10px] font-medium text-emerald-400">Connected</span>
        ) : (
          <button onClick={startGoogleLogin} className="text-[11px] text-emerald-400 hover:underline" data-testid="button-connect-google">
            Connect
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {provider ? "Connecting a different provider replaces this one." : "You're using email & password. Connecting a provider links it to this account."}
      </p>
    </div>
  );
}

function ApiKeysBody() {
  const { data, isLoading } = useQuery({ queryKey: ["chat-models"], queryFn: fetchChatModels });
  const [keyInput, setKeyInput] = useState(getByokKey());
  const [saved, setSaved] = useState(false);
  const byok = getByokKey();

  const save = () => {
    setByokKey(keyInput.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="pt-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        {isLoading ? (
          "Checking key status…"
        ) : byok ? (
          "Using your own OpenRouter key for the AI chat and walkthroughs."
        ) : data?.hasAppKey ? (
          "Using the shared app key — add your own below if you'd rather use your own quota."
        ) : (
          "No shared app key configured — add your own OpenRouter key below to use AI chat and walkthroughs."
        )}
      </p>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">OpenRouter API key</span>
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="sk-or-..."
          className="mt-1.5 w-full h-8 bg-muted/40 border border-border rounded-md px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          data-testid="input-settings-api-key"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          className="h-7 px-3 rounded-md bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-400 transition-colors flex items-center gap-1.5"
          data-testid="button-save-api-key"
        >
          {saved && <Check className="w-3.5 h-3.5" />}
          {saved ? "Saved" : "Save"}
        </button>
        {byok && (
          <button
            onClick={() => { setByokKey(""); setKeyInput(""); }}
            className="h-7 px-3 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-remove-api-key"
          >
            Remove
          </button>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">Stored only in your browser.</span>
      </div>
    </div>
  );
}

function ComingSoonBody({ text }: { text: string }) {
  return <p className="pt-3 text-xs text-muted-foreground">{text}</p>;
}

// Deleting the account is irreversible and destroys every repo/setting owned
// by it, so it requires a code emailed to the account address (not just a
// click), unlike the single-click repo delete elsewhere in the app.
function DangerZone() {
  const { user, requestDeleteCode, deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"intro" | "code">("intro");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNotice, setSentNotice] = useState(false);

  const openDialog = () => {
    setOpen(true);
    setPhase("intro");
    setCode("");
    setError(null);
    setSentNotice(false);
  };

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestDeleteCode();
      setPhase("code");
      setSentNotice(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the confirmation code.");
    } finally {
      setBusy(false);
    }
  };

  const canDelete = code.trim().length === 6 && !busy;

  const onDelete = async () => {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(code.trim());
      // AuthProvider clears the user on success, which drops us to the Login
      // page automatically (see App.tsx's AuthGate) — no manual redirect needed.
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code is invalid or has expired.");
      setBusy(false);
    }
  };

  return (
    <>
      <motion.div variants={rise} className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-red-400">Delete Account</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently deletes your account, all analyzed repositories, and their history. This cannot be undone.
            </p>
          </div>
          <button
            onClick={openDialog}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-red-500/40 text-red-400 text-xs font-semibold hover:bg-red-500/10 transition-colors"
            data-testid="button-delete-account"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete account
          </button>
        </div>
      </motion.div>

      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogContent data-testid="dialog-delete-account">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {user?.email ?? "your"} account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account and every repository, analysis, and setting tied to it.
              There is no way to recover this afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {phase === "intro" ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                We'll email a 6-digit confirmation code to <span className="text-foreground">{user?.email}</span> to make sure this is really you.
              </p>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          ) : (
            <div className="space-y-1.5">
              {sentNotice && (
                <p className="text-xs text-emerald-400">
                  Code sent to {user?.email}. It expires in 10 minutes.
                </p>
              )}
              <label className="text-xs font-medium text-muted-foreground" htmlFor="delete-code-input">
                Enter the 6-digit code
              </label>
              <input
                id="delete-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={busy}
                inputMode="numeric"
                placeholder="000000"
                className="w-full h-9 bg-muted/40 border border-border rounded-md px-2.5 text-sm tracking-[0.3em] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-red-400/40"
                data-testid="input-delete-code"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={sendCode}
                disabled={busy}
                className="text-[11px] text-muted-foreground hover:text-foreground underline disabled:opacity-40"
                data-testid="button-resend-delete-code"
              >
                Resend code
              </button>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} data-testid="button-delete-account-cancel">Cancel</AlertDialogCancel>
            {phase === "intro" ? (
              <button
                onClick={sendCode}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-red-600 text-white text-sm font-semibold hover:bg-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="button-send-delete-code"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? "Sending…" : "Send confirmation code"}
              </button>
            ) : (
              <button
                onClick={onDelete}
                disabled={!canDelete}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-red-600 text-white text-sm font-semibold hover:bg-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="button-delete-account-confirm"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? "Deleting…" : "Delete my account"}
              </button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function Settings() {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggle = (key: string) => setOpenSection((s) => (s === key ? null : key));

  return (
    <motion.div {...pageEnter} className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Account and configuration preferences</p>
        </div>
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-3">
          <SettingsSection
            icon={SlidersHorizontal}
            title="Analysis Settings"
            desc="Default color mode and view for new repositories"
            open={openSection === "analysis"}
            onToggle={() => toggle("analysis")}
          >
            <AnalysisSettingsBody />
          </SettingsSection>

          <SettingsSection
            icon={Bell}
            title="Notification Preferences"
            desc="Configure your notification preferences"
            badge="Coming soon"
            open={openSection === "notifications"}
            onToggle={() => toggle("notifications")}
          >
            <ComingSoonBody text="Email/in-app notifications aren't built yet — nothing to configure here." />
          </SettingsSection>

          <SettingsSection
            icon={UserCircle2}
            title="Profile"
            desc="Your name, email, and picture"
            open={openSection === "profile"}
            onToggle={() => toggle("profile")}
          >
            <ProfileBody />
          </SettingsSection>

          <SettingsSection
            icon={KeyRound}
            title="API Keys"
            desc="Bring your own OpenRouter key for AI chat"
            open={openSection === "keys"}
            onToggle={() => toggle("keys")}
          >
            <ApiKeysBody />
          </SettingsSection>

          <SettingsSection
            icon={Github}
            title="Sign-in Method"
            desc="How you log in — email/password, GitHub, or Google"
            open={openSection === "signin"}
            onToggle={() => toggle("signin")}
          >
            <SignInMethodBody />
          </SettingsSection>
        </motion.div>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wider text-red-400/70">Danger Zone</h2>
        <motion.div variants={stagger} initial="hidden" animate="show" className="mt-2">
          <DangerZone />
        </motion.div>
      </div>
    </motion.div>
  );
}
