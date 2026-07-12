import { useRef, useState } from "react";
import { Check, Upload, X, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSettings, useUpdateSettings } from "@/lib/use-settings";
import { Avatar, AVATAR_PRESETS } from "@/lib/avatars";
import { cn } from "@/lib/utils";

// Downscale & center-crop an uploaded image to a small square data-URL so it
// stays tiny in the database.
function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // 112px @ webp q0.7 keeps avatars sharp at their 28–48px render sizes
      // while keeping the stored data-URL small (typically a few KB).
      const S = 112;
      const canvas = document.createElement("canvas");
      canvas.width = S; canvas.height = S;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("no canvas")); return; }
      const scale = Math.max(S / img.width, S / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/webp", 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

// The avatar-picker modal, as a controlled component so other surfaces (e.g. the
// profile menu) can open it.
export function AvatarPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const current = settings?.avatar ?? "";
  const choose = (avatar: string) => update.mutate({ avatar });

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setUploadError(null);
    try {
      choose(await fileToAvatarDataUrl(file));
    } catch {
      setUploadError("Couldn't read that image. Try a PNG or JPG.");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Profile picture</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1" data-testid="button-avatar-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          {/* Current */}
          <div className="flex items-center gap-3 mb-4">
            <Avatar avatar={current} name={user?.name} size={48} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{user?.name ?? "—"}</div>
              <div className="text-[11px] text-muted-foreground truncate">{user?.email ?? ""}</div>
            </div>
            {update.isPending && <Loader2 className="w-4 h-4 text-emerald-400 animate-spin ml-auto" />}
          </div>

          {/* Presets */}
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Presets</div>
          <div className="grid grid-cols-4 gap-2.5 mb-4">
            {AVATAR_PRESETS.map((p) => {
              const value = `preset:${p.id}`;
              const active = current === value;
              return (
                <button
                  key={p.id}
                  onClick={() => choose(value)}
                  style={{ width: 52, height: 52 }}
                  className={cn(
                    "relative rounded-full justify-self-center transition-transform hover:scale-105",
                    active && "ring-2 ring-emerald-400 ring-offset-2 ring-offset-card",
                  )}
                  data-testid={`avatar-preset-${p.id}`}
                  title={p.id}
                >
                  <Avatar avatar={value} size={52} />
                  {active && (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Upload + reset */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-400 transition-colors"
              data-testid="button-avatar-upload"
            >
              <Upload className="w-3.5 h-3.5" /> Upload your own
            </button>
            <button
              onClick={() => choose("")}
              disabled={!current}
              className="h-9 px-3 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
              data-testid="button-avatar-reset"
            >
              Use initials
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
          </div>
          {uploadError && <p className="mt-2 text-[11px] text-red-400">{uploadError}</p>}
        </div>
      </div>
    </div>
  );
}

// Standalone avatar that opens the picker on click (kept for any direct use).
export default function AvatarButton({ size = 28, className }: { size?: number; className?: string }) {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Change profile picture"
        className={cn("rounded-full shrink-0 ring-0 hover:ring-2 hover:ring-emerald-400/50 transition-shadow", className)}
        data-testid="button-avatar"
      >
        <Avatar avatar={settings?.avatar ?? ""} name={user?.name} size={size} />
      </button>
      <AvatarPicker open={open} onClose={() => setOpen(false)} />
    </>
  );
}
