# Neural Nexus — Dev Log

Running record of every work session. Each entry: what was built (plain English), the technical terms behind it (resume vocabulary), files touched, and problems solved. Newest entry at the top.

---

## Week 7 — Single-origin deploy: backend serves the UI (2026-07-03) ✅ verified

**Plain English:** One process, one address. The backend now serves the built React app itself at http://localhost:8000, so there's no separate dev server to run — you just open one URL and everything (page + API) comes from the same place. `start.sh` builds the UI and opens :8000; the Vite dev server on :5173 still works for future UI development.

**Technical terms (resume vocabulary):** *Single-origin SPA hosting* — FastAPI mounts `frontend/dist` via `StaticFiles(html=True)` at `/`, registered **after** the API routers so `/api/*` wins and everything else falls through to the SPA. *Same-origin API* — no CORS preflight in production; CORS still allow-lists :8000 and :5173 for dev. *Build-on-start* — `start.sh` rebuilds the UI only when source is newer than `dist/`.

**Verified:** `npm run build` ✓ · http://localhost:8000 loads the full app; dashboard, graph (300 nodes/295 edges), timeline, and a same-origin chat POST all functional, **zero CORS/console errors** ✓ · `/api/health` still returns JSON (API precedence over SPA mount) ✓ · static assets serve (200) ✓ · `stop.sh`→`start.sh` ends at :8000 health-green, production backend (no `--reload`) ✓ · `npm run dev` on :5173 still works cross-origin (CORS 200, no errors) ✓. Note: app navigation is React state (no client-side URL routes), so the SPA is only ever served at `/` — a bare `/graph` URL 404ing is expected and harmless. v1.0.x polish, no new tag.

**Files:** backend/app/main.py (StaticFiles mount + CORS :8000), scripts/start.sh (build + open :8000), docs/DEVLOG.md

## Week 7 — V1 polish, forget/delete, ⌘K, ops scripts (2026-07-01) ✅ V1 COMPLETE

**Plain English:** The final coat of polish that makes it feel like a real product. Answers now render properly formatted (code blocks, lists, bold) with a copy button, and a failed send offers a retry instead of just an error. A ⌘K command palette searches your memories live and jumps to any thread or screen. The sidebar collapses (and remembers it). You can delete a conversation or *forget* a memory — and forgetting truly removes it and everything the system extracted from it. Coloured health dots show every service's pulse. New conversations quietly rename themselves to a proper title. And three one-command scripts start, stop, and back up the whole system. Verified every one of these in a real browser, ran a full stop→start cycle, and took a real backup.

**Technical terms (resume vocabulary):**
- *Service health endpoint* — `/api/health` probes Neo4j/Postgres/Ollama and reports per-service booleans + degraded status; drives live sidebar status dots (polled)
- *Destructive ops done right* — `DELETE /api/conversations/{id}` (cascade messages), `DELETE /api/memory/episodes/{uuid}` (graph forget via Graphiti `remove_episode` — removes the episode node AND its extracted edges, verified in Neo4j); native confirm dialogs
- *Command palette (⌘K)* — global keyboard shortcut, debounced live memory search against the graph, fuzzy filter over threads/views, keyboard-first navigation
- *Markdown rendering + UX affordances* — react-markdown/remark-gfm for answers, copy-to-clipboard, retry-on-failure with preserved input, persisted collapsible sidebar (localStorage)
- *Background auto-titling* — after the first exchange, the local model writes a 3–6 word thread title in a background task (observed: "Backpacking Northern Vietnam Itinerary Guide", "Planning Partner Setup Review")
- *One-command ops* — `start.sh` (Docker → DBs → Ollama → backend → frontend, health-gated), `stop.sh`, `backup.sh` (Postgres pg_dump + consistent Neo4j volume snapshot); production backend runs without `--reload`
- *Model routing config* — `MODEL_RESEARCH=gemini/gemini-2.5-pro` for deep research tasks

**Bugs fixed:** none new in this sweep — this session's code (committed together with the two prior sessions since it was already in the tree) verified clean end-to-end. The blank-UI / import-resume / boot bugs were caught and fixed in the two sessions before this one.

