"""Insights API: list, generate on demand, pin, dismiss."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.insights.engine import generate
from app.models import Insight

insights_api = APIRouter(prefix="/api/insights")


def _serialize(i: Insight) -> dict:
    return {
        "id": i.id, "kind": i.kind, "title": i.title, "body": i.body,
        "refs": i.refs, "pinned": i.pinned, "created_at": i.created_at.isoformat(),
    }


@insights_api.get("")
async def list_insights(session: AsyncSession = Depends(get_session), limit: int = 20) -> dict:
    stmt = (
        select(Insight)
        .where(Insight.dismissed.is_(False))
        .order_by(Insight.pinned.desc(), Insight.created_at.desc())
        .limit(limit)
    )
    rows = list((await session.execute(stmt)).scalars())
    return {"insights": [_serialize(i) for i in rows]}


@insights_api.post("/generate")
async def generate_now(request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    try:
        created = await generate(request.app.state.memory, session)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            502, f"Insight generation failed ({type(e).__name__}). Try again shortly."
        ) from e
    return {"created": len(created), "insights": [_serialize(i) for i in created]}


@insights_api.post("/{insight_id}/dismiss")
async def dismiss(insight_id: str, session: AsyncSession = Depends(get_session)) -> dict:
    insight = await session.get(Insight, insight_id)
    if insight is None:
        raise HTTPException(404, "insight not found")
    insight.dismissed = True
    await session.commit()
    return {"status": "dismissed"}


@insights_api.post("/{insight_id}/pin")
async def pin(insight_id: str, session: AsyncSession = Depends(get_session)) -> dict:
    insight = await session.get(Insight, insight_id)
    if insight is None:
        raise HTTPException(404, "insight not found")
    insight.pinned = not insight.pinned
    await session.commit()
    return {"status": "pinned" if insight.pinned else "unpinned"}
