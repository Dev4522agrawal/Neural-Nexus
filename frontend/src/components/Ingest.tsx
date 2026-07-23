import { useEffect, useRef, useState } from "react";
import { Brain, BrainCog, Check, FileUp, Import, Trash2, Type } from "lucide-react";
import { api, EpisodeInfo, EventItem } from "../api";
import Importers from "./Importers";

// The ingestion airlock: paste text, upload files, or mass-import staged
// exports — every path ends in the same pipeline into the graph.

const STAGES = ["Parse", "Extract", "Embed", "Connect", "Filed"];

const TABS = [
  { id: "text" as const, label: "Paste text", icon: Type },
  { id: "file" as const, label: "Upload file", icon: FileUp },
  { id: "import" as const, label: "Import sources", icon: Import },
  { id: "manage" as const, label: "Memories", icon: Brain },
];
type Tab = (typeof TABS)[number]["id"];

function MemoryManager() {
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await api.episodes(150);
      setEpisodes(res.episodes);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function forget(uuid: string, name: string) {
    if (!confirm(`Forget "${name}"? Its extracted facts leave the graph. This cannot be undone.`))
      return;
    await api.forgetEpisode(uuid).catch(() => {});
    setEpisodes((cur) => cur.filter((e) => e.uuid !== uuid));
  }

  return (
    <div className="glass mt-5 rounded-2xl ring-1 ring-edge">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <span className="microlabel">
          {loading ? "loading…" : `${episodes.length} memories in the graph`}
        </span>
        <span className="font-mono text-[9px] text-ink-dim">
          forgetting removes the memory AND its extracted facts
        </span>
      </div>
      <div className="max-h-[420px] overflow-y-auto p-2">
        {!loading && episodes.length === 0 && (
          <p className="px-3 py-4 text-xs text-ink-dim">nothing remembered yet</p>
        )}
        {episodes.map((e) => (
          <div
            key={e.uuid}
            className="group flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-panel-3"
          >
            <Brain size={13} className="shrink-0 text-glow-2" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px]">{e.name}</div>
              <div className="font-mono text-[9px] text-ink-dim">
                {e.source}
                {e.created_at && ` · ${new Date(e.created_at).toLocaleDateString()}`}
              </div>
            </div>
            <button
              onClick={() => forget(e.uuid, e.name)}
              title="forget this memory"
              className="shrink-0 rounded-lg p-1.5 text-ink-dim opacity-0 transition hover:text-rose group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Ingest({ onDone }: { onDone: () => void }) {
  const [tab, setTab] = useState<Tab>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [stage, setStage] = useState(-1);
  const [recent, setRecent] = useState<EventItem[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadRecent() {
    try {
      const res = await api.events(50);
      setRecent(
        res.events
          .filter((e) => e.type.startsWith("ingest") || e.type.startsWith("import"))
          .slice(0, 6)
      );
    } catch {
      /* ok */
    }
  }
  useEffect(() => {
    loadRecent();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  function startPipeline() {
    setState("busy");
    setMsg("");
    setStage(0);
    timer.current = setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES.length - 2)),
      9000
    );
  }
  function endPipeline(ok: boolean, message: string) {
    if (timer.current) clearInterval(timer.current);
    setStage(ok ? STAGES.length - 1 : -1);
    setState(ok ? "done" : "error");
    setMsg(message);
    if (ok) {
      loadRecent();
      onDone();
    }
  }

  async function submitText() {
    if (!title.trim() || !content.trim() || state === "busy") return;
    startPipeline();
    try {
      await api.ingestText(title.trim(), content.trim());
      setTitle("");
      setContent("");
      endPipeline(true, "Filed into your graph.");
    } catch (e) {
      endPipeline(false, String(e));
    }
  }

  async function submitFile() {
    if (!file || state === "busy") return;
    startPipeline();
    try {
      const res = await api.ingestFile(file);
      setFile(null);
      endPipeline(true, `Filed into your graph${res.chunks > 1 ? ` (${res.chunks} parts)` : ""}.`);
    } catch (e) {
      endPipeline(false, String(e));
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto px-10 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Ingest knowledge</h1>
        <p className="mt-1 font-mono text-[11px] text-ink-dim">
          system ready to contextualize new entities
        </p>

        {/* Tabs */}
        <div className="mt-6 flex flex-wrap gap-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={
                tab === id
                  ? "flex items-center gap-2 rounded-xl bg-glow/12 px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-glow ring-1 ring-glow/40"
                  : "flex items-center gap-2 rounded-xl px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-ink-dim ring-1 ring-edge transition hover:text-ink"
              }
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {tab === "manage" ? (
          <MemoryManager />
        ) : tab === "import" ? (
          <div className="mt-5">
            <Importers onActivity={() => { loadRecent(); onDone(); }} />
          </div>
        ) : (
          <div className="relative mt-5 rounded-3xl border border-dashed border-glow/30 p-8 transition focus-within:border-glow/60">
            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-glow/[0.02]" />
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-glow/10 ring-1 ring-glow/25">
              <BrainCog size={24} className="text-glow" />
            </div>

            {tab === "text" && (
              <>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title — e.g. “Interactive Intelligence architecture notes”"
                  className="relative w-full rounded-xl bg-panel-2 px-4 py-3 text-sm outline-none ring-1 ring-edge placeholder:text-ink-dim focus:ring-glow/50"
                />
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  placeholder="Drop anything here — notes, decisions, meeting minutes, fleeting ideas. The nexus will parse, extract entities, and connect it to your graph."
                  className="relative mt-3 w-full resize-y rounded-xl bg-panel-2 px-4 py-3 text-sm leading-relaxed outline-none ring-1 ring-edge placeholder:text-ink-dim focus:ring-glow/50"
                />
              </>
            )}

            {tab === "file" && (
              <label className="relative block cursor-pointer rounded-xl bg-panel-2 px-4 py-10 text-center ring-1 ring-edge transition hover:ring-glow/40">
                <input
                  type="file"
                  accept=".txt,.md,.markdown,.pdf,.log,.json,.csv"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <div className="text-sm">
                  {file ? (
                    <span className="text-glow">{file.name}</span>
                  ) : (
                    <>
                      <span className="text-ink">Choose a file</span>
                      <span className="text-ink-dim"> — txt, md, pdf</span>
                    </>
                  )}
                </div>
                <div className="mt-1 font-mono text-[10px] text-ink-dim">
                  parsed locally, filed into the graph
                </div>
              </label>
            )}

            <div className="relative mt-4 flex items-center gap-4">
              <button
                onClick={tab === "text" ? submitText : submitFile}
                disabled={
                  state === "busy" ||
                  (tab === "text" ? !title.trim() || !content.trim() : !file)
                }
                className="rounded-xl bg-gradient-to-r from-glow/80 to-glow-2/80 px-6 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-void transition hover:brightness-110 disabled:opacity-30"
              >
                {state === "busy" ? "Filing…" : "Remember this"}
              </button>
              {msg && (
                <span
                  className={
                    state === "error"
                      ? "text-xs text-rose"
                      : "flex items-center gap-1.5 text-xs text-glow-3"
                  }
                >
                  {state === "done" && <Check size={13} />}
                  {msg}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Processing pipeline (text/file tabs) */}
        {tab !== "import" && tab !== "manage" && (
          <div className="glass mt-6 rounded-2xl p-5 ring-1 ring-edge">
            <div className="flex items-center justify-between">
              <div className="microlabel">Processing pipeline</div>
              {state === "busy" && (
                <span className="font-mono text-[10px] text-glow">
                  gemini free tier · ~30–60s
                </span>
              )}
            </div>
            <div className="mt-4 flex items-center">
              {STAGES.map((s, i) => {
                const done = stage > i || (state === "done" && stage >= STAGES.length - 1);
                const current = stage === i && state === "busy";
                return (
                  <div key={s} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center">
                      <div
                        className={
                          done
                            ? "flex h-9 w-9 items-center justify-center rounded-full bg-glow/20 text-glow ring-1 ring-glow/50"
                            : current
                              ? "glow-ring flex h-9 w-9 items-center justify-center rounded-full bg-glow/25 text-glow"
                              : "flex h-9 w-9 items-center justify-center rounded-full bg-panel-3 text-ink-dim ring-1 ring-edge"
                        }
                      >
                        {done ? (
                          <Check size={14} />
                        ) : (
                          <span
                            className={
                              current
                                ? "animate-pulse-dot h-2 w-2 rounded-full bg-glow"
                                : "h-1.5 w-1.5 rounded-full bg-ink-dim"
                            }
                          />
                        )}
                      </div>
                      <span
                        className={
                          "mt-2 font-mono text-[9px] uppercase tracking-widest " +
                          (done || current ? "text-glow" : "text-ink-dim")
                        }
                      >
                        {s}
                      </span>
                    </div>
                    {i < STAGES.length - 1 && (
                      <div className="relative mx-2 mb-5 h-px flex-1 overflow-hidden bg-edge">
                        {(current || done) && <div className="flowline absolute inset-0" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recently remembered rail */}
      <aside className="glass w-72 shrink-0 overflow-y-auto border-l border-edge p-5">
        <div className="microlabel">Recently remembered</div>
        <div className="mt-3 space-y-2.5">
          {recent.length === 0 && <p className="text-xs text-ink-dim">nothing yet — feed me</p>}
          {recent.map((e) => (
            <div key={e.id} className="glass rounded-xl p-3.5 ring-1 ring-edge">
              <div className="truncate text-[13px]">{e.title}</div>
              <div className="mt-1 font-mono text-[10px] text-ink-dim">
                {e.type} · {timeAgo(e.created_at)}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
