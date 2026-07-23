"""Neural Nexus MCP server — makes your brain available to any MCP client
(Claude Desktop, Claude Code, Cursor…).

This is a thin client over the running Nexus API (default http://localhost:8000),
so it respects the same MemoryStore boundary and needs the backend running. It
exposes read + write tools: search memory, ingest notes, browse the graph, and
manage tasks — so an external AI can consult and update your second brain mid-task.

Run:  python mcp_server/nexus_mcp.py           (stdio; the client launches it)
Env:  NEXUS_API_URL (default http://localhost:8000)
"""

import os

import httpx
from mcp.server.fastmcp import FastMCP

NEXUS_API = os.environ.get("NEXUS_API_URL", "http://localhost:8000").rstrip("/")

mcp = FastMCP("neural-nexus")


async def _get(path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.get(f"{NEXUS_API}/api{path}", params=params)
        r.raise_for_status()
        return r.json()


async def _post(path: str, body: dict) -> dict:
    async with httpx.AsyncClient(timeout=180) as client:
        r = await client.post(f"{NEXUS_API}/api{path}", json=body)
        r.raise_for_status()
        return r.json()


@mcp.tool()
async def search_memory(query: str, limit: int = 8) -> str:
    """Search Dev's personal knowledge graph (projects, notes, code, conversations,
    research) for facts relevant to a query. Use this before answering anything about
    Dev's own work, decisions, or history — it's his permanent memory."""
    data = await _get("/search", {"q": query, "limit": limit})
    hits = data.get("results", [])
    if not hits:
        return f"No memories found for '{query}'."
    return "Relevant memories:\n" + "\n".join(f"- {h['fact']}" for h in hits)


@mcp.tool()
async def remember(title: str, content: str) -> str:
    """Save a new memory into Dev's knowledge graph — a note, decision, idea, or fact
    worth keeping. Entities and relationships are extracted automatically."""
    await _post("/ingest/text", {
        "title": title, "content": content, "source_description": "saved via MCP client",
    })
    return f"Remembered: {title}"


@mcp.tool()
async def list_projects() -> str:
    """List the most connected entities in Dev's knowledge graph — usually his projects
    and core concepts. Useful for orienting on what he works on."""
    data = await _get("/graph", {"limit": 40})
    nodes = sorted(data.get("nodes", []), key=lambda n: n.get("degree", 0), reverse=True)
    if not nodes:
        return "The graph is empty."
    return "Top entities in Dev's graph:\n" + "\n".join(
        f"- {n['name']} ({n.get('degree', 0)} connections)" for n in nodes[:20]
    )


@mcp.tool()
async def list_tasks(status: str = "open") -> str:
    """List Dev's tasks. status is 'open' (default) or 'done'."""
    data = await _get("/tasks", {"status": status})
    tasks = data.get("tasks", [])
    if not tasks:
        return f"No {status} tasks."
    return f"{status.title()} tasks:\n" + "\n".join(
        f"- [{t['priority']}/{t['category']}] {t['title']}" for t in tasks
    )


@mcp.tool()
async def add_task(title: str, category: str = "general", priority: str = "med") -> str:
    """Add a task to Dev's task list. category: general|study|career|project.
    priority: low|med|high."""
    await _post("/tasks", {"title": title, "category": category, "priority": priority})
    return f"Added task: {title}"


@mcp.tool()
async def recent_insights() -> str:
    """Get the AI-generated insights Nexus has surfaced from Dev's data — connections,
    opportunities, reminders it discovered on its own."""
    data = await _get("/insights")
    items = data.get("insights", [])
    if not items:
        return "No insights yet."
    return "Recent insights:\n" + "\n".join(
        f"- [{i['kind']}] {i['title']}: {i['body']}" for i in items[:8]
    )


if __name__ == "__main__":
    mcp.run()  # stdio transport — the MCP client spawns and speaks to this process
