"""Neural Nexus — Personal Cognitive Operating System (core API)."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.import_routes import import_api, upload_api
from app.api.insights_routes import insights_api
from app.api.routes import api
from app.api.tasks_routes import tasks_api
from app.db import SessionLocal, create_tables
from app.memory.graphiti_store import GraphitiMemoryStore

logger = logging.getLogger(__name__)


async def _daily_insights(app: FastAPI) -> None:
    """Background analyst: generate insights roughly once a day."""
    from app.insights.engine import due, generate

    await asyncio.sleep(120)  # let the system settle after boot
    while True:
        try:
            async with SessionLocal() as session:
                if await due(session):
                    await generate(app.state.memory, session)
        except Exception as e:  # noqa: BLE001
            logger.warning("daily insight run failed: %s", type(e).__name__)
        await asyncio.sleep(6 * 3600)  # re-check every 6h; `due` enforces daily cadence


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    store = GraphitiMemoryStore()
    await store.initialize()
    app.state.memory = store
    loop_task = asyncio.create_task(_daily_insights(app))
    yield
    loop_task.cancel()
    await store.close()


app = FastAPI(title="Neural Nexus", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # :8000 = backend serving the built UI (production); :5173 = Vite dev server.
    allow_origins=["http://localhost:8000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api)
app.include_router(import_api)
app.include_router(upload_api)
app.include_router(insights_api)
app.include_router(tasks_api)

# Serve the built UI from the backend itself — one process, one address.
# API routes above take priority; anything else falls through to the SPA.
# (`npm run dev` on :5173 still works for UI development via CORS.)
from pathlib import Path  # noqa: E402

from fastapi.staticfiles import StaticFiles  # noqa: E402

_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _DIST.is_dir():
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="ui")
