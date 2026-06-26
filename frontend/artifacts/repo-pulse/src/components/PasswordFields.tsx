import { Eye, EyeOff, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Password rules — mirrored on the backend. Strong = 8+ chars AND ≥3 categories.
export function pwChecks(pw: string) {
  return [
    { ok: pw.length >= 8, label: "8+ characters" },
    { ok: /[a-z]/.test(pw), label: "Lowercase" },
    { ok: /[A-Z]/.test(pw), label: "Uppercase" },
    { ok: /[0-9]/.test(pw), label: "Number" },
    { ok: /[^A-Za-z0-9]/.test(pw), label: "Symbol" },
  ];
}

export function isStrong(pw: string): boolean {
  const c = pwChecks(pw);
  const categories = c.slice(1).filter((x) => x.ok).length; // upper/lower/number/symbol
  return c[0].ok && categories >= 3;
}

export function PasswordStrength({ pw }: { pw: string }) {
  const checks = pwChecks(pw);
  const score = checks.filter((c) => c.ok).length;
  const pct = (score / checks.length) * 100;
  const color = score <= 2 ? "#ef4444" : score === 3 ? "#f59e0b" : score === 4 ? "#84cc16" : "#22c55e";
  const word = score <= 2 ? "Weak" : score === 3 ? "Fair" : score === 4 ? "Good" : "Strong";
  return (
    <div className="space-y-1.5 -mt-1">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
        <span className="text-[10px] font-semibold w-9 text-right" style={{ color }}>{word}</span>
      </div>
      <ul className="grid grid-cols-3 gap-x-2 gap-y-0.5">
        {checks.map((c) => (
          <li key={c.label} className={cn("flex items-center gap-1 text-[10px]", c.ok ? "text-emerald-400" : "text-muted-foreground/50")}>
            <Check className={cn("w-3 h-3 shrink-0", c.ok ? "opacity-100" : "opacity-30")} />
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PasswordField({
  label, value, onChange, show, onToggle, invalid, hint, ...props
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  invalid?: boolean;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type">) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="relative mt-1">
        <input
          {...props}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full h-9 rounded-md bg-background border px-2.5 pr-9 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-1 transition-colors",
            invalid ? "border-red-400/60 focus:border-red-400 focus:ring-red-400/30" : "border-border focus:border-emerald-500/60 focus:ring-emerald-500/30",
          )}
        />
        <button type="button" onClick={onToggle} tabIndex={-1} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <span className="mt-1 block text-[10px] text-red-400">{hint}</span>}
    </label>
  );
}
