import { useEffect, useRef, useState } from "react";
import { X, Send, Sparkles, KeyRound, Loader2, FileCode2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { FileNode } from "@workspace/api-client-react";
import {
  fetchChatModels, sendChat, getByokKey, setByokKey, getSavedModel, setSavedModel,
  type ChatModel, type ChatTurn,
} from "@/lib/chat-api";
import { cn } from "@/lib/utils";

// Keep the last N messages (≈6 exchanges) when sending, to bound token cost.
// The backend enforces its own cap too — this just trims the payload.
const CHAT_HISTORY_LIMIT = 12;

const SUGGESTIONS = [
  "What are the riskiest files and why?",
  "Where should I start refactoring?",
  "Summarize this repo's technical debt.",
  "Which files change together a lot?",
];

export default function ChatDrawer({
  repoId, selectedFile, open, onClose,
}: {
  repoId: number;
  selectedFile: FileNode | null;
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [models, setModels] = useState<ChatModel[]>([]);
  const [model, setModel] = useState<string>(getSavedModel());
  const [hasAppKey, setHasAppKey] = useState(true);

  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState(getByokKey());

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the model list once the drawer is first opened.
  useEffect(() => {
    if (!open || models.length) return;
    fetchChatModels()
      .then((res) => {
        setModels(res.models);
        setHasAppKey(res.hasAppKey);
        setModel((m) => m || res.models[0]?.id || "");
      })
      .catch(() => setHasAppKey(false));
  }, [open, models.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const byok = getByokKey();
  const needsKey = !hasAppKey && !byok;

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const { reply } = await sendChat(repoId, {
        // Send only the recent turns to bound tokens/cost; the full transcript
        // stays on screen. The backend also caps this, so it's not a trust boundary.
        messages: next.slice(-CHAT_HISTORY_LIMIT),
        model: model || undefined,
        fileId: selectedFile?.id ?? null,
        apiKey: byok || undefined,
      });
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  function saveKey() {
    setByokKey(keyInput.trim());
    setShowKey(false);
  }

  return (
    <>
      {/* Click-away backdrop */}
      {open && <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />}

      <aside
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-[380px] max-w-[90vw] bg-card border-l border-border shadow-2xl flex flex-col transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
        data-testid="chat-drawer"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border px-3 h-12 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-foreground">Repo Assistant</span>
          <button
            onClick={() => setShowKey((v) => !v)}
            title="Model & API key"
            className={cn("ml-auto p-1 rounded-md hover:bg-muted transition-colors",
              byok ? "text-emerald-400" : "text-muted-foreground")}
            data-testid="button-chat-key"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1" data-testid="button-chat-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Model + key settings */}
        <div className="shrink-0 border-b border-border px-3 py-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Model</span>
            <select
              value={model}
              onChange={(e) => { setModel(e.target.value); setSavedModel(e.target.value); }}
              className="flex-1 min-w-0 h-7 bg-muted/40 border border-border rounded-md px-2 text-xs text-foreground focus:outline-none"
              data-testid="select-chat-model"
            >
              {models.length === 0 && <option value="">Loading…</option>}
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          {showKey && (
            <div className="space-y-1.5">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Your OpenRouter API key (optional)"
                className="w-full h-7 bg-muted/40 border border-border rounded-md px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                data-testid="input-chat-key"
              />
              <div className="flex items-center gap-2">
                <button onClick={saveKey} className="h-6 px-2 rounded bg-emerald-500 text-white text-[11px] font-semibold hover:bg-emerald-400">Save</button>
                {byok && <button onClick={() => { setByokKey(""); setKeyInput(""); }} className="h-6 px-2 rounded border border-border text-[11px] text-muted-foreground">Remove</button>}
                <span className="text-[10px] text-muted-foreground">Stored only in your browser.</span>
              </div>
            </div>
          )}
        </div>

        {/* Context chip */}
        {selectedFile && (
          <div className="shrink-0 px-3 py-1.5 border-b border-border/60 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <FileCode2 className="w-3 h-3 text-emerald-400" />
            Context: <span className="text-foreground truncate">{selectedFile.name}</span>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center pt-6">
              <p className="text-xs text-muted-foreground mb-3">Ask about this repository's risk, hotspots, coupling, or coverage.</p>
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-[12px] px-2.5 py-1.5 rounded-md border border-border bg-muted/30 text-foreground hover:bg-muted/60 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-[12px] leading-relaxed",
                  m.role === "user"
                    ? "bg-emerald-500 text-white whitespace-pre-wrap"
                    : "bg-muted/60 text-foreground",
                )}>
                  {m.role === "user" ? (
                    m.content
                  ) : (
                    // Assistant replies are Markdown. Security: react-markdown builds React
                    // elements and does NOT render raw HTML unless rehype-raw is added (it
                    // isn't), so injected <script>/<img onerror> in model output can't run.
                    // We also drop images (a data-exfil vector) and force-safe link targets.
                    <div className="chat-md">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          img: () => null,
                          a: ({ node: _n, ...props }) => (
                            <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
                          ),
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-lg px-3 py-2 bg-muted/60">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              </div>
            </div>
          )}
          {error && <p className="text-[11px] text-red-400 px-1">{error}</p>}
          {needsKey && (
            <p className="text-[11px] text-orange-400 px-1">
              No free model key is configured. Add your own OpenRouter key via the key icon above to chat.
            </p>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-border p-2.5">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              rows={1}
              placeholder="Ask about this repo…"
              className="flex-1 resize-none max-h-28 bg-muted/40 border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="input-chat"
            />
            <button
              onClick={() => send(input)}
              disabled={sending || !input.trim()}
              className="h-9 w-9 shrink-0 rounded-md bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-400 disabled:opacity-50 transition-colors"
              data-testid="button-chat-send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
