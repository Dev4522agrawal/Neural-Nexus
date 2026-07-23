import { useEffect, useState } from "react";
import {
  ArrowRight,
  Lightbulb,
  Link2,
  MessageSquare,
  Pin,
  RefreshCw,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { Check, CircleDashed } from "lucide-react";
import { api, ConversationSummary, EventItem, InsightItem, Stats, TaskItem } from "../api";

const KIND_COLOR: Record<string, string> = {
  connection: "#7bd0ff",
  opportunity: "#6ee7b7",
  reminder: "#fcd34d",
  observation: "#cebdff",
};

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Spark({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-8 items-end gap-1">
      {data.map((v, i) => (
        <div
          key={i}
          className="w-2.5 rounded-sm transition-all"
          style={{
            height: `${Math.max((v / max) * 100, 8)}%`,
            background: color,
            opacity: i === data.length - 1 ? 1 : 0.35,
            boxShadow: i === data.length - 1 ? `0 0 8px ${color}` : "none",
          }}
        />
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  spark,
  color,
}: {
  label: string;
  value: number;
  spark: number[];
  color: string;
}) {
  return (
    <div className="glass animate-fade-up rounded-2xl p-4 ring-1 ring-edge transition hover:ring-edge-2">
      <div className="microlabel">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <span className="font-mono text-2xl font-semibold" style={{ color }}>
          {value.toLocaleString()}
        </span>
        <Spark data={spark} color={color} />
      </div>
    </div>
  );
}

export default function Dashboard({
  onOpenConversation,
  onNavigate,
}: {
  onOpenConversation: (id: string) => void;
  onNavigate: (view: "chat" | "graph" | "tasks" | "ingest" | "timeline") => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [convos, setConvos] = useState<ConversationSummary[]>([]);
  const [recent, setRecent] = useState<EventItem[]>([]);
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  function loadInsights() {
    api.insights().then((r) => setInsights(r.insights)).catch(() => {});
  }
  function loadTasks() {
    api.tasks("open").then((r) => setTasks(r.tasks.slice(0, 5))).catch(() => {});
  }

  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
    api.conversations().then((r) => setConvos(r.conversations.slice(0, 4))).catch(() => {});
    api.events(30).then((r) => setRecent(r.events)).catch(() => {});
    loadInsights();
    loadTasks();
  }, []);

  async function completeTask(id: string) {
    await api.updateTask(id, { status: "done" }).catch(() => {});
    setTasks((cur) => cur.filter((t) => t.id !== id));
  }

  async function generateNow() {
    setGenerating(true);
    setGenError("");
    try {
      await api.generateInsights();
      loadInsights();
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGenerating(false);
    }
  }

  const [capture, setCapture] = useState("");
  const [captureState, setCaptureState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function quickCapture() {
    const text = capture.trim();
    if (!text || captureState === "busy") return;
    setCaptureState("busy");
    try {
      const now = new Date();
      await api.ingestText(
        `Quick note — ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        text
      );
      setCapture("");
      setCaptureState("done");
      setTimeout(() => setCaptureState("idle"), 2500);
    } catch {
      setCaptureState("error");
      setTimeout(() => setCaptureState("idle"), 4000);
    }
  }

  async function dismiss(id: string) {
    await api.dismissInsight(id).catch(() => {});
    setInsights((cur) => cur.filter((i) => i.id !== id));
  }
  async function togglePin(id: string) {
    await api.pinInsight(id).catch(() => {});
    loadInsights();
  }

  const hist = stats?.histogram.map((h) => h.count) ?? [];
  const pad = (n: number) => (hist.length >= n ? hist.slice(-n) : [...Array(n - hist.length).fill(0), ...hist]);
  const memoriesRecent = recent.filter((e) => e.type.startsWith("ingest")).slice(0, 4);

  return (
    <div className="h-full overflow-y-auto px-10 py-8">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-4xl font-semibold tracking-tight">
          {greeting()}, Dev
        </h1>
        <p className="mt-1.5 text-sm text-ink-dim">Here's where your mind left off.</p>
      </div>

      {/* Quick capture: thought → memory in two seconds */}
      <div className="glass mt-6 flex items-center gap-2 rounded-2xl p-2 ring-1 ring-edge transition focus-within:ring-glow/50">
        <Sparkles size={15} className="ml-2 shrink-0 text-glow-2" />
        <input
          value={capture}
          onChange={(e) => setCapture(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && quickCapture()}
          placeholder="Remember something… an idea, a decision, a thing you learned"
          className="flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-ink-dim"
        />
        <button
          onClick={quickCapture}
          disabled={captureState === "busy" || !capture.trim()}
          className="rounded-xl bg-glow/15 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-glow ring-1 ring-glow/40 transition hover:bg-glow/25 disabled:opacity-30"
        >
          {captureState === "busy" ? "filing…" : captureState === "done" ? "✓ filed" : captureState === "error" ? "failed" : "remember"}
        </button>
      </div>

      {/* Stat strip */}
      <div className="mt-7 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Memories" value={stats?.memories ?? 0} spark={pad(6)} color="#7bd0ff" />
        <StatCard label="Connections" value={stats?.connections ?? 0} spark={pad(6)} color="#cebdff" />
        <StatCard label="Conversations" value={stats?.conversations ?? 0} spark={pad(6)} color="#6ee7b7" />
        <StatCard label="Events today" value={stats?.events_today ?? 0} spark={pad(6)} color="#fcd34d" />
      </div>

      <div className="mt-9 grid gap-8 xl:grid-cols-[1fr_340px]">
        {/* Continue where you left off */}
        <section>
          <div className="microlabel">Continue where you left off</div>
          <div className="mt-3 space-y-3">
            {convos.length === 0 && (
              <button
                onClick={() => onNavigate("chat")}
                className="glass block w-full rounded-2xl p-5 text-left ring-1 ring-edge transition hover:ring-glow/40"
              >
                <span className="text-sm text-ink-dim">
                  No conversations yet — start your first thread →
                </span>
              </button>
            )}
            {convos.map((c, i) => (
              <button
                key={c.id}
                onClick={() => onOpenConversation(c.id)}
                className="glass animate-fade-up group flex w-full items-center gap-4 rounded-2xl p-5 text-left ring-1 ring-edge transition hover:ring-glow/40"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-glow/10 ring-1 ring-glow/25">
                  <MessageSquare size={16} className="text-glow" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.title}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-ink-dim">
                    {timeAgo(c.created_at)} · {c.id.slice(0, 8)}
                  </div>
                </div>
                <ArrowRight
                  size={15}
                  className="shrink-0 text-ink-dim transition group-hover:translate-x-1 group-hover:text-glow"
                />
              </button>
            ))}
          </div>

          {/* Recently remembered */}
          <div className="microlabel mt-8">Recently remembered</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {memoriesRecent.length === 0 && (
              <button
                onClick={() => onNavigate("ingest")}
                className="glass rounded-2xl p-4 text-left text-sm text-ink-dim ring-1 ring-edge transition hover:ring-glow/40"
              >
                Feed me something — notes, ideas, decisions →
              </button>
            )}
            {memoriesRecent.map((e) => (
              <div key={e.id} className="glass rounded-2xl p-4 ring-1 ring-edge">
                <div className="truncate text-sm">{e.title}</div>
                <div className="mt-1 font-mono text-[10px] text-ink-dim">
                  {e.type} · {timeAgo(e.created_at)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right column: tasks + insights */}
        <div className="space-y-8">
        {/* Today's tasks */}
        <section>
          <div className="flex items-center justify-between">
            <div className="microlabel">Tasks</div>
            <button
              onClick={() => onNavigate("tasks")}
              className="font-mono text-[10px] uppercase tracking-widest text-glow transition hover:brightness-125"
            >
              all →
            </button>
          </div>
          <div className="glass mt-3 rounded-2xl p-2 ring-1 ring-edge">
            {tasks.length === 0 ? (
              <p className="px-2 py-3 text-xs text-ink-dim">
                No open tasks. Add some, or just chat — I capture them automatically.
              </p>
            ) : (
              tasks.map((t) => (
                <div
                  key={t.id}
                  className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-panel-3"
                >
                  <button onClick={() => completeTask(t.id)} className="shrink-0">
                    <CircleDashed
                      size={15}
                      className="text-ink-dim transition group-hover:text-glow-3"
                    />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{t.title}</span>
                  {t.priority === "high" && (
                    <span className="shrink-0 font-mono text-[9px] uppercase text-rose">high</span>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Live insights */}
        <section>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="microlabel">Live insights</div>
              <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-glow" />
            </div>
            <button
              onClick={generateNow}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-glow ring-1 ring-glow/30 transition hover:bg-glow/10 disabled:opacity-40"
            >
              <RefreshCw size={11} className={generating ? "animate-spin" : ""} />
              {generating ? "analyzing…" : "generate"}
            </button>
          </div>
          {genError && (
            <div className="mt-3 rounded-xl bg-red-950/40 px-3 py-2 font-mono text-[10px] text-rose ring-1 ring-red-900/60">
              {genError}
            </div>
          )}
          <div className="mt-3 space-y-3">
            {insights.length === 0 && !generating && (
              <div className="glass rounded-2xl border-l-2 border-glow-2 p-4 ring-1 ring-edge">
                <div className="flex items-start gap-3">
                  <Sparkles size={15} className="mt-0.5 shrink-0 text-glow-2" />
                  <p className="text-[13px] leading-relaxed text-ink-dim">
                    No discoveries yet. Feed the graph, then hit{" "}
                    <span className="text-glow">generate</span> — or let the daily
                    analyst run overnight.
                  </p>
                </div>
              </div>
            )}
            {insights.map((ins) => {
              const color = KIND_COLOR[ins.kind] ?? "#cebdff";
              return (
                <div
                  key={ins.id}
                  className="glass animate-fade-up group rounded-2xl border-l-2 p-4 ring-1 ring-edge"
                  style={{ borderLeftColor: color }}
                >
                  <div className="flex items-start gap-3">
                    <Lightbulb size={15} className="mt-0.5 shrink-0" style={{ color }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className="font-mono text-[9px] uppercase tracking-widest"
                          style={{ color }}
                        >
                          {ins.kind}
                        </span>
                        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            onClick={() => togglePin(ins.id)}
                            title={ins.pinned ? "unpin" : "pin"}
                            className={ins.pinned ? "text-glow" : "text-ink-dim hover:text-glow"}
                          >
                            <Pin size={12} />
                          </button>
                          <button
                            onClick={() => dismiss(ins.id)}
                            title="dismiss"
                            className="text-ink-dim hover:text-rose"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 text-[13px] font-medium text-ink">{ins.title}</div>
                      <p className="mt-1 text-xs leading-relaxed text-ink-dim">{ins.body}</p>
                      {ins.refs.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {ins.refs.slice(0, 4).map((r) => (
                            <span
                              key={r}
                              className="flex items-center gap-1 rounded-full bg-panel-3 px-2 py-0.5 font-mono text-[9px] text-ink-dim ring-1 ring-edge"
                            >
                              <Link2 size={9} />
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => onNavigate("graph")}
              className="glass group flex w-full items-center justify-between rounded-2xl p-4 ring-1 ring-edge transition hover:ring-glow/40"
            >
              <div className="flex items-center gap-3">
                <Share2 size={15} className="text-glow-3" />
                <span className="text-[13px]">Open the living graph</span>
              </div>
              <ArrowRight size={14} className="text-ink-dim transition group-hover:translate-x-1" />
            </button>
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}