**Verified:** health per-service booleans (all green) ✓ · DELETE conversation cascades messages ✓ · episodes list ✓ · forget removes episode node + its 4 MENTIONS edges from Neo4j ✓ · markdown (code/bold/list) + copy + retry-on-failure ✓ · ⌘K palette: live memory search (5 hits), threads, views, navigation ✓ · sidebar collapse persists across reload ✓ · health dots row (graph/db/local ai/cloud ai) ✓ · thread delete with confirm (8→7) ✓ · Graph node → Ask prefills chat ("Phase 1") ✓ · Ingest Memories tab lists 22 episodes with forget ✓ · quick capture files a note (ingest.text event confirmed) ✓ · auto-title generates a proper title ✓ · backup.sh (postgres.sql + neo4j-data.tar.gz, Neo4j restarts healthy) ✓ · stop.sh → start.sh cycle ends health-green with app open ✓ · MODEL_RESEARCH set ✓ · build zero TS errors · backend compiles · console clean

**Import status:** the local hybrid import made real progress (graph reached ~132 memories / 76 connections, several giant conversations filed at the 12-chunk cap, **0 cloud rescues all session** — the local model was fully self-sufficient). It was interrupted by the stop→start ops-script test (in-memory job); it is fully resumable via the content-hash ledger — re-running `POST /api/import/run` skips filed items. Full archive ingest is a background task the owner runs over time; not required for V1.

**Files (verification/ops; code landed in the prior commit):** .gitignore (backups/), .env (MODEL_RESEARCH — not committed), docs/DEVLOG.md, docs/NOTES.md

---

## Week 6 — Insight engine + AI Router override (2026-06-24) ✅ verified end-to-end

**Plain English:** Neural Nexus stopped waiting to be asked. A background analyst now studies the knowledge graph and recent activity and surfaces discoveries on its own — "your Gesture Lab hand-tracking could control Space Shooter", "Neural-Mode-Spec.md is attached but still unreviewed" — as dismissible, pinnable cards on the dashboard. It runs on a daily loop and on demand. Chat also grew a model selector: let it auto-route, force the local offline model, or pick code/research — and because the cloud quota is still dead, the forced-cloud choices gracefully fall to the local model with the amber night-shift badge. Every insight is grounded in the owner's real data (real project and entity names), not invented.

**Technical terms (resume vocabulary):**
- *Proactive insight generation (LLM over a knowledge graph)* — walks entities + relationships + event log, prompts for typed discoveries (connection/opportunity/reminder/observation), stores them as first-class objects; grounded-only prompt with entity references
- *Robust LLM-JSON parsing* — salvage parser strips markdown fences and regex-extracts an embedded array so messy local-model output still yields structured insights (created:0 on 200 is a valid outcome, never a crash)
- *Background scheduled task* — asyncio daily loop in the FastAPI lifespan (`due()` enforces a 20-hour cadence, re-checks every 6h), cancelled cleanly on shutdown
- *De-duplication + moderation* — insights de-duped by title against active set; pin (reorder) / dismiss (soft-delete, stays gone) with optimistic UI
- *AI Router manual override* — task selector in the chat header maps to `TASK_ROUTES`; "offline" pins to the local model; forced-cloud tasks still honor the night-shift fallback (amber badge = fallback proof)
- *Markdown chat rendering* — react-markdown + remark-gfm for assistant replies

**Bugs fixed:**
1. *Hybrid backend wouldn't boot* (carried over from the hybrid graph engine work): `FallbackLLMClient` failed Graphiti's `is_instance_of(LLMClient)` Pydantic check. Fix: subclass `LLMClient`, call `super().__init__` with the primary's config, add the required `_generate_response`. Lesson: duck typing isn't enough when a library validates types with Pydantic.
2. *Import resume crashed on a non-empty ledger*: the job worker built its dedupe set with `row.content_hash`, but `select(ImportedItem.content_hash).scalars()` already yields strings → `AttributeError: 'str' object has no attribute 'content_hash'`. Invisible on the first run (empty ledger, comprehension never iterated); fatal the moment one item was filed. Fix: `set(scalars())`. Lesson: latent bugs hide behind empty collections — the second run is a different test than the first.
3. *Blank UI on load*: Chat.tsx imports `react-markdown`/`remark-gfm` (declared in package.json, never installed) → Vite served a 500 and React never mounted. Fix: `npm install`. Lesson: a clean `npm run build` from a previous session doesn't cover deps added since.

