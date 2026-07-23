import { useEffect, useMemo, useState } from "react";
import { Brain, MessageSquare, Sparkles, Upload } from "lucide-react";
import { api, EventItem, Stats } from "../api";

// Mission log of the mind: every event, grouped by day, with an activity
// strip, System Pulse, and type filters (Stitch reference).

const TYPE_META: Record<string, { icon: typeof Upload; color: string; label: string }> = {
  ingest: { icon: Upload, color: "#7bd0ff", label: "Uploads" },
  chat: { icon: MessageSquare, color: "#cebdff", label: "Conversations" },
  memory: { icon: Brain, color: "#6ee7b7", label: "Memories" },
  insight: { icon: Sparkles, color: "#fcd34d", label: "Insights" },
};

function metaFor(type: string) {
  const prefix = type.split(".")[0];
  return TYPE_META[prefix] ?? TYPE_META.memory;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "TODAY";
  if (d.toDateString() === yest.toDateString()) return "YESTERDAY";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
}

export default function Timeline() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [active, setActive] = useState<Set<string>>(new Set(Object.keys(TYPE_META)));
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [ev, st] = await Promise.all([api.events(120), api.stats()]);
      setEvents(ev.events);
      setStats(st);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => events.filter((e) => active.has(e.type.split(".")[0]) || !TYPE_META[e.type.split(".")[0]]),
    [events, active]
  );

  const groups = useMemo(() => {
    const g: { label: string; items: EventItem[] }[] = [];
    for (const e of filtered) {
      const label = dayLabel(e.created_at);
      const last = g[g.length - 1];
      if (last && last.label === label) last.items.push(e);
      else g.push({ label, items: [e] });
    }
    return g;
  }, [filtered]);

  const maxHist = Math.max(...(stats?.histogram.map((h) => h.count) ?? [1]), 1);

  function toggle(k: string) {
    const next = new Set(active);
    next.has(k) ? next.delete(k) : next.add(k);
    setActive(next);
  }

  return (
    <div className="flex h-full">
      {/* Main column */}
      <div className="flex-1 overflow-y-auto px-10 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
        <p className="mt-1 font-mono text-[11px] text-ink-dim">
          tracing cognitive events · newest first
        </p>

        {/* Activity strip */}
        {stats && stats.histogram.length > 0 && (
          <div className="mt-6 flex h-12 items-end gap-1.5">
            {stats.histogram.map((h, i) => (
              <div key={i} className="group relative flex-1">
                <div
                  className="w-full rounded-t-sm bg-glow/60 transition group-hover:bg-glow"
                  style={{
                    height: `${Math.max((h.count / maxHist) * 44, 3)}px`,
                    boxShadow: i === stats.histogram.length - 1 ? "0 0 10px #7bd0ff80" : "none",
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {loading && <p className="mt-8 font-mono text-xs text-ink-dim">loading…</p>}
        {!loading && groups.length === 0 && (
          <p className="mt-8 text-sm text-ink-dim">
            Nothing yet — ingest a note or start a conversation.
          </p>
        )}

        {/* Spine */}
        <div className="relative mt-8">
          <div
            className="absolute bottom-0 left-[7px] top-0 w-px"
            style={{
              background: "linear-gradient(180deg, #7bd0ff66, #cebdff33, transparent)",
            }}
          />
          {groups.map((g) => (
            <div key={g.label + g.items[0].id}>
              <div className="relative mb-4 ml-8">
                <span className="glass rounded-full px-3 py-1 font-mono text-[10px] tracking-widest text-ink ring-1 ring-edge">
                  {g.label}
                </span>
              </div>
              {g.items.map((e) => {
                const m = metaFor(e.type);
                const Icon = m.icon;
                return (
                  <div key={e.id} className="relative mb-3 ml-8">
                    <span
                      className="absolute -left-[29px] top-3 h-2 w-2 rounded-full"
                      style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }}
                    />
                    <div className="glass animate-fade-up rounded-xl p-4 ring-1 ring-edge transition hover:ring-edge-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Icon size={13} style={{ color: m.color }} />
                          <span
                            className="font-mono text-[10px] uppercase tracking-widest"
                            style={{ color: m.color }}
                          >
                            {e.type}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-ink-dim">
                          {new Date(e.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="mt-1.5 text-sm">{e.title}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Right rail */}
      <aside className="glass w-64 shrink-0 border-l border-edge p-5">
        <div className="microlabel">System pulse</div>
        <div className="glass mt-3 rounded-2xl p-4 ring-1 ring-edge">
          <div className="font-mono text-3xl font-semibold text-glow">
            {stats?.events_today ?? 0}
          </div>
          <div className="mt-1 text-xs text-ink-dim">events logged today</div>
        </div>

        <div className="microlabel mt-7">Event filters</div>
        <div className="mt-3 space-y-2">
          {Object.entries(TYPE_META).map(([k, m]) => (
            <button
              key={k}
              onClick={() => toggle(k)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-panel-3"
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded border"
                style={{
                  borderColor: m.color,
                  background: active.has(k) ? m.color + "33" : "transparent",
                }}
              >
                {active.has(k) && (
                  <span className="h-1.5 w-1.5 rounded-sm" style={{ background: m.color }} />
                )}
              </span>
              <span className="font-mono text-[11px] text-ink">{m.label}</span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
