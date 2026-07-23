"""AI action-item extraction — turns loose text (a chat exchange, an insight)
into structured tasks. Plug-in module; uses the shared AI Router."""

import json
import logging
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import events
from app.llm import router as ai_router
from app.models import Task

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You extract concrete action items (to-dos) from text.
Return ONLY a JSON array (no prose, no fences), max 4 items. Each:
{"title": "imperative, specific, <12 words", "category": "study|career|project|general",
 "priority": "low|med|high"}
Only include REAL commitments or things the person clearly intends to do. If none, return [].
Do not invent tasks. Do not restate questions as tasks."""


def _parse(text: str) -> list[dict]:
    text = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", text, re.DOTALL)
        if not m:
            return []
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return []
    return [d for d in data if isinstance(d, dict) and d.get("title")]


async def extract_tasks(
    session: AsyncSession, text: str, source: str = "extracted", refs: list[str] | None = None
) -> list[Task]:
    """Pull action items from text and persist any that are new."""
    if len(text.strip()) < 30:
        return []
    try:
        result = await ai_router.complete(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": text[:4000]},
            ],
            task="offline",  # free local call — task extraction shouldn't spend quota
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("task extraction failed: %s", type(e).__name__)
        return []

    parsed = _parse(result["content"] or "")
    if not parsed:
        return []

    # Dedupe against existing open tasks by title (case-insensitive).
    existing = {
        t.title.lower()
        for t in (
            await session.execute(select(Task).where(Task.status == "open"))
        ).scalars()
    }
    created: list[Task] = []
    for item in parsed[:4]:
        title = item["title"].strip()
        if not title or title.lower() in existing:
            continue
        task = Task(
            title=title[:300],
            category=item.get("category", "general"),
            priority=item.get("priority", "med"),
            source=source,
            refs=refs or [],
        )
        session.add(task)
        created.append(task)
        existing.add(title.lower())
    if created:
        await events.record(
            session, "task.extracted", f"{len(created)} task(s) from {source}",
            {"titles": [t.title for t in created]},
        )
    else:
        await session.commit()
    return created
