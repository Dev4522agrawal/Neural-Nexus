import { Activity, Database } from "lucide-react";
import { ContextUsed } from "../api";

// NEURAL ACTIVITY: exactly what the Context Engine retrieved before answering.
// Transparency is a core product principle — the AI always shows its work.

const DOT = ["#7bd0ff", "#cebdff", "#6ee7b7", "#fcd34d", "#fda4af"];

export default function Inspector({ ctx }: { ctx: ContextUsed | null }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      <div className="flex items-center gap-2">
        <Activity size={13} className="text-glow" />
        <h2 className="microlabel">Neural activity</h2>
      </div>

      {!ctx ? (
        <p className="mt-5 text-xs leading-relaxed text-ink-dim">
          Send a message and I'll show exactly which memories, events and
          conversation turns were retrieved before answering — the reasoning
          behind every reply.
        </p>
      ) : (
        <>
          {/* Retrieval path */}
          <section className="mt-5">
            <div className="mb-2.5 flex items-center gap-2">
              <Database size={12} className="text-glow" />
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-glow">
                Memories retrieved · {ctx.memories.length}
              </h3>
            </div>
            {ctx.memories.length === 0 && (
              <p className="text-xs text-ink-dim">none matched this prompt</p>
            )}
            <div className="relative">
              {ctx.memories.length > 1 && (
                <div
                  className="absolute bottom-3 left-[3px] top-3 w-px"
                  style={{ background: "linear-gradient(180deg,#7bd0ff44,#cebdff22)" }}
                />
              )}
              <ul className="space-y-2.5">
                {ctx.memories.map((m, i) => (
                  <li key={i} className="animate-fade-up relative flex gap-3" style={{ animationDelay: `${i * 70}ms` }}>
                    <span
                      className="relative mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{
                        background: DOT[i % DOT.length],
                        boxShadow: `0 0 7px ${DOT[i % DOT.length]}`,
                      }}
                    />
                    <div className="glass flex-1 rounded-lg px-3 py-2 text-[11.5px] leading-relaxed ring-1 ring-edge">
                      {m.fact}
                      {m.valid_at && (
                        <div className="mt-1 font-mono text-[9px] text-ink-dim">
                          since {new Date(m.valid_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mt-6">
            <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-glow-2">
              Recent activity · {ctx.recent_events.length}
            </h3>
            <ul className="space-y-1.5">
              {ctx.recent_events.map((e, i) => (
                <li key={i} className="text-[10.5px] leading-snug text-ink-dim">
                  <span className="font-mono text-ink">{e.type}</span> — {e.title}
                </li>
              ))}
            </ul>
          </section>

          <section className="glass mt-6 rounded-xl p-3 ring-1 ring-edge">
            <div className="flex items-center justify-between font-mono text-[10px]">
              <span className="text-ink-dim">turns in context</span>
              <span className="text-glow">{ctx.conversation_turns_included}</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
