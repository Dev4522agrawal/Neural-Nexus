# Neural Nexus MCP server

Exposes your second brain to any MCP-compatible AI client — Claude Desktop, Claude
Code, Cursor. Once connected, those tools can search your memory, save notes, browse
your projects, and manage tasks *while you work in them*, without opening the Nexus UI.

It's a thin client over the Nexus API, so **the backend must be running**
(`./scripts/start.sh`). Nothing here touches the databases directly.

## Tools it provides

| Tool | What it does |
|---|---|
| `search_memory` | Search your knowledge graph for relevant facts |
| `remember` | Save a new note/decision/idea into the graph |
| `list_projects` | Your most-connected entities (usually projects) |
| `list_tasks` / `add_task` | Read and add tasks |
| `recent_insights` | The discoveries Nexus surfaced on its own |

## Setup (one time)

Install deps into the backend venv (it already has httpx):

```bash
cd mcp_server
../backend/.venv/bin/pip install -r requirements.txt   # or: pip install mcp httpx
```

### Claude Desktop / Claude Code

Add to your MCP config (Claude Desktop: Settings → Developer → Edit Config;
Claude Code: `claude mcp add`). Example config entry:

```json
{
  "mcpServers": {
    "neural-nexus": {
      "command": "/ABSOLUTE/PATH/backend/.venv/bin/python",
      "args": ["/ABSOLUTE/PATH/mcp_server/nexus_mcp.py"],
      "env": { "NEXUS_API_URL": "http://localhost:8000" }
    }
  }
}
```

Replace `/ABSOLUTE/PATH` with the full path to this project. Restart the client;
you'll see the neural-nexus tools available. Try: *"search my memory for Gesture Lab."*

## Test standalone

```bash
NEXUS_API_URL=http://localhost:8000 python nexus_mcp.py
# then speak MCP over stdio — or just let a client launch it.
```
