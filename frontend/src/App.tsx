import { useCallback, useEffect, useState } from "react";
import {
  BrainCircuit,
  CheckSquare,
  Clock,
  LayoutDashboard,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Search,
  Trash2,
  Waypoints,
} from "lucide-react";
import { api, ContextUsed, ConversationSummary, HealthStatus } from "./api";
import Chat, { UiMessage } from "./components/Chat";
import CommandPalette from "./components/CommandPalette";
import Dashboard from "./components/Dashboard";
import Inspector from "./components/Inspector";
import Ingest from "./components/Ingest";
import Timeline from "./components/Timeline";
import Graph from "./components/Graph";
import Tasks from "./components/Tasks";

type View = "dashboard" | "chat" | "graph" | "tasks" | "ingest" | "timeline";

const NAV: { id: View; label: string; icon: typeof MessageSquare }[] = [
  { id: "dashboard", label: "Command center", icon: LayoutDashboard },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "graph", label: "Graph", icon: Waypoints },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "ingest", label: "Add to memory", icon: PlusCircle },
  { id: "timeline", label: "Timeline", icon: Clock },
];

function HealthDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1" title={`${label}: ${ok ? "up" : "down"}`}>
      <span
        className={"h-1.5 w-1.5 rounded-full " + (ok ? "bg-glow-3" : "bg-rose")}
        style={{ boxShadow: ok ? "0 0 5px #6ee7b7" : "0 0 5px #fda4af" }}
      />
      <span className="font-mono text-[8px] uppercase tracking-wider text-ink-dim">{label}</span>
    </span>
  );
}

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [ctx, setCtx] = useState<ContextUsed | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("nx-sidebar") === "collapsed");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [prefill, setPrefill] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  async function refreshConversations() {
    try {
      const res = await api.conversations();
      setConversations(res.conversations);
    } catch {
      /* backend may be starting up */
    }
  }

  useEffect(() => {
    refreshConversations();
  }, [conversationId, view]);

  // Health polling for the status dots
  useEffect(() => {
    const check = () => api.health().then(setHealth).catch(() => setHealth(null));
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  // ⌘K global shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleSidebar() {
    setCollapsed((c) => {
      localStorage.setItem("nx-sidebar", c ? "open" : "collapsed");
      return !c;
    });
  }

  async function openConversation(id: string) {
    const res = await api.conversation(id);
    setConversationId(id);
    setMessages(
      res.messages.map((m) => ({ role: m.role, content: m.content, model: m.model }))
    );
    setCtx(null);
    setView("chat");
  }

  function newChat() {
    setConversationId(null);
    setMessages([]);
    setCtx(null);
    setView("chat");
  }

  async function deleteThread(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this conversation? (Its filed memories stay in the graph.)")) return;
    await api.deleteConversation(id).catch(() => {});
    if (id === conversationId) newChat();
    refreshConversations();
  }

  const askInChat = useCallback((prompt: string) => {
    setView("chat");
    setPrefill(prompt);
  }, []);

  return (
    <div className="aurora relative flex h-full overflow-hidden">
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        conversations={conversations}
        onNavigate={setView}
        onOpenConversation={openConversation}
        onAsk={askInChat}
      />

      {/* Sidebar */}
      <aside
        className={
          "glass relative z-10 flex shrink-0 flex-col border-r border-edge transition-all duration-200 " +
          (collapsed ? "w-16" : "w-64")
        }
      >
        <div className={"flex items-center pt-6 " + (collapsed ? "justify-center px-0" : "gap-2.5 px-5")}>
          <div className="glow-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-glow/10">
            <BrainCircuit size={19} className="text-glow" />
          </div>
          {!collapsed && (
            <div>
              <div className="bg-gradient-to-r from-glow via-glow-2 to-glow-3 bg-clip-text text-sm font-bold tracking-[0.18em] text-transparent">
                NEURAL NEXUS
              </div>
              <div className="font-mono text-[8px] uppercase tracking-[0.3em] text-ink-dim">
                personal cognitive os
              </div>
            </div>
          )}
        </div>

        <nav className="mt-5 flex flex-col gap-1 px-3">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              title={label}
              className={
                (view === id
                  ? "glow-ring bg-glow/10 text-glow "
                  : "text-ink-dim hover:bg-panel-3 hover:text-ink ") +
                "flex items-center rounded-xl py-2.5 text-left text-[13px] font-medium transition " +
                (collapsed ? "justify-center px-0" : "gap-2.5 px-3.5")
              }
            >
              <Icon size={15} className="shrink-0" />
              {!collapsed && label}
            </button>
          ))}
          <button
            onClick={() => setPaletteOpen(true)}
            title="Search (⌘K)"
            className={
              "flex items-center rounded-xl py-2.5 text-left text-[13px] text-ink-dim transition hover:bg-panel-3 hover:text-ink " +
              (collapsed ? "justify-center px-0" : "gap-2.5 px-3.5")
            }
          >
            <Search size={15} className="shrink-0" />
            {!collapsed && (
              <span className="flex flex-1 items-center justify-between">
                Search
                <kbd className="rounded bg-panel-3 px-1.5 font-mono text-[9px] text-ink-dim ring-1 ring-edge">⌘K</kbd>
              </span>
            )}
          </button>
        </nav>

        {!collapsed && (
          <>
            <div className="mt-6 flex items-center justify-between px-5">
              <span className="microlabel">Active threads</span>
              <button
                onClick={newChat}
                title="New conversation"
                className="rounded-md px-1.5 text-base leading-none text-glow transition hover:bg-panel-3"
              >
                +
              </button>
            </div>
            <div className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className={
                    "group flex w-full cursor-pointer items-center gap-1 rounded-lg px-3 py-2 text-left text-xs transition " +
                    (c.id === conversationId && view === "chat"
                      ? "bg-panel-3 text-glow ring-1 ring-glow/25"
                      : "text-ink-dim hover:bg-panel-3 hover:text-ink")
                  }
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <button
                    onClick={(e) => deleteThread(c.id, e)}
                    title="delete thread"
                    className="shrink-0 opacity-0 transition hover:text-rose group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        {collapsed && <div className="flex-1" />}

        {/* Health dots + collapse toggle */}
        <div className={"border-t border-edge py-3 " + (collapsed ? "px-2" : "px-4")}>
          {!collapsed && health && (
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
              <HealthDot ok={health.services.neo4j} label="graph" />
              <HealthDot ok={health.services.postgres} label="db" />
              <HealthDot ok={health.services.ollama} label="local ai" />
              <HealthDot ok={health.services.gemini === "configured"} label="cloud ai" />
            </div>
          )}
          <button
            onClick={toggleSidebar}
            title={collapsed ? "expand sidebar" : "collapse sidebar"}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-1.5 text-ink-dim transition hover:bg-panel-3 hover:text-ink"
          >
            {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            {!collapsed && (
              <span className="font-mono text-[9px] uppercase tracking-widest">collapse</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="relative z-10 min-w-0 flex-1">
        {view === "dashboard" && (
          <Dashboard onOpenConversation={openConversation} onNavigate={setView} />
        )}
        {view === "chat" && (
          <Chat
            conversationId={conversationId}
            messages={messages}
            setMessages={setMessages}
            setConversationId={setConversationId}
            onContext={setCtx}
            prefill={prefill}
            onPrefillDone={() => setPrefill(null)}
          />
        )}
        {view === "graph" && <Graph onAsk={askInChat} />}
        {view === "tasks" && <Tasks />}
        {view === "ingest" && <Ingest onDone={refreshConversations} />}
        {view === "timeline" && <Timeline />}
      </main>

      {/* Neural activity inspector (chat only) */}
      {view === "chat" && (
        <aside className="glass relative z-10 w-72 shrink-0 border-l border-edge">
          <Inspector ctx={ctx} />
        </aside>
      )}
    </div>
  );
}
