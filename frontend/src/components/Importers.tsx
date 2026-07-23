import { useEffect, useRef, useState } from "react";
import { Check, FolderGit2, Github, MessagesSquare, RefreshCw, Sparkles } from "lucide-react";
import { api, ImportJobStatus, ImportScanItem } from "../api";

// Mass-intake: scan a staged source, pick items, run a quota-aware import job.

const SOURCES = [
  { id: "claude", label: "Claude export", icon: Sparkles, hint: "data/imports/claude" },
  { id: "chatgpt", label: "ChatGPT export", icon: MessagesSquare, hint: "data/imports/chatgpt" },
  { id: "github", label: "Project folders", icon: Github, hint: "data/imports/github" },
  { id: "docs", label: "Documents", icon: FolderGit2, hint: "data/imports/docs" },
];

export default function Importers({ onActivity }: { onActivity: () => void }) {
  const [source, setSource] = useState("claude");
  const [items, setItems] = useState<ImportScanItem[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [job, setJob] = useState<ImportJobStatus | null>(null);
  const [error, setError] = useState("");
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  async function scan(src: string) {
    setSource(src);
    setItems(null);
    setError("");
    setScanning(true);
    try {
      const res = await api.importScan(src);
      setItems(res.items);
      setChecked(new Set(res.items.filter((i) => !i.already_imported).map((i) => i.external_id)));
    } catch (e) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    scan("claude");
    // resume polling if a job is already running (page revisit)
    api.importStatus().then((r) => r.job?.state === "running" && startPolling()).catch(() => {});
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling() {
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        const res = await api.importStatus();
        setJob(res.job);
        if (res.job && res.job.state !== "running") {
          if (poll.current) clearInterval(poll.current);
          onActivity();
          scan(source);
        }
      } catch {
        /* transient */
      }
    }, 2500);
  }

  async function run() {
    setError("");
    try {
      const ids = items ? [...checked] : null;
      const res = await api.importRun(source, ids && ids.length ? ids : null);
      setJob(res);
      startPolling();
    } catch (e) {
      setError(String(e));
    }
  }

  function toggle(id: string) {
    const next = new Set(checked);
    next.has(id) ? next.delete(id) : next.add(id);
    setChecked(next);
  }

  const running = job?.state === "running";
  const progress = job ? Math.round(((job.done + job.skipped + job.failed) / Math.max(job.total, 1)) * 100) : 0;

  return (
    <div>
      {/* Source picker */}
      <div className="flex flex-wrap gap-2">
        {SOURCES.map(({ id, label, icon: Icon, hint }) => (
          <button
            key={id}
            onClick={() => scan(id)}
            title={hint}
            className={
              source === id
                ? "flex items-center gap-2 rounded-xl bg-glow/12 px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-glow ring-1 ring-glow/40"
                : "flex items-center gap-2 rounded-xl px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-ink-dim ring-1 ring-edge transition hover:text-ink"
            }
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Job progress */}
      {job && (
        <div className="glass mt-4 rounded-2xl p-4 ring-1 ring-edge">
          <div className="flex items-center justify-between font-mono text-[11px]">
            <span className={running ? "text-glow" : job.state === "finished" ? "text-glow-3" : "text-rose"}>
              {running ? `importing… ${job.current}` : job.state === "finished" ? "import finished" : "import error"}
            </span>
            <span className="text-ink-dim">
              {job.done} filed · {job.skipped} skipped · {job.failed} failed / {job.total}
            </span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-panel-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-glow to-glow-2 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          {job.errors.length > 0 && (
            <div className="mt-2 font-mono text-[10px] text-rose">{job.errors.join(" · ")}</div>
          )}
          {running && (
            <p className="mt-2 text-[11px] text-ink-dim">
              paced for the free tier (~10s/item) — safe to leave this page; re-runs resume where they stopped
            </p>
          )}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl bg-red-950/40 px-4 py-2.5 font-mono text-[11px] text-rose ring-1 ring-red-900/60">
          {error}
        </div>
      )}

      {/* Scan results */}
      <div className="glass mt-4 rounded-2xl ring-1 ring-edge">
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <span className="microlabel">
            {scanning ? "scanning…" : items ? `${items.length} items found` : "scan a source"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => scan(source)}
              className="rounded-lg p-1.5 text-ink-dim transition hover:text-glow"
              title="rescan"
            >
              <RefreshCw size={13} className={scanning ? "animate-spin" : ""} />
            </button>
            <button
              onClick={run}
              disabled={running || !items || checked.size === 0}
              className="rounded-lg bg-gradient-to-r from-glow/80 to-glow-2/80 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-void transition hover:brightness-110 disabled:opacity-30"
            >
              Import {checked.size || ""}
            </button>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {items?.length === 0 && (
            <p className="px-3 py-4 text-xs text-ink-dim">
              Nothing found — drop files into <span className="font-mono">{SOURCES.find((s) => s.id === source)?.hint}</span> and rescan.
            </p>
          )}
          {items?.map((it) => (
            <button
              key={it.external_id}
              onClick={() => !it.already_imported && toggle(it.external_id)}
              className={
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition " +
                (it.already_imported ? "opacity-40" : "hover:bg-panel-3")
              }
            >
              <span
                className={
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border " +
                  (it.already_imported
                    ? "border-glow-3 bg-glow-3/20 text-glow-3"
                    : checked.has(it.external_id)
                      ? "border-glow bg-glow/25 text-glow"
                      : "border-edge-2")
                }
              >
                {(it.already_imported || checked.has(it.external_id)) && <Check size={11} />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">{it.title}</span>
              <span className="shrink-0 font-mono text-[10px] text-ink-dim">
                {it.already_imported
                  ? "in memory"
                  : `${(it.chars / 1000).toFixed(1)}k chars${it.chunks > 1 ? ` · ${it.chunks} parts` : ""}`}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