**Verified:** insights table auto-creates ✓ · GET /api/insights ✓ · POST /api/insights/generate returns grounded insights (night-shifted to the local model, 30s, salvage parser coped) ✓ · refs are real graph entities / real imported terms, not hallucinated ✓ · dashboard cards render with kind colors + entity chips ✓ · pin reorders to top ✓ · dismiss removes + stays gone after reload ✓ · generate spinner ✓ · insight.generated on Timeline ✓ · chat override: offline → `ollama/llama3.1:8b`, no badge (intentional); research → night-shift amber badge ✓ · daily loop task started (it auto-generated insights ~2min after a prior boot) ✓ · build zero TS errors · console clean

**Insight quality (local model, evidence):** genuinely useful — *"Review Neural-Mode-Spec.md document"* (grounded in an imported project handover), *"Gesture Control for Game Development"* (Gesture Lab hand-tracking → Space Shooter). A few are thin/meta — *"Ollama and Gemini relationship"* — expected from an 8B local model; per plan these can be regenerated on the cloud model when quota resets rather than tuning the prompt now.

**Files:** backend/app/insights/{__init__,engine}.py, backend/app/api/insights_routes.py, backend/app/main.py (daily loop), backend/app/models.py (Insight), backend/app/importers/jobs.py (dedupe fix), frontend/src/components/{Dashboard,Chat}.tsx, frontend/src/api.ts, frontend/package.json (react-markdown, remark-gfm)

---

## Week 5 — Hybrid graph engine + night-shift chat (2026-06-18) ✅ verified end-to-end

**Plain English:** The system got a second brain that never sleeps and never bills. Instead of depending on a cloud provider (which runs out of free quota daily), the knowledge extraction now runs on a local AI model (Ollama + llama3.1) right on the laptop — unlimited and private. The cloud only steps in to rescue the rare extraction the local model botches. And if the cloud is down while you're chatting, a "night shift" kicks in: the local model answers instead and the reply wears an amber badge saying so. Chat never goes dark. Set this up, wiped the old test graph (embeddings changed), and confirmed a note ingests locally in ~50s with zero cloud calls.

**Technical terms (resume vocabulary):**
- *Local LLM inference* — Ollama running `llama3.1:8b` (extraction/chat) + `nomic-embed-text` (embeddings) on-device; installed via Homebrew cask, models pulled locally
- *Hybrid primary/fallback LLM client* — `FallbackLLMClient` wraps Ollama (primary) + a cloud provider (rescue): every extraction tries local first, cloud only on local failure; a `rescues` counter for observability. Embeddings stay 100% local so the vector space is uniform (no mixing cloud + local embedding dimensions)
- *Graceful cloud-outage fallback in the router* — chat detects outage signatures (429/503/quota/overloaded) and reroutes to `model_offline`, returning a `notice` the UI renders as a night-shift badge; forced/local requests are exempt
- *Embedding-space migration* — switching embedders invalidates old vectors, so reset the graph (`MATCH (n) DETACH DELETE n`) + truncated the dedupe ledger, preserving conversations/messages/events
- *Provider abstraction held* — all changes behind the `MemoryStore` boundary and the router; only `graphiti_store.py` touches `graphiti_core`

**Bug fixed:** see the following week's entry, bug #1 (the `is_instance_of` boot failure was diagnosed and fixed during this hybrid bring-up).

**Verified:** Ollama serving + both models pulled (18GB RAM → 8B is fine) ✓ · `GRAPH_PROVIDER=hybrid`, backend boots clean ✓ · local ingest ~51s, `/api/search` returns facts, **0 cloud rescues** (local handled it — zero quota spent) ✓ · night-shift chat: real message fell to `ollama/llama3.1:8b` with the amber "cloud unavailable (RateLimitError)" badge and local model pill ✓ · frontend build + backend compile clean

**Note:** local 8B extraction is lower-fidelity than the cloud model (one test fact had subject/object swapped) — acceptable for bulk/offline; the rescue path and a future day-shift re-extraction cover quality.

---

