"""Importer foundations: staged-data locations, items, chunking, hashing.

An ImportItem is one unit of knowledge from an external source (a conversation,
a project, a document). Items are content-hashed so re-running an import never
duplicates memories — safe to re-export and re-import forever.
"""

import hashlib
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

# repo_root/data/imports — same staging area documented in data/imports/README.md
IMPORTS_DIR = Path(__file__).resolve().parents[3] / "data" / "imports"

MAX_EPISODE_CHARS = 6000  # keep each episode inside comfortable LLM context

# Free-tier protection: a single giant conversation can be hundreds of chunks —
# enough to burn a whole day's Gemini quota on one item. Cap chunks per item,
# keeping the start (topic/setup) and the end (conclusions/decisions), which
# carry most of the signal in long chats.
MAX_CHUNKS_PER_ITEM = 12


@dataclass
class ImportItem:
    source: str  # "chatgpt" | "claude" | "github" | "docs"
    external_id: str
    title: str
    content: str
    source_description: str
    created_at: datetime | None = None
    meta: dict = field(default_factory=dict)

    @property
    def content_hash(self) -> str:
        return hashlib.sha256(self.content.encode("utf-8", "ignore")).hexdigest()

    @property
    def chunks(self) -> list[str]:
        """Split long content on paragraph boundaries into episode-sized chunks."""
        text = self.content.strip()
        if len(text) <= MAX_EPISODE_CHARS:
            return [text]
        parts: list[str] = []
        current: list[str] = []
        size = 0
        for para in text.split("\n\n"):
            if size + len(para) > MAX_EPISODE_CHARS and current:
                parts.append("\n\n".join(current))
                current, size = [], 0
            # A single paragraph longer than the budget gets hard-split.
            while len(para) > MAX_EPISODE_CHARS:
                parts.append(para[:MAX_EPISODE_CHARS])
                para = para[MAX_EPISODE_CHARS:]
            current.append(para)
            size += len(para) + 2
        if current:
            parts.append("\n\n".join(current))
        if len(parts) > MAX_CHUNKS_PER_ITEM:
            trimmed = len(parts) - MAX_CHUNKS_PER_ITEM + 1
            parts = (
                parts[: MAX_CHUNKS_PER_ITEM - 4]
                + [f"[... {trimmed} middle sections of this item were trimmed to protect the free-tier quota ...]"]
                + parts[-3:]
            )
        return parts
