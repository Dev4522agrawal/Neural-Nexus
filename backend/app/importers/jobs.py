"""Import job runner: sequential, quota-aware, resumable.

Design decisions (the free-tier survival kit):
- One item at a time with a pause between → stays under requests/min limits.
- On rate-limit errors: one long cooldown retry, then mark failed and continue.
- Every filed item is hashed into imported_items → re-runs skip instantly,
  so a job interrupted by quota exhaustion RESUMES tomorrow for free.
"""

import asyncio
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select

from app import events
from app.db import SessionLocal
from app.importers.base import ImportItem
from app.memory.base import MemoryStore
from app.models import ImportedItem

PAUSE_SECONDS = 10  # between items; generous for free-tier RPM
RATE_LIMIT_COOLDOWN = 75


@dataclass
class ImportJob:
    id: str
    source: str
    total: int
    done: int = 0
    skipped: int = 0
    failed: int = 0
    current: str = ""
    state: str = "running"  # running | finished | error
    errors: list[str] = field(default_factory=list)

    def snapshot(self) -> dict:
        return {
            "id": self.id, "source": self.source, "total": self.total,
            "done": self.done, "skipped": self.skipped, "failed": self.failed,
            "current": self.current, "state": self.state, "errors": self.errors[-5:],
        }


_current: ImportJob | None = None


def current_job() -> ImportJob | None:
    return _current


def _is_rate_limit(exc: Exception) -> bool:
    text = f"{type(exc).__name__}: {exc}".lower()
    return "ratelimit" in text or "429" in text or "503" in text or "quota" in text


async def _file_item(store: MemoryStore, item: ImportItem) -> None:
    chunks = item.chunks
    for i, chunk in enumerate(chunks):
        name = item.title if len(chunks) == 1 else f"{item.title} (part {i + 1}/{len(chunks)})"
        await store.add_episode(
            name=name,
            content=chunk,
            source_description=item.source_description,
            reference_time=item.created_at,
        )


async def run_import(store: MemoryStore, source: str, items: list[ImportItem]) -> ImportJob:
    global _current
    job = ImportJob(id=str(uuid.uuid4())[:8], source=source, total=len(items))
    _current = job

    async def worker() -> None:
        try:
            async with SessionLocal() as session:
                # scalars() over a single-column select yields the hash strings directly.
                seen = set(
                    (await session.execute(select(ImportedItem.content_hash))).scalars()
                )
            for item in items:
                job.current = item.title[:80]
                if item.content_hash in seen:
                    job.skipped += 1
                    continue
                attempt = 0
                while True:
                    try:
                        await _file_item(store, item)
                        break
                    except Exception as e:  # noqa: BLE001
                        if _is_rate_limit(e) and attempt == 0:
                            attempt = 1
                            await asyncio.sleep(RATE_LIMIT_COOLDOWN)
                            continue
                        job.failed += 1
                        job.errors.append(f"{item.title[:60]}: {type(e).__name__}")
                        break
                else:
                    continue
                if job.errors and job.errors[-1].startswith(item.title[:60]):
                    await asyncio.sleep(PAUSE_SECONDS)
                    continue
                async with SessionLocal() as session:
                    session.add(
                        ImportedItem(
                            source=item.source,
                            external_id=item.external_id,
                            title=item.title[:300],
                            content_hash=item.content_hash,
                        )
                    )
                    await events.record(
                        session, f"import.{item.source}", item.title[:120],
                        {"job": job.id},
                    )
                seen.add(item.content_hash)
                job.done += 1
                await asyncio.sleep(PAUSE_SECONDS)
            job.state = "finished"
            job.current = ""
        except Exception as e:  # noqa: BLE001
            job.state = "error"
            job.errors.append(f"job crashed: {type(e).__name__}: {e}")

    asyncio.create_task(worker())
    return job
