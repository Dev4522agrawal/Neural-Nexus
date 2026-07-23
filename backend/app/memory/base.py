"""MemoryStore: the abstract boundary around the memory engine.

Everything in Neural Nexus talks to memory through this interface.
Graphiti is the V1 implementation; if it's ever replaced, only the
adapter changes — nothing else in the system may import graphiti_core.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol


@dataclass
class MemoryHit:
    """A retrieved fact (graph edge) from hybrid search."""

    uuid: str
    fact: str
    source_node_uuid: str | None = None
    valid_at: datetime | None = None
    invalid_at: datetime | None = None


@dataclass
class GraphNode:
    uuid: str
    name: str
    summary: str = ""
    labels: list[str] = field(default_factory=list)
    created_at: datetime | None = None
    attributes: dict[str, Any] = field(default_factory=dict)


@dataclass
class GraphLink:
    source: str
    target: str
    fact: str = ""
    name: str = ""


@dataclass
class Subgraph:
    nodes: list[GraphNode] = field(default_factory=list)
    links: list[GraphLink] = field(default_factory=list)


class MemoryStore(Protocol):
    async def initialize(self) -> None:
        """Set up indices/constraints. Called once at startup."""
        ...

    async def close(self) -> None: ...

    async def add_episode(
        self,
        name: str,
        content: str,
        source_description: str,
        reference_time: datetime | None = None,
        is_json: bool = False,
    ) -> None:
        """Ingest one unit of information; engine extracts entities + edges."""
        ...

    async def search(
        self,
        query: str,
        center_node_uuid: str | None = None,
        limit: int = 10,
    ) -> list[MemoryHit]:
        """Hybrid semantic + keyword search over facts (edges)."""
        ...

    async def search_nodes(self, query: str, limit: int = 10) -> list[GraphNode]:
        """Search entities (nodes) directly."""
        ...

    async def get_subgraph(self, limit: int = 300) -> Subgraph:
        """Entities + relationships for the graph explorer UI."""
        ...

    async def list_episodes(self, limit: int = 100) -> list[dict]:
        """Raw memories (episodes) newest-first, for the manage/forget UI."""
        ...

    async def forget_episode(self, uuid: str) -> bool:
        """Remove an episode and its extracted knowledge from the graph."""
        ...

    async def counts(self) -> dict:
        """Total node/edge counts for the stats endpoint."""
        ...
