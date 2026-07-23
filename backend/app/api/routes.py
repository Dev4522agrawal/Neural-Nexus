"""V1 API surface: health, ingest, search, events, and context-aware chat.

Chat pipeline (the core Neural Nexus loop):
  prompt → Context Engine (memories + turns + activity) → AI Router → response
  → persist turns → remember the exchange as an episode → event log
"""

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import events
from app.context import build_context, system_prompt
from app.db import SessionLocal, get_session
from app.llm import router as ai_router
from app.models import Conversation, Message

api = APIRouter(prefix="/api")


def memory(request: Request):
    return request.app.state.memory


# --- Schemas ---

class IngestText(BaseModel):
    title: str
    content: str
    source_description: str = "user note"
    reference_time: datetime | None = None
    is_json: bool = False


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None  # continue a conversation, or omit to start one
    task: str | None = None             # manual task override
    model_override: str | None = None   # manual model override
    remember: bool = True               # ingest this exchange into memory afterwards


# --- Routes ---

@api.get("/health")
async def health(request: Request) -> dict:
    """Vital signs for every organ — powers the sidebar status dots."""
    import httpx

    from app.config import settings
    from app.db import engine

    services: dict[str, bool | str] = {}

    try:
        await memory(request).counts()
        services["neo4j"] = True
    except Exception:
        services["neo4j"] = False

    try:
        from sqlalchemy import text

        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        services["postgres"] = True
    except Exception:
        services["postgres"] = False

    try:
        base = settings.ollama_base_url.removesuffix("/v1")
        async with httpx.AsyncClient(timeout=1.5) as client:
            r = await client.get(f"{base}/api/tags")
        services["ollama"] = r.status_code == 200
    except Exception:
        services["ollama"] = False

    services["gemini"] = "configured" if settings.gemini_api_key else "missing"

    core_ok = bool(services["neo4j"]) and bool(services["postgres"])
    return {"status": "ok" if core_ok else "degraded", "services": services}


