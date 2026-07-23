# Roadmap

## V1 — one week

Definition of done: *"I open it, it knows my projects and history, retrieves context automatically, routes to the right model, and shows me insights I didn't ask for."*

### Day 1 — Foundation
- Docker Compose: Neo4j + Postgres(+pgvector)
- FastAPI skeleton, `MemoryStore` interface + Graphiti adapter
- Event log table + write path
- LiteLLM config (Claude, GPT, Gemini, Groq, Ollama)

### Day 2 — Ingestion + Context Engine
- File upload + pasted text → Docling parse → Graphiti episode
- Context Engine v1: memory search + recent turns + token budget
- Chat endpoint: prompt → context → routed LLM → response (WebSocket streaming)

### Day 3 — UI core
- React + TS + Tailwind scaffold
- Chat panel with streaming + "retrieved context" inspector (show what memory was used)
- Upload dropzone with pipeline status

### Day 4 — Graph explorer + Timeline
- react-force-graph over `get_subgraph`: click-to-expand, filter by type, animate new nodes
- Timeline view over event log

### Day 5 — Importers (real data day)
- ChatGPT/Claude export JSON importer
- GitHub repo importer (README, tree, commits)
- Ingest own real data; fix everything that breaks

### Day 6 — AI Router + Insights
- Rule-based router + manual override in UI
- Nightly/on-demand insights job → insight cards linked to source nodes
- Morning dashboard: yesterday's events, active projects, fresh insights

### Day 7 — Polish (V1 release)
- Collapsible sidebar; delete conversations; "forget this memory" (episode removal
  from the graph via Graphiti)
- One-command start script: checks Docker, starts containers + backend + frontend,
  opens the browser (answer to "do I always have to do the localhost dance?")
- `MODEL_RESEARCH=gemini/gemini-2.5-pro` — hard questions get the smart model's
  small free allowance; chit-chat stays on flash
- Demo pass with real imported data, fix rough edges
- README rewrite: what it is, architecture diagram, screenshots/GIF, setup guide
- Tag v1.0

### Cut from V1 (deliberately)
Multi-agent system · task-splitting router · Three.js · voice · webcam · browser history · MCP server · internship/study modules · screenshots OCR

## V2+ module backlog (in rough order)

1. **MCP server** — expose memory/search/ingest as MCP tools so Claude Code/Desktop, Cursor etc. share the brain. First module because it multiplies daily utility.
2. **Project Intelligence** — per-project state: decisions, roadmap, bugs, lessons learned; "current state of every project" query.
3. **Internship Assistant** — application tracker, interview stages, JD analysis vs resume, follow-up reminders.
4. **Study Assistant** — syllabus/topic tracking, weak-subject detection, forgetting-curve revision prompts, topic↔project links.
5. **Router v2** — task splitting across models + merge; learned routing from feedback.
6. **Laptop Intelligence** — local file indexing, duplicate detection, screenshot OCR, auto-linking files to projects.
7. **Voice** — "remember this", "what was I working on yesterday?"
8. **Agents** — Research/Code/Critic agents built on LangGraph, using the same memory.

Each module ships as a plug-in: own node types, ingestion sources, insight generators, UI panel. Core stays frozen at five modules.
