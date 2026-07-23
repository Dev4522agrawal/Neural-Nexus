# Architecture

## System overview

```
┌─────────────────────────────────────────────────────┐
│                    React UI                          │
│   Chat · Graph Explorer · Timeline · Insights        │
└──────────────────────┬──────────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────┴──────────────────────────────┐
│                 FastAPI (core)                       │
│                                                      │
│  ┌───────────┐ ┌──────────────┐ ┌───────────────┐   │
│  │ Ingestion │ │Context Engine│ │   AI Router   │   │
│  └─────┬─────┘ └──────┬───────┘ └───────┬───────┘   │
│        │              │                 │           │
│  ┌─────┴──────────────┴─────┐   ┌───────┴───────┐   │
│  │   Memory Interface       │   │    LiteLLM    │   │
│  │   (Graphiti adapter)     │   └───────┬───────┘   │
│  └─────┬──────────────┬─────┘           │           │
└────────┼──────────────┼─────────────────┼───────────┘
         │              │                 │
     ┌───┴───┐   ┌──────┴────────┐   OpenAI/Claude/
     │ Neo4j │   │ Postgres      │   Gemini/Groq/
     │(graph)│   │ + pgvector    │   OpenRouter/Ollama
     └───────┘   └───────────────┘
```

## Module boundaries

The core is five modules. Each future capability (internship tracker, study assistant, etc.) is a **module** that registers against core APIs — it may define its own node types, ingestion sources, insight generators, and UI panels, but never modifies core code.

### 1. Memory (Graphiti behind an interface)

All memory operations go through `MemoryStore`, an abstract interface:

```python
class MemoryStore(Protocol):
    async def add_episode(...)        # ingest content
    async def search(...)             # hybrid semantic + graph search
    async def get_node(...) / get_edges(...)
    async def get_subgraph(...)       # for graph UI
```

`GraphitiMemoryStore` is the V1 implementation. Graphiti handles chunking, entity extraction, temporal edges (valid_from/valid_to), and hybrid retrieval. If Graphiti is ever replaced, only the adapter changes.

Postgres stores what Graphiti doesn't: raw documents, ingestion jobs, the event log, insights, conversations, module data. pgvector covers any vector needs outside Graphiti.

### 2. Ingestion

```
source → parse (Docling) → MemoryStore.add_episode → event log
```

V1 sources: file upload (PDF/MD/TXT/images), pasted text, ChatGPT/Claude export JSON, GitHub repo (README + tree + commit log). Each source is a small adapter implementing `IngestionSource`.

### 3. Context Engine

The heart of the system. Every user prompt goes through:

```
prompt
 → MemoryStore.search(prompt)            # graph + semantic hits
 → recent conversation turns
 → active project state (open TODOs, decisions)
 → recent events (what happened yesterday)
 → rank + trim to token budget
 → assembled context block
```

Context assembly is transparent: the UI can show exactly which memories were retrieved and why (this doubles as the "watch it think" experience).

### 4. AI Router

Rule-based V1, one LLM call fallback for classification:

```yaml
routes:
  code:      claude-sonnet
  research:  gemini
  general:   gpt
  offline:   ollama/llama3
```

Manual override always available. Post-V1: task splitting across models + merge.

### 5. Conversation

Standard chat persistence in Postgres. Every completed conversation is itself ingested back into memory (conversations become nodes/episodes — the system remembers what you discussed).

## Cross-cutting

**Event log** — append-only `events` table. Every action (ingest, conversation, insight, node created) writes one row. Timeline UI is just a query. Insights job reads it.

**Insights job** — scheduled (nightly + on-demand). Pulls recent events + graph neighborhoods, prompts an LLM for discoveries ("you solved this before", "deadline tomorrow", "these projects share tech"), stores as insight cards with links to source nodes. Dismissible/pinnable in UI.

**Privacy** — everything local except LLM API calls. No telemetry. Any future sensor (voice, webcam, browser history) is opt-in per module.

## Data stores

| Store | Holds |
|---|---|
| Neo4j | Knowledge graph (via Graphiti): entities, temporal edges, episode nodes |
| Postgres | Documents, conversations, events, insights, jobs, module tables |
| pgvector | Embeddings for anything outside Graphiti's own retrieval |

Docker Compose runs both plus the API. UI runs via Vite dev server (V1).