@api.post("/ingest/text")
async def ingest_text(
    body: IngestText,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    store = memory(request)
    try:
        await store.add_episode(
            name=body.title,
            content=body.content,
            source_description=body.source_description,
            reference_time=body.reference_time,
            is_json=body.is_json,
        )
    except Exception as e:
        # Unhandled exceptions bypass CORSMiddleware and surface in the browser
        # as an opaque CORS failure; a proper HTTPException keeps its headers.
        raise HTTPException(
            status_code=502,
            detail=f"Memory engine could not file this note (LLM provider error: {type(e).__name__}). Try again shortly.",
        ) from e
    event = await events.record(
        session, "ingest.text", body.title, {"source": body.source_description}
    )
    return {"status": "ingested", "event_id": event.id}


@api.get("/search")
async def search(q: str, request: Request, limit: int = 10) -> dict:
    store = memory(request)
    hits = await store.search(q, limit=limit)
    return {"query": q, "results": [vars(h) for h in hits]}


@api.get("/search/nodes")
async def search_nodes(q: str, request: Request, limit: int = 10) -> dict:
    store = memory(request)
    nodes = await store.search_nodes(q, limit=limit)
    return {"query": q, "results": [vars(n) for n in nodes]}


@api.get("/stats")
async def stats(request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    from sqlalchemy import func

    from app.models import Event

    try:
        graph_counts = await memory(request).counts()
    except Exception:
        graph_counts = {"nodes": 0, "edges": 0}

    conversations = (
        await session.execute(select(func.count()).select_from(Conversation))
    ).scalar() or 0

    # Events per day, last 14 days (for sparklines + activity strips)
    day = func.date_trunc("day", Event.created_at)
    rows = (
        await session.execute(
            select(day.label("day"), func.count().label("n"))
            .group_by(day)
            .order_by(day.desc())
            .limit(14)
        )
    ).all()
    histogram = [{"day": r.day.isoformat(), "count": r.n} for r in reversed(rows)]
    events_today = histogram[-1]["count"] if histogram else 0

    return {
        "memories": graph_counts["nodes"],
        "connections": graph_counts["edges"],
        "conversations": conversations,
        "events_today": events_today,
        "histogram": histogram,
    }


@api.get("/graph")
async def graph(request: Request, limit: int = 300) -> dict:
    sub = await memory(request).get_subgraph(limit=limit)
    return {
        "nodes": [
            {
                "id": n.uuid,
                "name": n.name,
                "summary": n.summary,
                "labels": n.labels,
                "degree": n.attributes.get("degree", 0),
            }
            for n in sub.nodes
        ],
        "links": [
            {"source": l.source, "target": l.target, "fact": l.fact, "name": l.name}
            for l in sub.links
        ],
    }


@api.get("/events")
async def list_events(
    session: AsyncSession = Depends(get_session),
    limit: int = 50,
    type_prefix: str | None = None,
) -> dict:
    rows = await events.recent(session, limit=limit, type_prefix=type_prefix)
    return {
        "events": [
            {
                "id": e.id,
                "type": e.type,
                "title": e.title,
                "payload": e.payload,
                "created_at": e.created_at.isoformat(),
            }
            for e in rows
        ]
    }


async def _extract_tasks_bg(text: str) -> None:
    """Background: mine the exchange for to-dos via the local model."""
    try:
        from app.tasks import extract_tasks

        async with SessionLocal() as session:
            await extract_tasks(session, text, source="chat")
    except Exception:
        pass


async def _auto_title(conversation_id: str, user_msg: str, assistant_msg: str) -> None:
    """Background: have the local model write a proper short thread title."""
    try:
        result = await ai_router.complete(
            [
                {
                    "role": "user",
                    "content": (
                        "Write a 3-6 word title for this conversation. Reply with ONLY "
                        f"the title, no quotes.\n\nUser: {user_msg[:500]}\n"
                        f"Assistant: {assistant_msg[:500]}"
                    ),
                }
            ],
            task="offline",  # free local call; never spends quota
        )
        title = (result["content"] or "").strip().strip('"').splitlines()[0][:80]
        if len(title) >= 3:
            async with SessionLocal() as session:
                conv = await session.get(Conversation, conversation_id)
                if conv is not None:
                    conv.title = title
                    await session.commit()
    except Exception:
        pass  # keep the truncated-first-message title


async def _remember_exchange(store, user_msg: str, assistant_msg: str, conversation_id: str) -> None:
    """Background: file this exchange into the knowledge graph, then log it."""
    try:
        await store.add_episode(
            name=f"Conversation {conversation_id[:8]}",
            content=f"User: {user_msg}\nAssistant: {assistant_msg}",
            source_description="Neural Nexus conversation",
        )
        async with SessionLocal() as session:
            await events.record(
                session, "memory.episode", f"Remembered exchange ({conversation_id[:8]})",
                {"conversation_id": conversation_id},
            )
    except Exception:
        pass  # remembering must never crash chat; worst case we just don't file it


@api.post("/chat")
async def chat(
    body: ChatRequest,
    request: Request,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict:
    store = memory(request)

    # 1. Find or start the conversation.
    is_new = False
    if body.conversation_id:
        conv = await session.get(Conversation, body.conversation_id)
        if conv is None:
            conv = Conversation(id=body.conversation_id, title=body.message[:80])
            session.add(conv)
            is_new = True
    else:
        conv = Conversation(title=body.message[:80])
        session.add(conv)
        is_new = True
    await session.flush()

    # 2. Context Engine: what do we already know that's relevant?
    ctx = await build_context(store, session, body.message, conversation_id=conv.id)

    # 3. Assemble messages: system prompt (with memories) + recent turns + new prompt.
    llm_messages = [{"role": "system", "content": system_prompt(ctx)}]
    llm_messages += [{"role": m.role, "content": m.content} for m in ctx.recent_messages]
    llm_messages.append({"role": "user", "content": body.message})

    # 4. Route to the right model and get the answer.
    result = await ai_router.complete(
        llm_messages, task=body.task, model_override=body.model_override
    )

    # 5. Persist both turns.
    session.add(Message(conversation_id=conv.id, role="user", content=body.message))
    session.add(
        Message(
            conversation_id=conv.id, role="assistant",
            content=result["content"] or "", model=result["model"],
        )
    )
    await events.record(
        session, "chat.message", body.message[:120],
        {"task": result["task"], "model": result["model"], "conversation_id": conv.id},
    )

    # 6. Remember the exchange (background — don't make the user wait on Gemini).
    if body.remember:
        background.add_task(
            _remember_exchange, store, body.message, result["content"] or "", conv.id
        )
    if is_new:
        background.add_task(_auto_title, conv.id, body.message, result["content"] or "")
    # Auto-capture action items from the exchange (background, free local model).
    background.add_task(
        _extract_tasks_bg, f"User: {body.message}\nAssistant: {result['content'] or ''}"
    )

    return {
        "conversation_id": conv.id,
        "response": result["content"],
        "task": result["task"],
        "model": result["model"],
        "notice": result.get("notice"),  # e.g. night-shift fallback
        "context_used": ctx.summary(),  # transparency: what the system remembered
    }


@api.get("/conversations")
async def list_conversations(session: AsyncSession = Depends(get_session), limit: int = 50) -> dict:
    stmt = select(Conversation).order_by(Conversation.created_at.desc()).limit(limit)
    rows = list((await session.execute(stmt)).scalars())
    return {
        "conversations": [
            {"id": c.id, "title": c.title, "created_at": c.created_at.isoformat()} for c in rows
        ]
    }


@api.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str, session: AsyncSession = Depends(get_session)
) -> dict:
    from sqlalchemy import delete as sql_delete

    await session.execute(sql_delete(Message).where(Message.conversation_id == conversation_id))
    conv = await session.get(Conversation, conversation_id)
    if conv is not None:
        await session.delete(conv)
    await events.record(session, "chat.deleted", f"Deleted conversation {conversation_id[:8]}")
    return {"status": "deleted"}


@api.get("/memory/episodes")
async def list_memories(request: Request, limit: int = 100) -> dict:
    return {"episodes": await memory(request).list_episodes(limit=limit)}


@api.delete("/memory/episodes/{episode_uuid}")
async def forget_memory(
    episode_uuid: str, request: Request, session: AsyncSession = Depends(get_session)
) -> dict:
    await memory(request).forget_episode(episode_uuid)
    await events.record(session, "memory.forgotten", f"Forgot episode {episode_uuid[:8]}")
    return {"status": "forgotten"}


@api.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str, session: AsyncSession = Depends(get_session)
) -> dict:
    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    rows = list((await session.execute(stmt)).scalars())
    return {
        "conversation_id": conversation_id,
        "messages": [
            {"role": m.role, "content": m.content, "model": m.model,
             "created_at": m.created_at.isoformat()}
            for m in rows
        ],
    }
