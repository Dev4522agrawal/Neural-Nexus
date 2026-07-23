"""The Insight Engine — Neural Nexus's proactive analyst (plug-in module).

Walks the knowledge graph + recent activity, asks an LLM for discoveries,
stores them as dismissible/pinnable cards. Runs on demand and on a daily loop.
"""

import json
import logging
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import events
from app.llm import router as ai_router
from app.memory.base import MemoryStore
from app.models import Event, Insight

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the Insight Engine of Neural Nexus, a personal cognitive OS.
You study the owner's knowledge graph and recent activity, then surface discoveries
they would not have noticed themselves. Good insights are specific, grounded ONLY in
the provided data, and actionable. Kinds:
- connection: two things in their world that relate ("X could reuse Y")
- opportunity: something they built/learned that unlocks something else
- reminder: something started but seemingly unfinished or gone quiet
- observation: a pattern across their work ("3 projects use WebGL")

Return ONLY a JSON array (no prose, no markdown fences), max 5 items:
[{"kind": "connection", "title": "short punchy title", "body": "1-3 sentences, specific, referencing their actual projects/facts", "related": ["Entity Name", ...]}]
If the data is too thin for good insights, return fewer items or []."""


def _parse(text: str) -> list[dict]:
    text = text.strip()
    text = re.sub(r"^```(json)?|```$", "", text, flags=re.MULTILINE).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\[.*\]", text, re.DOTALL)  # salvage an embedded array
        if not match:
            return []
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return []
    return [d for d in data if isinstance(d, dict) and d.get("title") and d.get("body")]


async def generate(store: MemoryStore, session: AsyncSession) -> list[Insight]:
    sub = await store.get_subgraph(limit=80)
    recent = await events.recent(session, limit=30)

    if not sub.nodes:
        logger.info("insight engine: graph empty, skipping")
        return []

    graph_block = "\n".join(f"- {n.name}: {(n.summary or '')[:140]}" for n in sub.nodes[:50])
    facts_block = "\n".join(f"- {l.fact}" for l in sub.links[:50] if l.fact)
    activity_block = "\n".join(
        f"- [{e.created_at:%Y-%m-%d %H:%M}] {e.type}: {e.title}" for e in recent
    )
    user_prompt = (
        f"KNOWLEDGE GRAPH ENTITIES:\n{graph_block}\n\n"
        f"KNOWN FACTS (relationships):\n{facts_block}\n\n"
        f"RECENT ACTIVITY:\n{activity_block}\n\n"
        "Generate insights now."
    )

    result = await ai_router.complete(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        task="research",
    )
    parsed = _parse(result["content"] or "")

    # Skip near-duplicates of existing active insights (by title).
    existing = {
        i.title.lower()
        for i in (
            await session.execute(select(Insight).where(Insight.dismissed.is_(False)))
        ).scalars()
    }
    created: list[Insight] = []
    for item in parsed[:5]:
        if item["title"].lower() in existing:
            continue
        insight = Insight(
            kind=item.get("kind", "observation"),
            title=item["title"][:300],
            body=item["body"],
            refs=[r for r in item.get("related", []) if isinstance(r, str)][:8],
        )
        session.add(insight)
        created.append(insight)
    if created:
        await events.record(
            session, "insight.generated", f"{len(created)} new insights",
            {"model": result["model"], "titles": [i.title for i in created]},
        )
    else:
        await session.commit()
    logger.info("insight engine: %d insights created", len(created))
    return created


async def due(session: AsyncSession) -> bool:
    """Daily cadence: run if no generation event in the last 20 hours."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=20)
    stmt = (
        select(Event)
        .where(Event.type == "insight.generated", Event.created_at > cutoff)
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none() is None