## Week 5 — Importers (2026-06-15) ✅ structure + error paths verified · full import run deferred to quota reset

**Plain English:** The system can now swallow whole archives of the owner's digital life: AI assistant conversation exports, entire project folders (it reads the manifest, file tree, commit history and a taste of the code — no README required), and documents including PDFs. Everything is scanned first and shown as a checklist with sizes, so you choose what enters your memory. Imports run as a slow, patient background job built for the free tier: one item at a time, pauses in between, a long cooldown on rate limits, and a fingerprint ledger so re-running never duplicates anything — a job interrupted today resumes tomorrow for free. Cloud quota was exhausted all day, so the full import waits; what got proven instead is that everything fails *softly*: per-item errors in the progress card, no crashes anywhere.

**Technical terms (resume vocabulary):**
- *ETL pipeline for personal data* — pluggable scanners (`SCANNERS` registry) over a staging directory; conversation-export tree-flattening (mapping graph → timestamp-sorted transcript) across two export formats, project-folder composition (manifests + tree + git log + source samples), PDF text extraction via pypdf
- *Content-hash dedupe ledger* — SHA-256 per item in `imported_items` (unique index); rescans mark "in memory", re-runs skip instantly → idempotent, resumable imports
- *Quota-aware background job runner* — sequential asyncio worker with inter-item pacing, rate-limit cooldown retry, per-item failure isolation, `/api/import/status` polling; UI progress bar with filed/skipped/failed counters
- *Paragraph-boundary chunking* — long content split into ~6k-char episodes on `\n\n` seams with hard-split fallback
- *Multipart file upload* — `UploadFile` endpoint with type allowlist → clean `415` for unsupported types, `422` for unreadable/too-short content, `502` for provider failures
- *Negative-path E2E testing* — verified the failure modes deliberately: rate-limited import job finishes with per-item errors (no crash), `.md` upload surfaces readable 502, `.png` upload returns clean 415

**Verified:** pip deps + `imported_items` auto-create ✓ · scan assistant-export source: 13 items incl. a personal notes dump ✓ · scan chat-platform source: 0 (staging empty — memory.txt is 0 bytes) ✓ · scan github: 6 projects composed without READMEs ✓ · scan docs: 2 (both PDFs extract; `linkedinposts.txt` is a 0-byte placeholder, correctly skipped by the min-length filter) ✓ · UI scan list with checkboxes/char counts/multi-part hints ✓ · selective import → job runs, fails gracefully under `RateLimitError`, progress card shows per-item errors, state=finished ✓ · upload `.md` → readable 502 ✓ · upload `.png` → clean 415 ✓ · build zero TS errors ✓ · **full import run deferred to quota reset**

**Notes for the full run:**
1. The cloud extraction client raises a bare message-less `Exception` for 503s, so `_is_rate_limit()` can't classify those and skips the cooldown retry — the item still fails gracefully and is retried on the next run, just without the pause.
2. Dedupe is per item, not per chunk: a multi-chunk item that fails midway re-files its earlier chunks on resume — possible duplicate episodes for the giant conversations (up to 298 chunks). Consider importing the big items individually.
3. A UI-triggered 13-item import was started during verification and would have burned ~20 min of futile retries on dead quota; killed via server reload (in-memory job, nothing ledgered, safe).

**Files:** backend/app/importers/{__init__,base,chat_exports,projects_docs,jobs}.py, backend/app/api/import_routes.py, backend/app/{main,models}.py, backend/requirements.txt, frontend/src/components/{Importers,Ingest}.tsx, frontend/src/api.ts

---

## Week 4 — Stitch redesign verification + error-path hardening (2026-06-11) ✅ verified (one flow blocked upstream)

**Plain English:** Full verification pass over the rebuilt interface, clicking through every screen like a user. The Command center greets you with live numbers that match the database; clicking an old conversation drops you straight back into it; the chat header shows exactly which AI model answered; the "Neural Activity" panel lights up with the chain of memories retrieved for each reply. One real bug found and fixed: when the cloud provider's servers were overloaded, the app showed a cryptic browser error instead of explaining what went wrong — now it says plainly "the memory engine couldn't file this note, try again shortly."

