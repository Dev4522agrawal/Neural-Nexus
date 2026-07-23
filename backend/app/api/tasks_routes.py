"""Tasks API: list/add/update/complete/delete + AI extraction from text.
Plug-in module — mounted separately, core untouched."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import events
from app.db import get_session
from app.tasks import extract_tasks
from app.models import Task

tasks_api = APIRouter(prefix="/api/tasks")


class NewTask(BaseModel):
    title: str
    notes: str = ""
    category: str = "general"
    priority: str = "med"
    due_date: datetime | None = None
    refs: list[str] = []


class UpdateTask(BaseModel):
    title: str | None = None
    notes: str | None = None
    category: str | None = None
    priority: str | None = None
    status: str | None = None
    due_date: datetime | None = None


class ExtractRequest(BaseModel):
    text: str
    source: str = "extracted"
    refs: list[str] = []


def _serialize(t: Task) -> dict:
    return {
        "id": t.id, "title": t.title, "notes": t.notes, "category": t.category,
        "status": t.status, "priority": t.priority, "source": t.source, "refs": t.refs,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "created_at": t.created_at.isoformat(),
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
    }


@tasks_api.get("")
async def list_tasks(
    session: AsyncSession = Depends(get_session),
    status: str | None = None,
    category: str | None = None,
) -> dict:
    stmt = select(Task)
    if status:
        stmt = stmt.where(Task.status == status)
    if category:
        stmt = stmt.where(Task.category == category)
    # open first, then by priority (high→low), then newest
    order = {"high": 0, "med": 1, "low": 2}
    rows = list((await session.execute(stmt)).scalars())
    rows.sort(key=lambda t: (t.status == "done", order.get(t.priority, 1), -t.created_at.timestamp()))
    return {"tasks": [_serialize(t) for t in rows]}


@tasks_api.post("")
async def add_task(body: NewTask, session: AsyncSession = Depends(get_session)) -> dict:
    task = Task(
        title=body.title.strip()[:300], notes=body.notes, category=body.category,
        priority=body.priority, due_date=body.due_date, source="manual", refs=body.refs,
    )
    session.add(task)
    await events.record(session, "task.added", task.title[:120], {"category": task.category})
    return _serialize(task)


@tasks_api.patch("/{task_id}")
async def update_task(
    task_id: str, body: UpdateTask, session: AsyncSession = Depends(get_session)
) -> dict:
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(task, k, v)
    if data.get("status") == "done" and task.completed_at is None:
        from datetime import timezone

        task.completed_at = datetime.now(timezone.utc)
        await events.record(session, "task.completed", task.title[:120])
    elif data.get("status") == "open":
        task.completed_at = None
    await session.commit()
    return _serialize(task)


@tasks_api.delete("/{task_id}")
async def delete_task(task_id: str, session: AsyncSession = Depends(get_session)) -> dict:
    task = await session.get(Task, task_id)
    if task is not None:
        await session.delete(task)
        await session.commit()
    return {"status": "deleted"}


@tasks_api.post("/extract")
async def extract(body: ExtractRequest, session: AsyncSession = Depends(get_session)) -> dict:
    created = await extract_tasks(session, body.text, source=body.source, refs=body.refs)
    return {"created": len(created), "tasks": [_serialize(t) for t in created]}
