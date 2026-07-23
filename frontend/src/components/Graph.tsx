import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Crosshair, MessageSquare, Minus, Plus, RefreshCw, Search, X } from "lucide-react";

// The living graph: memories as glowing, physics-driven nodes with light
// particles flowing along relationships. Click a node to inspect it.

interface GNode {
  id: string;
  name: string;
  summary: string;
  labels: string[];
  degree: number;
  x?: number;
  y?: number;
}
interface GLink {
  source: string | GNode;
  target: string | GNode;
  fact: string;
  name: string;
}

const PALETTE = ["#7bd0ff", "#cebdff", "#6ee7b7", "#fcd34d", "#fda4af", "#22d3ee"];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

type Filter = "all" | "hubs";

export default function Graph({ onAsk }: { onAsk?: (prompt: string) => void }) {
  const [data, setData] = useState<{ nodes: GNode[]; links: GLink[] }>({
    nodes: [],
    links: [],
  });
  const [selected, setSelected] = useState<GNode | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/graph?limit=300");
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!wrap.current) return;
    const ob = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ob.observe(wrap.current);
    return () => ob.disconnect();
  }, []);

  const q = query.trim().toLowerCase();
  const highlighted = useMemo(() => {
    let ids = data.nodes;
    if (filter === "hubs") ids = ids.filter((n) => n.degree >= 3);
    if (q) ids = ids.filter((n) => n.name.toLowerCase().includes(q));
    if (!q && filter === "all") return null; // nothing to dim
    return new Set(ids.map((n) => n.id));
  }, [q, filter, data.nodes]);

  const facts = useMemo(() => {
    if (!selected) return [];
    return data.links
      .filter((l) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return s === selected.id || t === selected.id;
      })
      .map((l) => l.fact)
      .filter(Boolean)
      .slice(0, 14);
  }, [selected, data.links]);

  function zoom(f: number) {
    fg.current?.zoom(fg.current.zoom() * f, 300);
  }
  function focusSelected() {
    if (!selected || !Number.isFinite(selected.x)) return;
    fg.current?.centerAt(selected.x, selected.y, 500);
    fg.current?.zoom(3.2, 500);
  }

  const chip = (id: Filter, label: string) => (
    <button
      onClick={() => setFilter(id)}
      className={
        filter === id
          ? "rounded-full bg-glow/15 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-glow ring-1 ring-glow/40"
          : "rounded-full px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-dim ring-1 ring-edge transition hover:text-ink"
      }
    >
      {label}
    </button>
  );

  return (
    <div className="dotgrid relative h-full" ref={wrap}>
      {/* Toolbar */}
      <div className="absolute left-5 top-5 z-10 flex flex-wrap items-center gap-2">
        <div className="glass flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-edge focus-within:ring-glow/40">
          <Search size={14} className="text-ink-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="find a memory…"
            className="w-44 bg-transparent text-xs outline-none placeholder:text-ink-dim"
          />
        </div>
        {chip("all", "All")}
        {chip("hubs", "Hubs")}
        <button
          onClick={load}
          title="refresh"
          className="glass rounded-xl p-2.5 text-ink-dim ring-1 ring-edge transition hover:text-glow"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
        <span className="glass rounded-xl px-3 py-2 font-mono text-[10px] text-ink-dim ring-1 ring-edge">
          <span className="text-glow">{data.nodes.length}</span> nodes ·{" "}
          <span className="text-glow-2">{data.links.length}</span> edges
        </span>
      </div>

      {/* Zoom controls + legend */}
      <div className="absolute bottom-5 left-5 z-10 flex flex-col gap-2">
        <div className="glass flex flex-col overflow-hidden rounded-xl ring-1 ring-edge">
          <button onClick={() => zoom(1.4)} className="p-2.5 text-ink-dim transition hover:text-glow">
            <Plus size={14} />
          </button>
          <div className="mx-2 h-px bg-edge" />
          <button onClick={() => zoom(0.7)} className="p-2.5 text-ink-dim transition hover:text-glow">
            <Minus size={14} />
          </button>
        </div>
        <div className="glass rounded-xl p-3 ring-1 ring-edge">
          <div className="microlabel mb-2">Legend</div>
          {[
            ["#7bd0ff", "entity"],
            ["#cebdff", "concept"],
            ["#6ee7b7", "project"],
          ].map(([c, l]) => (
            <div key={l} className="flex items-center gap-2 py-0.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: c, boxShadow: `0 0 6px ${c}` }}
              />
              <span className="font-mono text-[10px] text-ink-dim">{l}</span>
            </div>
          ))}
          <div className="mt-1 font-mono text-[9px] text-ink-dim">size = connections</div>
        </div>
      </div>

      {data.nodes.length === 0 && !loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <p className="text-sm text-ink-dim">
            No memories yet — feed me, and watch your brain grow here.
          </p>
        </div>
      )}

      <ForceGraph2D
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor="rgba(0,0,0,0)"
        nodeId="id"
        nodeVal={(n: GNode) => 2 + Math.min(n.degree, 12)}
        linkColor={() => "rgba(123,208,255,0.16)"}
        linkWidth={1}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={1.6}
        linkDirectionalParticleSpeed={0.0045}
        linkDirectionalParticleColor={() => "#7bd0ff"}
        onNodeClick={(n) => setSelected(n as GNode)}
        onBackgroundClick={() => setSelected(null)}
        nodeCanvasObject={(node, ctx, scale) => {
          const n = node as GNode;
          if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return; // engine hasn't placed it yet
          const dimmed = highlighted !== null && !highlighted.has(n.id);
          const color = colorFor(n.name);
          const r = 3 + Math.min(n.degree, 12) * 0.9;

          ctx.globalAlpha = dimmed ? 0.1 : 1;

          const grad = ctx.createRadialGradient(n.x!, n.y!, 0, n.x!, n.y!, r * 3);
          grad.addColorStop(0, color + "55");
          grad.addColorStop(1, "transparent");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r * 3, 0, 2 * Math.PI);
          ctx.fill();

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
          ctx.fill();

          if (selected?.id === n.id) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.2 / scale;
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, r + 2.5, 0, 2 * Math.PI);
            ctx.stroke();
          }

          if (scale > 1.4 || selected?.id === n.id || (highlighted && highlighted.has(n.id))) {
            ctx.font = `${Math.max(10 / scale, 2.6)}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.fillStyle = dimmed ? "rgba(225,226,238,0.2)" : "#e1e2ee";
            ctx.fillText(n.name, n.x!, n.y! + r + 8 / scale);
          }
          ctx.globalAlpha = 1;
        }}
      />

      {/* Node detail panel — slides in from the right (Stitch reference) */}
      {selected && (
        <div className="glass animate-fade-up absolute bottom-0 right-0 top-0 z-10 flex w-[340px] flex-col border-l border-edge p-6">
          <div className="flex items-start justify-between">
            <span className="rounded-md bg-glow-2/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-glow-2 ring-1 ring-glow-2/30">
              {selected.labels.filter((l) => l !== "Entity")[0] ?? "Entity"}
            </span>
            <button
              onClick={() => setSelected(null)}
              className="text-ink-dim transition hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
          <h2
            className="mt-3 text-xl font-semibold tracking-tight"
            style={{ color: colorFor(selected.name) }}
          >
            {selected.name}
          </h2>
          <div className="mt-1.5 font-mono text-[10px] text-ink-dim">
            {selected.degree} edges · {selected.id.slice(0, 8)}
          </div>
          {selected.summary && (
            <p className="mt-4 text-[13px] leading-relaxed text-ink-dim">
              {selected.summary}
            </p>
          )}
          {facts.length > 0 && (
            <>
              <div className="microlabel mt-6 text-glow">Connected facts</div>
              <ul className="mt-2 flex-1 space-y-2.5 overflow-y-auto pr-1">
                {facts.map((f, i) => (
                  <li key={i} className="flex gap-2.5 text-xs leading-relaxed">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: PALETTE[i % PALETTE.length],
                        boxShadow: `0 0 5px ${PALETTE[i % PALETTE.length]}`,
                      }}
                    />
                    {f}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={focusSelected}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-glow/15 py-2.5 font-mono text-[11px] uppercase tracking-widest text-glow ring-1 ring-glow/40 transition hover:bg-glow/25"
            >
              <Crosshair size={13} /> Focus
            </button>
            {onAsk && (
              <button
                onClick={() => onAsk(`Tell me everything you remember about "${selected.name}".`)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-glow-2/15 py-2.5 font-mono text-[11px] uppercase tracking-widest text-glow-2 ring-1 ring-glow-2/40 transition hover:bg-glow-2/25"
              >
                <MessageSquare size={13} /> Ask
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
