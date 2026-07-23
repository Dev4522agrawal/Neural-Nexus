"""Context Engine — the heart of Neural Nexus.

Before any model sees a prompt, this module gathers what the system already
knows: relevant memories (knowledge graph), the current conversation, and
recent activity (event log). The result is a transparent, budgeted context
block — the UI can always show exactly WHAT was retrieved and WHY.
"""

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import events
from app.memory.base import MemoryHit, MemoryStore
from app.models import Event, Message

# Rough character budgets (≈4 chars per token). Keeps us well inside free-tier limits.
MEMORY_CHAR_BUDGET = 6000
EVENTS_CHAR_BUDGET = 1500
RECENT_TURNS = 8


@dataclass
class ContextBlock:
    memories: list[MemoryHit] = field(default_factory=list)
    recent_messages: list[Message] = field(default_factory=list)
    recent_events: list[Event] = field(default_factory=list)
    text: str = ""

    def summary(self) -> dict:
        """Transparency payload for the UI: what was retrieved."""
        return {
            "memories": [
                {"fact": m.fact, "valid_at": m.valid_at.isoformat() if m.valid_at else None}
                for m in self.memories
            ],
            "recent_events": [
                {"type": e.type, "title": e.title, "at": e.created_at.isoformat()}
                for e in self.recent_events
            ],
            "conversation_turns_included": len(self.recent_messages),
        }


async def build_context(
    store: MemoryStore,
    session: AsyncSession,
    prompt: str,
    conversation_id: str | None = None,
) -> ContextBlock:
    ctx = ContextBlock()

    # 1. Relevant memories from the knowledge graph (hybrid search).
    try:
        ctx.memories = await store.search(prompt, limit=10)
    except Exception:
        ctx.memories = []  # memory being down must never block a conversation

    # 2. Recent turns of this conversation.
    if conversation_id:
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(RECENT_TURNS)
        )
        rows = list((await session.execute(stmt)).scalars())
        ctx.recent_messages = list(reversed(rows))  # chronological order

    # 3. Recent activity — what the user has been doing lately.
    ctx.recent_events = await events.recent(session, limit=8)

    ctx.text = _render(ctx)
    return ctx


def _render(ctx: ContextBlock) -> str:
    parts: list[str] = []

    if ctx.memories:
        lines, used = [], 0
        for m in ctx.memories:
            line = f"- {m.fact}"
            if used + len(line) > MEMORY_CHAR_BUDGET:
                break
            lines.append(line)
            used += len(line)
        parts.append("RELEVANT MEMORIES (from the user's knowledge graph):\n" + "\n".join(lines))

    if ctx.recent_events:
        lines, used = [], 0
        for e in ctx.recent_events:
            line = f"- [{e.created_at:%Y-%m-%d %H:%M}] {e.type}: {e.title}"
            if used + len(line) > EVENTS_CHAR_BUDGET:
                break
            lines.append(line)
            used += len(line)
        parts.append("RECENT ACTIVITY (event log):\n" + "\n".join(lines))

    return "\n\n".join(parts)


def system_prompt(ctx: ContextBlock) -> str:
    base = (
        "You are Neural Nexus, the user's personal cognitive operating system. "
        "You have persistent memory of their projects, notes, code, and history. "
        "Use the context below as ground truth about the user; prefer it over "
        "assumptions. If the context is relevant, weave it in naturally — you "
        "remember these things, so speak like it. Point out connections between "
        "the user's question and their past work when you see them."
    )
    return f"{base}\n\n{ctx.text}" if ctx.text else base
