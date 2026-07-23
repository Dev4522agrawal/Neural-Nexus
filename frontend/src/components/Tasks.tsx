import { useEffect, useMemo, useState } from "react";
import { Check, Circle, Plus, Sparkles, Trash2 } from "lucide-react";
import { api, TaskItem } from "../api";

// The task brain: to-dos added by hand, captured from chat, or AI-extracted.
// Study/career/project/general categories, priority ordering, one-click done.

const CATS = [
  { id: "all", label: "All" },
  { id: "general", label: "General" },
  { id: "study", label: "Study" },
  { id: "career", label: "Career" },
  { id: "project", label: "Project" },
];

const CAT_COLOR: Record<string, string> = {
  general: "#7bd0ff",
  study: "#6ee7b7",
  career: "#fcd34d",
  project: "#cebdff",
};
const PRIO_COLOR: Record<string, string> = { high: "#fda4af", med: "#7bd0ff", low: "#5d6b85" };

export default function Tasks() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [cat, setCat] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState("");
  const [newCat, setNewCat] = useState("general");
  const [newPrio, setNewPrio] = useState("med");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await api.tasks();
      setTasks(res.tasks);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!title.trim()) return;
    const t = await api.addTask({ title: title.trim(), category: newCat as any, priority: newPrio as any });
    setTasks((cur) => [t, ...cur]);
    setTitle("");
  }
  async function toggle(t: TaskItem) {
    const next = t.status === "open" ? "done" : "open";
    const updated = await api.updateTask(t.id, { status: next as any });
    setTasks((cur) => cur.map((x) => (x.id === t.id ? updated : x)));
  }
  async function remove(id: string) {
    await api.deleteTask(id).catch(() => {});
    setTasks((cur) => cur.filter((x) => x.id !== id));
  }

  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (cat === "all" || t.category === cat) &&
          (showDone || t.status === "open")
      ),
    [tasks, cat, showDone]
  );
  const openCount = tasks.filter((t) => t.status === "open").length;

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 font-mono text-[11px] text-ink-dim">
            {openCount} open · captured from chat, insights, or added by hand
          </p>
        </div>
        <button
          onClick={() => setShowDone((s) => !s)}
          className="rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-dim ring-1 ring-edge transition hover:text-ink"
        >
          {showDone ? "hide done" : "show done"}
        </button>
      </div>

      {/* Add */}
      <div className="glass mt-5 flex flex-wrap items-center gap-2 rounded-2xl p-2 ring-1 ring-edge focus-within:ring-glow/50">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a task…"
          className="min-w-[180px] flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-ink-dim"
        />
        <select
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          className="cursor-pointer rounded-lg bg-panel-2 px-2.5 py-2 font-mono text-[10px] uppercase tracking-wider text-ink outline-none ring-1 ring-edge"
        >
          {CATS.slice(1).map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <select
          value={newPrio}
          onChange={(e) => setNewPrio(e.target.value)}
          className="cursor-pointer rounded-lg bg-panel-2 px-2.5 py-2 font-mono text-[10px] uppercase tracking-wider text-ink outline-none ring-1 ring-edge"
        >
          <option value="high">high</option>
          <option value="med">med</option>
          <option value="low">low</option>
        </select>
        <button
          onClick={add}
          disabled={!title.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-glow/15 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-glow ring-1 ring-glow/40 transition hover:bg-glow/25 disabled:opacity-30"
        >
          <Plus size={12} /> add
        </button>
      </div>

      {/* Category filter */}
      <div className="mt-4 flex flex-wrap gap-2">
        {CATS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={
              cat === c.id
                ? "rounded-full bg-glow/15 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-glow ring-1 ring-glow/40"
                : "rounded-full px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-dim ring-1 ring-edge transition hover:text-ink"
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-5 space-y-2">
        {loading && <p className="font-mono text-xs text-ink-dim">loading…</p>}
        {!loading && visible.length === 0 && (
          <div className="glass rounded-2xl p-6 text-center text-sm text-ink-dim ring-1 ring-edge">
            Nothing here yet. Add a task above, or just chat — I capture action items
            automatically.
          </div>
        )}
        {visible.map((t) => (
          <div
            key={t.id}
            className="glass group flex items-center gap-3 rounded-xl p-3.5 ring-1 ring-edge transition hover:ring-edge-2"
          >
            <button onClick={() => toggle(t)} className="shrink-0">
              {t.status === "done" ? (
                <Check size={17} className="text-glow-3" />
              ) : (
                <Circle size={17} className="text-ink-dim transition hover:text-glow" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className={"text-sm " + (t.status === "done" ? "text-ink-dim line-through" : "")}>
                {t.title}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                  style={{ color: CAT_COLOR[t.category], background: CAT_COLOR[t.category] + "18" }}
                >
                  {t.category}
                </span>
                <span className="font-mono text-[9px] uppercase" style={{ color: PRIO_COLOR[t.priority] }}>
                  {t.priority}
                </span>
                {t.source !== "manual" && (
                  <span className="flex items-center gap-1 font-mono text-[9px] text-ink-dim">
                    <Sparkles size={9} /> {t.source}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => remove(t.id)}
              className="shrink-0 text-ink-dim opacity-0 transition hover:text-rose group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
