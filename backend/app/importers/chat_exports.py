"""Parsers for ChatGPT and claude.ai data exports.

Both exports are JSON files of conversations; formats differ:
- ChatGPT: [{title, create_time, mapping: {id: {message, parent, children}}}]
  (a tree — we flatten by timestamp, which is correct for linear chats)
- Claude:  [{name, created_at, chat_messages: [{sender, text|content[], created_at}]}]

Each conversation becomes one ImportItem (transcript form). Loose .md/.txt files
dropped in the claude/ folder (e.g. memory dumps) are picked up as notes.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from app.importers.base import IMPORTS_DIR, ImportItem


def _ts(val) -> datetime | None:
    try:
        if isinstance(val, (int, float)):
            return datetime.fromtimestamp(val, tz=timezone.utc)
        if isinstance(val, str) and val:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except (ValueError, OSError):
        pass
    return None


def _chatgpt_transcript(conv: dict) -> str:
    msgs = []
    for node in (conv.get("mapping") or {}).values():
        m = node.get("message") if isinstance(node, dict) else None
        if not m:
            continue
        role = (m.get("author") or {}).get("role")
        if role not in ("user", "assistant"):
            continue
        content = m.get("content") or {}
        if content.get("content_type") != "text":
            continue
        text = "\n".join(p for p in content.get("parts") or [] if isinstance(p, str)).strip()
        if not text:
            continue
        msgs.append((m.get("create_time") or 0, role, text))
    msgs.sort(key=lambda t: t[0])
    return "\n\n".join(f"{'User' if r == 'user' else 'Assistant'}: {t}" for _, r, t in msgs)


def scan_chatgpt() -> list[ImportItem]:
    items: list[ImportItem] = []
    root = IMPORTS_DIR / "chatgpt"
    for path in sorted(root.rglob("conversations.json")):
        try:
            conversations = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        for conv in conversations if isinstance(conversations, list) else []:
            transcript = _chatgpt_transcript(conv)
            if len(transcript) < 80:  # skip empty/trivial chats
                continue
            title = conv.get("title") or "Untitled ChatGPT conversation"
            items.append(
                ImportItem(
                    source="chatgpt",
                    external_id=conv.get("id") or conv.get("conversation_id") or title,
                    title=title,
                    content=f"ChatGPT conversation: {title}\n\n{transcript}",
                    source_description="imported ChatGPT conversation",
                    created_at=_ts(conv.get("create_time")),
                )
            )
    # loose memories.txt copied from ChatGPT settings
    for path in sorted(root.glob("*.txt")):
        text = path.read_text(encoding="utf-8", errors="ignore").strip()
        if text:
            items.append(
                ImportItem(
                    source="chatgpt",
                    external_id=path.name,
                    title=f"ChatGPT saved memories ({path.name})",
                    content=text,
                    source_description="ChatGPT saved memories",
                )
            )
    return items


def _claude_transcript(conv: dict) -> str:
    msgs = []
    for m in conv.get("chat_messages") or []:
        text = (m.get("text") or "").strip()
        if not text:
            text = "\n".join(
                (b.get("text") or "").strip()
                for b in m.get("content") or []
                if isinstance(b, dict) and b.get("type") == "text"
            ).strip()
        if not text:
            continue
        role = "User" if m.get("sender") == "human" else "Assistant"
        msgs.append((m.get("created_at") or "", role, text))
    msgs.sort(key=lambda t: t[0])
    return "\n\n".join(f"{r}: {t}" for _, r, t in msgs)


def scan_claude() -> list[ImportItem]:
    items: list[ImportItem] = []
    root = IMPORTS_DIR / "claude"
    for path in sorted(root.rglob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        conversations = data if isinstance(data, list) else data.get("conversations", [])
        for conv in conversations:
            if not isinstance(conv, dict) or "chat_messages" not in conv:
                continue
            transcript = _claude_transcript(conv)
            if len(transcript) < 80:
                continue
            title = conv.get("name") or "Untitled Claude conversation"
            items.append(
                ImportItem(
                    source="claude",
                    external_id=conv.get("uuid") or title,
                    title=title,
                    content=f"Claude conversation: {title}\n\n{transcript}",
                    source_description="imported Claude conversation",
                    created_at=_ts(conv.get("created_at")),
                )
            )
    for path in sorted(root.glob("*.md")):
        text = path.read_text(encoding="utf-8", errors="ignore").strip()
        if text:
            items.append(
                ImportItem(
                    source="claude",
                    external_id=path.name,
                    title=path.stem.replace("-", " "),
                    content=text,
                    source_description="Claude memory note",
                )
            )
    return items
