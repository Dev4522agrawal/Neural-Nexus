"""Import + file-upload API. Separate router: importers are a plug-in module."""

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import events
from app.db import get_session
from app.importers import SCANNERS
from app.importers.base import ImportItem
from app.importers.jobs import current_job, run_import
from app.models import ImportedItem

import_api = APIRouter(prefix="/api/import")


class RunRequest(BaseModel):
    source: str
    ids: list[str] | None = None  # None = everything found
    limit: int | None = None


def _scan(source: str) -> list[ImportItem]:
    scanner = SCANNERS.get(source)
    if scanner is None:
        raise HTTPException(400, f"unknown source '{source}'")
    return scanner()


@import_api.get("/scan/{source}")
async def scan(source: str, session: AsyncSession = Depends(get_session)) -> dict:
    items = _scan(source)
    seen = {
        row
        for row in (await session.execute(select(ImportedItem.content_hash))).scalars()
    }
    return {
        "source": source,
        "items": [
            {
                "external_id": it.external_id,
                "title": it.title,
                "chars": len(it.content),
                "chunks": len(it.chunks),
                "created_at": it.created_at.isoformat() if it.created_at else None,
                "already_imported": it.content_hash in seen,
            }
            for it in items
        ],
    }


@import_api.post("/run")
async def run(body: RunRequest, request: Request) -> dict:
    job = current_job()
    if job and job.state == "running":
        raise HTTPException(409, "an import is already running")
    items = _scan(body.source)
    if body.ids is not None:
        wanted = set(body.ids)
        items = [it for it in items if it.external_id in wanted]
    if body.limit:
        items = items[: body.limit]
    if not items:
        raise HTTPException(404, "nothing to import — check the staging folder")
    job = await run_import(request.app.state.memory, body.source, items)
    return job.snapshot()


@import_api.get("/status")
async def status() -> dict:
    job = current_job()
    return {"job": job.snapshot() if job else None}


# --- Direct file upload (the "Upload file" tab) ---

upload_api = APIRouter(prefix="/api/ingest")

TEXT_TYPES = (".md", ".txt", ".markdown", ".log", ".json", ".csv")


@upload_api.post("/file")
async def ingest_file(
    file: UploadFile,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    raw = await file.read()
    name = file.filename or "upload"
    suffix = ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""

    if suffix == ".pdf":
        try:
            import io

            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(raw))
            text = "\n".join((p.extract_text() or "") for p in reader.pages)[:20000]
        except Exception as e:  # noqa: BLE001
            raise HTTPException(422, f"could not read PDF: {type(e).__name__}") from e
    elif suffix in TEXT_TYPES or not suffix:
        text = raw.decode("utf-8", errors="ignore")
    else:
        raise HTTPException(415, f"unsupported file type '{suffix}' (txt/md/pdf for now)")

    text = text.strip()
    if len(text) < 40:
        raise HTTPException(422, "file contains too little readable text")

    item = ImportItem(
        source="docs",
        external_id=name,
        title=name.rsplit(".", 1)[0].replace("_", " ").replace("-", " "),
        content=f"Document: {name}\n\n{text}",
        source_description=f"uploaded file ({name})",
    )
    store = request.app.state.memory
    try:
        for i, chunk in enumerate(item.chunks):
            episode_name = (
                item.title if len(item.chunks) == 1 else f"{item.title} (part {i + 1}/{len(item.chunks)})"
            )
            await store.add_episode(
                name=episode_name, content=chunk, source_description=item.source_description
            )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            502, f"Memory engine could not file this document ({type(e).__name__}). Try again shortly."
        ) from e
    session.add(
        ImportedItem(
            source="docs", external_id=name, title=item.title[:300], content_hash=item.content_hash
        )
    )
    event = await events.record(session, "ingest.file", name, {"chars": len(text)})
    return {"status": "ingested", "event_id": event.id, "chunks": len(item.chunks)}
