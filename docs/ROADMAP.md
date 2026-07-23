# Roadmap

## V1 — Initial Release

Definition of done: *"I open it, it knows my projects and history, retrieves context automatically, routes to the right model, and shows me insights I didn't ask for."*

### Phase 1 — Foundation
- Docker Compose: Neo4j + Postgres (+ pgvector)
- FastAPI skeleton, `MemoryStore` interface + Graphiti adapter
- Event log table + write path
- LiteLLM config (multi-provider: cloud + local)

### Phase 2 — Context & Memory
- File upload + pasted text → document parse → Graphiti episode
- Context Engine v1: memory search + recent turns + token budget
- Chat endpoint: prompt → context → routed LLM → response (WebSocket streaming)

### Phase 3 — Interface
- React + TS + Tailwind scaffold
- Chat panel with streaming + "retrieved context" inspector (show what memory was used)
- Upload dropzone with pipeline status

### Phase 4 — Knowledge Graph
- react-force-graph over `get_subgraph`: click-to-expand, filter by type, animate new nodes
- Timeline view over event log
- Command center home screen with live stats and redesigned UI
- Verification pass and error-path hardening

### Phase 5 — Import Pipeline
- Conversation export importer (multiple export formats)
- Project-folder importer (manifest, file tree, commit history)
- Hybrid local/cloud extraction, with local inference as the default path
- Ingest real personal data; fix everything that breaks

### Phase 6 — Intelligence Layer
- Rule-based router + manual override in UI
- Scheduled insights job → insight cards linked to source nodes
- Dashboard surfacing yesterday's events, active projects, and fresh insights

### Phase 7 — Release Candidate
- Collapsible sidebar; delete conversations; "forget this memory" (episode removal from the graph via Graphiti)
- One-command start script: checks Docker, starts containers + backend + frontend, opens the browser
- Task-based model routing config (e.g. a stronger model reserved for research-grade questions, a lighter one for everyday chat)
- Demo pass with real imported data, fix rough edges
- README rewrite: what it is, architecture diagram, screenshots/GIF, setup guide
- Tag v1.0

### Cut from V1 (deliberately)
Multi-agent system · task-splitting router · Three.js · voice · webcam · browser history · MCP server · internship/study modules · screenshot OCR

## V2+ module backlog (in rough order)

1. **MCP server** — expose memory/search/ingest as MCP tools so external AI clients (IDEs, coding assistants, and other MCP-compatible tools) can share the same memory. First module because it multiplies daily utility.
2. **Project Intelligence** — per-project state: decisions, roadmap, bugs, lessons learned; "current state of every project" query.
3. **Internship Assistant** — application tracker, interview stages, JD analysis vs resume, follow-up reminders.
4. **Study Assistant** — syllabus/topic tracking, weak-subject detection, forgetting-curve revision prompts, topic↔project links.
5. **Router v2** — task splitting across models + merge; learned routing from feedback.
6. **Laptop Intelligence** — local file indexing, duplicate detection, screenshot OCR, auto-linking files to projects.
7. **Voice** — "remember this", "what was I working on yesterday?"
8. **Agents** — Research/Code/Critic agents built on a graph-based orchestration framework, using the same memory.

Each module ships as a plug-in: own node types, ingestion sources, insight generators, UI panel. Core stays frozen at five modules.