**Technical terms (resume vocabulary):**
- *End-to-end UI verification* — headless-Chrome pass over dashboard interactions, chat round-trips, graph camera controls (hub filter, zoom, Focus), timeline filters, ingest pipeline states; assertions cross-checked against live API responses (`/api/stats` numbers vs rendered stat cards)
- *CORS/middleware exception handling* — unhandled exceptions in FastAPI bypass `CORSMiddleware`, so the browser masks 500s as CORS failures; fix converts memory-engine failures into `HTTPException(502)` with a human-readable detail that keeps its CORS headers. Lesson: **unhandled exceptions skip middleware — always convert expected failure modes into handled responses at the route boundary**
- *Upstream failure triage* — read the stack bottom-up to separate our bug (CORS-masked 500) from the provider's capacity problem (`503 UNAVAILABLE` → retry exhaustion → `RateLimitError`); provider fallback documented (`GEMINI_MODEL=gemini-2.5-flash-lite` in `.env` for high-demand periods)
- *Graceful degradation UX* — ingest error path now shows an inline, actionable message; chat kept working throughout the cloud-provider brownout thanks to fewer calls per request

**Bug fixed:** Ingest failures surfaced in the browser as `TypeError: Failed to fetch` + CORS console error. Root cause: the extraction client's `RateLimitError` propagated unhandled → Starlette's bare 500 has no `Access-Control-Allow-Origin` header → browser reports CORS instead of the real error. Fix in `routes.py`: wrap `add_episode` and raise `HTTPException(502, detail=...)`. Verified: UI now renders the readable 502 detail inline.

**Verified:** dashboard greeting + 4 stat cards with real `/api/stats` numbers ✓ · recent-conversation click opens thread ✓ · "Open the living graph" nav card ✓ · chat breadcrumb + model pill (`gemini/gemini-2.5-flash`) ✓ · Neural Activity retrieval chain with staggered glow + turns-in-context ✓ · history reopen ✓ · graph legend, Hubs/All chips, zoom buttons ✓ · timeline TODAY group + System Pulse ✓ · ingest airlock: tabs marked "soon", pipeline stages animate while filing, Recently-remembered rail ✓ · build zero TS errors ✓ · **UI ingest verified except final filing, blocked by provider 503 capacity (persisted on flash-lite; daily quota exhausted) — error path verified instead** ✓

**Files:** backend/app/api/routes.py (ingest error handling), .env (GEMINI_MODEL fallback, not committed)

---

## Week 4 — Graph explorer, command center + premium redesign (2026-06-08) ✅ verified end-to-end in a real browser

**Plain English:** The knowledge graph became something you can see and touch: a living map of glowing nodes (your memories) connected by lines with light particles flowing along them. Click a node — a panel slides in showing everything the system knows about it; hit Focus and the camera glides to it. Search dims everything that doesn't match. The app also got a "Command center" home screen — greeting, live stats (memories, connections, conversations, events today), pick-up-where-you-left-off threads — and the whole UI was redesigned: aurora background, glass panels, Inter/JetBrains Mono type, a timeline with day grouping, filters and an activity strip. Verified every view in a real headless browser, clicking actual graph nodes by locating their pixels on the canvas.

**Technical terms (resume vocabulary):**
- *Interactive force-directed graph visualization* — react-force-graph-2d with custom Canvas 2D rendering (radial-gradient glow, degree-scaled radii, zoom-aware labels, directional particles), search-driven dimming, hub filtering, camera controls (`zoom`, `centerAt`)
- *Read-only Cypher over the adapter boundary* — `get_subgraph()`/`counts()` query Neo4j via Graphiti's driver for visualization; all writes still flow through Graphiti's pipeline, so the MemoryStore protocol stays the single boundary (protocol extended with both methods)
- *Aggregate stats endpoint* — SQL `date_trunc` histogram (events/day) + graph counts powering dashboard stat cards and the timeline activity strip
- *Design-system pass* — Tailwind v4 `@theme` tokens (palette, fonts, keyframes), glassmorphism (`backdrop-filter`), ambient animated gradients, custom SVG sparklines
- *Canvas pixel-analysis E2E testing* — headless Chrome can't "see" canvas nodes, so the test reads `getImageData`, clusters palette-colored pixels to find a node's screen position, clicks it, and asserts the detail panel — plus frame-diffing to prove the physics/particle animation runs
- *Defensive canvas rendering* — guard against non-finite coordinates during the force engine's first ticks

