import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Copy, RotateCcw, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, ContextUsed } from "../api";

export interface UiMessage {
  role: "user" | "assistant";
  content: string;
  model?: string | null;
  notice?: string | null;
  context?: ContextUsed;
}

interface Props {
  conversationId: string | null;
  messages: UiMessage[];
  setMessages: (m: UiMessage[]) => void;
  setConversationId: (id: string) => void;
  onContext: (ctx: ContextUsed | null) => void;
  prefill?: string | null;
  onPrefillDone?: () => void;
}

export default function Chat({
  conversationId,
  messages,
  setMessages,
  setConversationId,
  onContext,
  prefill,
  onPrefillDone,
}: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState("auto"); // router override: auto|code|research|general|offline
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (prefill) {
      setInput(prefill);
      inputRef.current?.focus();
      onPrefillDone?.();
    }
  }, [prefill, onPrefillDone]);

  function copyMessage(content: string, i: number) {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  async function send(retryText?: string) {
    const text = (retryText ?? input).trim();
    if (!text || busy) return;
    setError(null);
    setLastFailed(null);
    if (!retryText) setInput("");
    const next: UiMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await api.chat(
        text,
        conversationId ?? undefined,
        task === "auto" ? undefined : task
      );
      setConversationId(res.conversation_id);
      setMessages([
        ...next,
        {
          role: "assistant",
          content: res.response,
          model: res.model,
          notice: res.notice,
          context: res.context_used,
        },
      ]);
      onContext(res.context_used);
    } catch (e) {
      setError(String(e));
      setLastFailed(text);
      setMessages(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb header */}
      <div className="glass flex items-center justify-between border-b border-edge px-8 py-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-dim">
          Conversations <span className="text-edge-2">›</span>{" "}
          <span className="text-glow">
            {conversationId ? "cognitive sync" : "new thread"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Router override: which librarian takes this question */}
          <select
            value={task}
            onChange={(e) => setTask(e.target.value)}
            title="AI Router override"
            className="cursor-pointer rounded-full bg-panel-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-glow outline-none ring-1 ring-edge transition hover:ring-glow/40"
          >
            <option value="auto">⚡ auto-route</option>
            <option value="code">code</option>
            <option value="research">research</option>
            <option value="general">general</option>
            <option value="offline">local (offline)</option>
          </select>
          <div className="flex items-center gap-1.5 rounded-full bg-panel-2 px-3 py-1.5 ring-1 ring-edge">
            <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-glow-3" />
            <span className="font-mono text-[10px] text-ink-dim">
              {[...messages].reverse().find((m) => m.model)?.model ?? "no model yet"}
            </span>
          </div>
        </div>
      </div>

      <div className="dotgrid flex-1 space-y-5 overflow-y-auto px-8 py-6">
        {messages.length === 0 && !busy && (
          <div className="mt-28 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-glow/10 ring-1 ring-glow/30">
              <Sparkles size={22} className="text-glow" />
            </div>
            <div className="bg-gradient-to-r from-glow via-glow-2 to-glow-3 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              Neural Nexus
            </div>
            <p className="mt-3 text-sm text-ink-dim">
              I retrieve your memories before I answer. Nothing is forgotten.
            </p>
            <div className="mx-auto mt-8 flex max-w-md flex-wrap justify-center gap-2">
              {[
                "What was I working on recently?",
                "What do you know about my projects?",
                "What ideas have I had?",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="glass rounded-full px-4 py-2 text-xs text-ink-dim ring-1 ring-edge transition hover:text-glow hover:ring-glow/40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={
              "animate-fade-up flex " +
              (m.role === "user" ? "justify-end" : "justify-start")
            }
          >
            <div
              className={
                m.role === "user"
                  ? "max-w-[72%] rounded-2xl rounded-br-md bg-gradient-to-br from-glow/20 to-glow-2/15 px-4 py-3 text-sm ring-1 ring-glow/25"
                  : "glass max-w-[72%] rounded-2xl rounded-bl-md px-4 py-3 text-sm ring-1 ring-edge"
              }
            >
              {m.role === "assistant" ? (
                <div className="md text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
              )}
              {m.notice && (
                <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber/10 px-2.5 py-1.5 font-mono text-[10px] text-amber ring-1 ring-amber/30">
                  🌙 {m.notice}
                </div>
              )}
              {m.role === "assistant" && (
                <div className="mt-2.5 flex items-center gap-3 border-t border-edge pt-2 text-[11px] text-ink-dim">
                  {m.model && <span className="font-mono">{m.model}</span>}
                  {m.context && (
                    <button
                      onClick={() => onContext(m.context!)}
                      className="text-glow transition hover:brightness-125"
                    >
                      {m.context.memories.length} memories used →
                    </button>
                  )}
                  <button
                    onClick={() => copyMessage(m.content, i)}
                    title="copy answer"
                    className="ml-auto flex items-center gap-1 transition hover:text-ink"
                  >
                    {copied === i ? <Check size={11} className="text-glow-3" /> : <Copy size={11} />}
                    {copied === i ? "copied" : "copy"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2.5 text-xs text-ink-dim">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-glow opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-glow" />
            </span>
            retrieving memories &amp; thinking…
          </div>
        )}
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-red-950/40 px-4 py-2.5 text-xs text-red-300 ring-1 ring-red-900/60">
            <span>{error}</span>
            {lastFailed && (
              <button
                onClick={() => send(lastFailed)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-900/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-red-200 ring-1 ring-red-800 transition hover:bg-red-900/60"
              >
                <RotateCcw size={11} /> retry
              </button>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="px-8 pb-6">
        <div className="glass flex items-end gap-2 rounded-2xl p-2 ring-1 ring-edge transition focus-within:ring-glow/50">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Message your second brain…"
            className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-ink-dim"
          />
          <button
            onClick={() => send()}
            disabled={busy || !input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-glow to-glow-2 text-void transition hover:brightness-110 disabled:opacity-30"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-ink-dim">
          every answer shows its retrieved context in the right panel
        </p>
      </div>
    </div>
  );
}
