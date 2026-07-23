// Thin client for the Neural Nexus backend. All HTTP lives here.

const BASE = "http://localhost:8000/api";

export interface MemoryFact {
  fact: string;
  valid_at: string | null;
}

export interface ContextUsed {
  memories: MemoryFact[];
  recent_events: { type: string; title: string; at: string }[];
  conversation_turns_included: number;
}

export interface ChatResponse {
  conversation_id: string;
  response: string;
  task: string;
  model: string;
  notice: string | null;
  context_used: ContextUsed;
}

export interface EventItem {
  id: string;
  type: string;
  title: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  model: string | null;
  created_at: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export interface Stats {
  memories: number;
  connections: number;
  conversations: number;
  events_today: number;
  histogram: { day: string; count: number }[];
}

export interface ImportScanItem {
  external_id: string;
  title: string;
  chars: number;
  chunks: number;
  created_at: string | null;
  already_imported: boolean;
}

export interface ImportJobStatus {
  id: string;
  source: string;
  total: number;
  done: number;
  skipped: number;
  failed: number;
  current: string;
  state: "running" | "finished" | "error";
  errors: string[];
}

export interface InsightItem {
  id: string;
  kind: "connection" | "opportunity" | "reminder" | "observation";
  title: string;
  body: string;
  refs: string[];
  pinned: boolean;
  created_at: string;
}

export interface HealthStatus {
  status: string;
  services: {
    neo4j: boolean;
    postgres: boolean;
    ollama: boolean;
    gemini: "configured" | "missing";
  };
}

export interface EpisodeInfo {
  uuid: string;
  name: string;
  source: string;
  created_at: string;
}

export interface TaskItem {
  id: string;
  title: string;
  notes: string;
  category: "general" | "study" | "career" | "project";
  status: "open" | "done";
  priority: "low" | "med" | "high";
  source: string;
  refs: string[];
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
}

export const api = {
  stats: () => req<Stats>("/stats"),

  health: () => req<HealthStatus>("/health"),

  tasks: (status?: string, category?: string) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (category) p.set("category", category);
    const qs = p.toString();
    return req<{ tasks: TaskItem[] }>(`/tasks${qs ? `?${qs}` : ""}`);
  },
  addTask: (t: Partial<TaskItem>) =>
    req<TaskItem>("/tasks", { method: "POST", body: JSON.stringify(t) }),
  updateTask: (id: string, patch: Partial<TaskItem>) =>
    req<TaskItem>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTask: (id: string) =>
    req<{ status: string }>(`/tasks/${id}`, { method: "DELETE" }),

  deleteConversation: (id: string) =>
    req<{ status: string }>(`/conversations/${id}`, { method: "DELETE" }),

  episodes: (limit = 100) =>
    req<{ episodes: EpisodeInfo[] }>(`/memory/episodes?limit=${limit}`),

  forgetEpisode: (uuid: string) =>
    req<{ status: string }>(`/memory/episodes/${uuid}`, { method: "DELETE" }),

  insights: () => req<{ insights: InsightItem[] }>("/insights"),
  generateInsights: () =>
    req<{ created: number; insights: InsightItem[] }>("/insights/generate", {
      method: "POST",
    }),
  dismissInsight: (id: string) =>
    req<{ status: string }>(`/insights/${id}/dismiss`, { method: "POST" }),
  pinInsight: (id: string) =>
    req<{ status: string }>(`/insights/${id}/pin`, { method: "POST" }),

  importScan: (source: string) =>
    req<{ items: ImportScanItem[] }>(`/import/scan/${source}`),

  importRun: (source: string, ids: string[] | null, limit?: number) =>
    req<ImportJobStatus>("/import/run", {
      method: "POST",
      body: JSON.stringify({ source, ids, limit: limit ?? null }),
    }),

  importStatus: () => req<{ job: ImportJobStatus | null }>("/import/status"),

  ingestFile: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/ingest/file`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json() as Promise<{ status: string; chunks: number }>;
  },

  chat: (message: string, conversationId?: string, task?: string) =>
    req<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        conversation_id: conversationId ?? null,
        task: task ?? null,
      }),
    }),

  ingestText: (title: string, content: string) =>
    req<{ status: string }>("/ingest/text", {
      method: "POST",
      body: JSON.stringify({ title, content }),
    }),

  events: (limit = 60) => req<{ events: EventItem[] }>(`/events?limit=${limit}`),

  conversations: () =>
    req<{ conversations: ConversationSummary[] }>("/conversations"),

  conversation: (id: string) =>
    req<{ conversation_id: string; messages: StoredMessage[] }>(
      `/conversations/${id}`
    ),
};
