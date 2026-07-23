"""Event log helpers. Modules call record() — never write the table directly."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event


async def record(session: AsyncSession, type: str, title: str, payload: dict | None = None) -> Event:
    event = Event(type=type, title=title, payload=payload or {})
    session.add(event)
    await session.commit()
    return event


async def recent(session: AsyncSession, limit: int = 50, type_prefix: str | None = None) -> list[Event]:
    stmt = select(Event).order_by(Event.created_at.desc()).limit(limit)
    if type_prefix:
        stmt = stmt.where(Event.type.startswith(type_prefix))
    result = await session.execute(stmt)
    return list(result.scalars())