**Bugs fixed:**
1. *Docker daemon down* — all graph queries 500ed with `ConnectionRefusedError` on bolt 7687; Docker Desktop had quit between sessions. Relaunched, containers healthy again. Lesson: read the traceback bottom-up — the "API bug" was infrastructure.
2. *Canvas crash on first render* — `nodeCanvasObject` used `n.x!`/`n.y!` before the force engine assigned positions → `createRadialGradient` threw "non-finite value" and broke the render loop. Fix: skip nodes with non-finite coordinates. Lesson: `!` non-null assertions silence the compiler, not the runtime.
3. *Protocol gap* — `/api/stats` called `counts()` which existed only on the concrete adapter, not the `MemoryStore` protocol. Added it to the protocol. Lesson: extend the interface first, the implementation second.

**Files:** backend/app/{api/routes.py,memory/base.py,memory/graphiti_store.py}, frontend/src/{App.tsx,api.ts,index.css}, frontend/src/components/{Graph,Dashboard,Chat,Ingest,Inspector,Timeline}.tsx

**Smoke tests passed:** GET /api/graph nodes+links ✓ · GET /api/stats ✓ · dashboard greeting + stat tiles ✓ · graph renders, animates, search dims, node click → detail panel with connected facts, Focus zoom, refresh ✓ · chat regression (retrieval + history) ✓ · timeline day groups, System Pulse, type filters ✓ · ingest airlock renders ✓ · build zero TS errors ✓ · console clean ✓

---

## Week 3 — React UI core (2026-06-01) ✅ verified end-to-end in a real browser

**Plain English:** The system got a face. A dark, three-panel web app: conversations in a sidebar on the left, chat in the middle, and a "retrieved context" inspector on the right that shows exactly which memories the system looked up before answering — the "watch it think" panel. There's also an "Add to memory" page for pasting notes and a Timeline showing everything the system has done. Asked it about Gesture Lab in the browser: the answer cited MediaPipe, and the inspector listed the 3 facts it retrieved, each with a "since <date>" timestamp. Ingested a new note about Space Shooter through the UI and watched it appear on the Timeline.

**Technical terms (resume vocabulary):**
- *React 18 + TypeScript + Vite* SPA — strict typing end-to-end; `tsc && vite build` passes with zero errors
- *Tailwind CSS v4* — CSS-first config via `@theme` design tokens (custom dark palette), no tailwind.config.js
- *Typed API client layer* — single `api.ts` module owns all HTTP; interfaces mirror the FastAPI response shapes
- *Explainable-AI UX* — per-message "N memories used →" affordance re-opens the retrieval payload of any past answer in the inspector
- *Optimistic UI + error recovery* — user bubble renders immediately; failures roll back and surface inline
- *Headless browser E2E verification* — drove the real UI with Playwright (system Chrome): chat round-trip, conversation switching, ingest, timeline; screenshots + console-error assertion
- *CORS-scoped local API* — backend allows only the Vite origin; no proxy needed

**Bug fixed:** Browser auto-requested `/favicon.ico` → 404 in the console (no icon declared). Fix: inline SVG data-URI favicon in `index.html` — zero extra files/requests. Lesson: "check the console before declaring success" catches what rendering doesn't. Also note: `node_modules/` built on one OS can't be reused on another (native binaries) — always reinstall per machine.

**Files:** frontend/{package.json,vite.config.ts,tsconfig.json,index.html}, frontend/src/{main.tsx,App.tsx,api.ts,index.css}, frontend/src/components/{Chat,Inspector,Ingest,Timeline}.tsx

**Smoke tests passed:** chat retrieves + answers from memory ✓ · inspector fills with facts ✓ · sidebar list/new/reopen ✓ · ingest via UI ✓ · timeline shows ingest.text + chat.message + memory.episode ✓ · production build zero TS errors ✓ · browser console clean ✓

---

## Week 2 — Context Engine + context-aware chat (2026-05-25) ✅ verified end-to-end

