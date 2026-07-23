import { useEffect, useRef, useState } from "react";
import { Brain, CheckSquare, Clock, LayoutDashboard, MessageSquare, PlusCircle, Search, Waypoints } from "lucide-react";
import { api, ConversationSummary, MemoryFact } from "../api";

// ⌘K: one keystroke to search memories, jump to threads, or switch views.

type View = "dashboard" | "chat" | "graph" | "tasks" | "ingest" | "timeline";

interface Props {
  open: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  onNavigate: (v: View) => void;
  onOpenConversation: (id: string) => void;
  onAsk: (prompt: string) => void;
}

const VIEWS: { id: View; label: string; icon: typeof Search }[] = [
  { id: "dashboard", label: "Command center", icon: LayoutDashboard },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "graph", label: "Graph", icon: Waypoints },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "ingest", label: "Add to memory", icon: PlusCircle },
  { id: "timeline", label: "Timeline", icon: Clock },
];

export default function CommandPalette({
  open, onClose, conversations, onNavigate, onOpenConversation, onAsk,
}: Props) {
  const [q, setQ] = useState("");
  const [memories, setMemories] = useState<MemoryFact[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setMemories([]);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounced memory search against the graph.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 3) {
      setMemories([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `http://localhost:8000/api/search?q=${encodeURIComponent(q)}&limit=5`
        );
        const json = await res.json();
        setMemories(json.results ?? []);
      } catch {
        setMemories([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, [q]);

  if (!open) return null;

  const ql = q.trim().toLowerCase();
  const views = VIEWS.filter((v) => !ql || v.label.toLowerCase().includes(ql));
  const threads = conversations
    .filter((c) => !ql || c.title.toLowerCase().includes(ql))
    .slice(0, 5);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[18vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass animate-fade-up w-[560px] overflow-hidden rounded-2xl ring-1 ring-edge-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-edge px-4 py-3.5">
          <Search size={16} className="text-glow" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="Search memories, threads, views…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-dim"
          />
          <kbd className="rounded bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-dim ring-1 ring-edge">
            esc
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {/* Memories */}
          {(memories.length > 0 || searching) && (
            <>
              <div className="microlabel px-2 pb-1 pt-2">
                Memories {searching && "· searching…"}
              </div>
              {memories.map((m, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onAsk(`Tell me more about this: "${m.fact}"`);
                    onClose();
                  }}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-panel-3"
                >
                  <Brain size={13} className="mt-0.5 shrink-0 text-glow-2" />
                  <span className="text-xs leading-relaxed">{m.fact}</span>
                </button>
              ))}
            </>
          )}

          {/* Threads */}
          {threads.length > 0 && (
            <>
              <div className="microlabel px-2 pb-1 pt-2">Threads</div>
              {threads.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onOpenConversation(c.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-panel-3"
                >
                  <MessageSquare size={13} className="shrink-0 text-glow" />
                  <span className="truncate text-xs">{c.title}</span>
                </button>
              ))}
            </>
          )}

          {/* Views */}
          <div className="microlabel px-2 pb-1 pt-2">Go to</div>
          {views.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                onNavigate(id);
                onClose();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-panel-3"
            >
              <Icon size={13} className="shrink-0 text-ink-dim" />
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
