# Neural Nexus 🧠

**A Personal Cognitive Operating System** — a local-first AI with permanent memory that learns your projects, code, conversations, research, and goals, then thinks alongside you.

Not a chatbot. Not a note-taking app. Every AI assistant forgets you the moment you close the tab; Neural Nexus never does. Memory is the product — the AI models are interchangeable employees.

<!-- screenshot: command center -->
<!-- screenshot: living graph -->

## What it does

- **Remembers everything.** Notes, files, PDFs, entire project folders, and your full ChatGPT/Claude conversation history are parsed into a **temporal knowledge graph** — entities, relationships, and when they were true.
- **Retrieves before it answers.** Every chat message triggers hybrid graph + semantic search; the model receives your relevant memories, recent activity, and conversation history before it says a word. The **Neural Activity panel** shows exactly what was retrieved — no black box.
- **Discovers, unprompted.** A daily **Insight Engine** walks the graph and surfaces connections ("Gesture Lab's hand tracking could control Space Shooter"), opportunities, reminders, and patterns — pin or dismiss them from the Command Center.
- **Draws your mind.** A living force-directed graph: glowing nodes sized by connectivity, particles flowing along relationships, click any node to inspect its facts — or ask the chat about it directly.
- **Routes between brains.** An AI Router sends each task to the right model (cloud or local), with manual override. When cloud quota dies, the **night-shift** local model answers instead — flagged honestly with a 🌙 badge. Bulk imports run **local-first (Ollama)** with cloud rescue for hard extractions.
- **Forgets on command.** Delete threads; forget individual memories — the episode *and* its extracted facts leave the graph.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  React + TS + Tailwind — Command Center · Chat ·       │
│  Living Graph · Ingest Airlock · Timeline · ⌘K palette │
└───────────────────────────┬────────────────────────────┘
                            │ REST
┌───────────────────────────┴────────────────────────────┐
│                    FastAPI core (5 modules)             │
│  Memory · Knowledge Graph · Context Engine · AI Router  │
│  · Conversation    + plug-ins: Importers, Insights      │
└──────┬──────────────┬──────────────────┬────────────────┘
       │              │                  │
   ┌───┴────┐   ┌─────┴──────┐    ┌──────┴─────────────┐
   │ Neo4j  │   │ Postgres   │    │ LiteLLM router     │
   │ graph  │   │ events ·   │    │ Gemini ⇄ Ollama    │
   │(Graphiti)  │ convos ·   │    │ (+ any provider    │
   └────────┘   │ insights   │    │  via one .env key) │
                └────────────┘    └────────────────────┘
```

Design rules: the core stays at five modules — everything else is a plug-in. Only one file may touch the graph engine (swappable by design). Every action writes an append-only event log that powers the timeline and insights. Single-user, local-first, no auth, no cloud storage — your data never leaves your machine except as LLM API calls, and even those can go fully local.

## Stack

FastAPI · Graphiti (temporal knowledge graph) · Neo4j · PostgreSQL · LiteLLM (multi-provider routing) · Ollama (local inference) · React 18 + TypeScript · Tailwind v4 · react-force-graph · Vite

## Run it

Requirements: Docker Desktop, Python 3.11+, Node 18+, and either a free [Gemini API key](https://aistudio.google.com) or [Ollama](https://ollama.com) (or both — hybrid mode is the default).

```bash
cp .env.example .env        # add GEMINI_API_KEY; ollama needs no key
docker compose up -d
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cd ..
cd frontend && npm install && cd ..

./scripts/start.sh          # every day after: just this
```

`start.sh` checks Docker, wakes the databases, Ollama, backend, and frontend, then opens the app. `scripts/stop.sh` puts the brain to sleep; `scripts/backup.sh` snapshots both databases into `backups/`.

## Feeding it

Drop your data into `data/imports/` (gitignored — see the README there): ChatGPT/Claude export zips, entire project folders (no README needed — it reads manifests, file trees, and commit history), PDFs and documents. Then **Add to memory → Import sources** — scan, tick, import. Jobs are paced, deduplicated, and resumable: interrupt them anytime, re-run for free.

## Dev log

Every build session is documented in [docs/DEVLOG.md](docs/DEVLOG.md) — plain-English summaries, the engineering vocabulary behind them, and every bug with its lesson. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the full design; [docs/ROADMAP.md](docs/ROADMAP.md) shows what was deliberately cut from V1 and what's next (MCP server, internship assistant, study tracker, voice).

---

*Built in one week as a portfolio project — architected with Claude (Fable 5), executed and verified with Claude Code, powered by free tiers and a stubborn refusal to pay for anything.*