**Plain English:** Taught the librarian to remember the conversation and to look things up before answering. Now when you ask a question, the system first searches its knowledge graph for relevant facts, pulls the last few turns of the current conversation, and glances at what you've been doing recently — then hands all of that to the AI as background before it replies. It answered "What do you know about my Gesture Lab project?" from memory (MediaPipe, computer vision), and when asked a follow-up ("What technology did I say it uses?") it answered correctly using the conversation history. After each exchange it quietly files the conversation itself back into memory, so the system learns from talking to you. Every reply also reports exactly which memories and events it used, so nothing is a black box.

**Technical terms (resume vocabulary):**
- *Retrieval-augmented generation (RAG)* — retrieve relevant memories + conversation history + recent activity, inject as grounded context before the LLM call
- *Context Engine with token budgeting* — character-budgeted assembly (memories/events capped) to stay inside free-tier context limits; transparent retrieval payload returned to the client
- *Stateful multi-turn conversations* — `conversations` + `messages` tables (SQLAlchemy 2.0 async ORM), recent-turns window fed back into the prompt for coherent follow-ups
- *Asynchronous background tasks* — FastAPI `BackgroundTasks` writes the exchange to the knowledge graph after responding, so the user never waits on slow ingestion; isolated DB session for the background write
- *Graceful degradation* — memory search wrapped so a memory outage can never block a conversation; background "remember" swallows errors so filing can never crash chat
- *Explainable AI / provenance* — `context_used` surfaces the exact facts and events retrieved for each answer
- *Separation of concerns* — Context Engine (`app/context/`) is a new plug-in module; the five core modules were untouched, honoring the architecture's hard rules

**Bugs fixed:** None — this session's implementation ran correctly on the first try. Verified the full loop end-to-end rather than patching: confirmed the new `conversations`/`messages` tables auto-create at startup, both chat turns persist, conversation history flows into the follow-up (`conversation_turns_included: 2`), and the background `memory.episode` event lands within ~30s proving the exchange was re-ingested.

**Files:** backend/app/context/{__init__,engine}.py (new), backend/app/models.py (Conversation + Message), backend/app/api/routes.py (context-aware `/api/chat`, `/api/conversations`, `/api/conversations/{id}`)

**Smoke tests passed:** context-aware chat retrieves memories ✓ · multi-turn follow-up uses history ✓ · conversations + messages persisted ✓ · background `memory.episode` event recorded ✓

---

## Week 1 — Foundation (2026-05-18) ✅ verified end-to-end

**Plain English:** Built the empty library. Two databases now run on the laptop (the "filing cabinets"), a Python server (the "librarian's desk") accepts notes, sends them to a cloud model to be understood, files the extracted facts into a knowledge graph, and records every action in a history log. Fed it one note about Gesture Lab; searched "hand tracking"; got the fact back.

**Technical terms (resume vocabulary):**
- *Containerized infrastructure with Docker Compose* — Neo4j (graph DB) + Postgres with pgvector (relational DB + vector extension), with healthchecks and persistent volumes
- *REST API with FastAPI* (async Python) — endpoints for ingest, search, events, chat; auto-generated OpenAPI docs
- *Temporal knowledge graph* via Graphiti — LLM-powered entity/relationship extraction, hybrid search (semantic embeddings + BM25 keyword)
- *Adapter pattern / dependency inversion* — `MemoryStore` Protocol so the memory engine is swappable; only one file may import graphiti_core
- *Multi-provider LLM routing* via LiteLLM — task→model mapping with manual override; provider-agnostic by design
- *Append-only event log* in Postgres (SQLAlchemy 2.0 async) — foundation for timeline + insights
- *12-factor config* — all settings via .env + pydantic-settings; secrets never committed

**Bug fixed:** `config.py` resolved `.env` relative to the process working directory; server runs from `backend/` so the root `.env` never loaded. Fix: resolve repo-root path absolutely. Lesson: config loading must be independent of launch location.

**Files:** docker-compose.yml, backend/app/{main,config,db,models,events}.py, backend/app/memory/{base,graphiti_store}.py, backend/app/llm/router.py, backend/app/api/routes.py

**Smoke tests passed:** health ✓ · ingest→extraction ✓ · search returns facts ✓ · event log ✓ · first commit `fabbc78`