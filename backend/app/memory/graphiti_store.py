"""Graphiti-backed MemoryStore. The ONLY file allowed to import graphiti_core.

Provider selection (settings.graph_provider):
  "gemini" — Google free tier (needs GEMINI_API_KEY)
  "ollama" — fully local + free (needs `ollama serve` with models pulled)
  "hybrid" — Ollama first, Gemini rescues failed extractions (best of both);
             embeddings ALWAYS stay local so the vector space is uniform
  "openai" — Graphiti's default, paid (needs OPENAI_API_KEY)
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

from graphiti_core import Graphiti
from graphiti_core.llm_client.client import LLMClient
from graphiti_core.nodes import EpisodeType
from graphiti_core.search.search_config_recipes import NODE_HYBRID_SEARCH_RRF

from app.config import settings
from app.memory.base import GraphLink, GraphNode, MemoryHit, Subgraph


class FallbackLLMClient(LLMClient):
    """The worker system: local brain first (free, unlimited), cloud brain rescues.

    Wraps two Graphiti LLM clients. Every extraction call tries Ollama; if the
    small local model fails (bad structured output, crash), the same call is
    retried once on Gemini. Quota is only spent on the hard cases.

    Subclasses LLMClient so Graphiti's GraphitiClients Pydantic model accepts it
    (it validates llm_client with is_instance_of(LLMClient)).
    """

    def __init__(self, primary, fallback) -> None:
        self._primary = primary
        self._fallback = fallback
        self.rescues = 0  # observability: how often the cloud had to step in
        # Reuse the primary's config so any config reads resolve to Ollama's.
        super().__init__(config=getattr(primary, "config", None))

    async def generate_response(self, *args, **kwargs):
        try:
            return await self._primary.generate_response(*args, **kwargs)
        except Exception as e:  # noqa: BLE001
            self.rescues += 1
            logger.warning(
                "local LLM failed (%s) — rescue #%d via Gemini", type(e).__name__, self.rescues
            )
            return await self._fallback.generate_response(*args, **kwargs)

    async def _generate_response(self, *args, **kwargs):
        # Required by the LLMClient ABC; generate_response above fully overrides
        # the public path, so this only runs if Graphiti calls the private method.
        return await self._primary._generate_response(*args, **kwargs)

    def __getattr__(self, name):
        # Anything else Graphiti asks for (caches, tokenizers…) comes from the primary.
        return getattr(self._primary, name)


def _build_graphiti() -> Graphiti:
    if settings.graph_provider == "gemini":
        from graphiti_core.cross_encoder.gemini_reranker_client import GeminiRerankerClient
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig
        from graphiti_core.llm_client.gemini_client import GeminiClient, LLMConfig

        api_key = settings.gemini_api_key
        return Graphiti(
            settings.neo4j_uri,
            settings.neo4j_user,
            settings.neo4j_password,
            llm_client=GeminiClient(
                config=LLMConfig(
                    api_key=api_key,
                    model=settings.gemini_model,
                    small_model=settings.gemini_small_model,
                )
            ),
            embedder=GeminiEmbedder(
                config=GeminiEmbedderConfig(
                    api_key=api_key,
                    embedding_model=settings.gemini_embedding_model,
                )
            ),
            cross_encoder=GeminiRerankerClient(
                config=LLMConfig(api_key=api_key, model=settings.gemini_small_model)
            ),
        )

    if settings.graph_provider in ("ollama", "hybrid"):
        from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
        from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
        from graphiti_core.llm_client.config import LLMConfig
        from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient

        llm_config = LLMConfig(
            api_key="ollama",
            model=settings.ollama_model,
            small_model=settings.ollama_model,
            base_url=settings.ollama_base_url,
        )
        ollama_client = OpenAIGenericClient(config=llm_config)
        llm_client = ollama_client

        if settings.graph_provider == "hybrid" and settings.gemini_api_key:
            from graphiti_core.llm_client.gemini_client import GeminiClient
            from graphiti_core.llm_client.gemini_client import LLMConfig as GeminiLLMConfig

            gemini_rescue = GeminiClient(
                config=GeminiLLMConfig(
                    api_key=settings.gemini_api_key,
                    model=settings.gemini_model,
                    small_model=settings.gemini_small_model,
                )
            )
            llm_client = FallbackLLMClient(primary=ollama_client, fallback=gemini_rescue)

        return Graphiti(
            settings.neo4j_uri,
            settings.neo4j_user,
            settings.neo4j_password,
            llm_client=llm_client,
            # Embedder is ALWAYS local in ollama/hybrid mode: one vector space.
            embedder=OpenAIEmbedder(
                config=OpenAIEmbedderConfig(
                    api_key="ollama",
                    embedding_model=settings.ollama_embedding_model,
                    embedding_dim=768,
                    base_url=settings.ollama_base_url,
                )
            ),
            cross_encoder=OpenAIRerankerClient(client=ollama_client, config=llm_config),
        )

    # "openai" — Graphiti defaults
    return Graphiti(settings.neo4j_uri, settings.neo4j_user, settings.neo4j_password)


class GraphitiMemoryStore:
    def __init__(self) -> None:
        self._graphiti = _build_graphiti()

    async def initialize(self) -> None:
        await self._graphiti.build_indices_and_constraints()

    async def close(self) -> None:
        await self._graphiti.close()

    async def add_episode(
        self,
        name: str,
        content: str,
        source_description: str,
        reference_time: datetime | None = None,
        is_json: bool = False,
    ) -> None:
        await self._graphiti.add_episode(
            name=name,
            episode_body=content,
            source=EpisodeType.json if is_json else EpisodeType.text,
            source_description=source_description,
            reference_time=reference_time or datetime.now(timezone.utc),
        )

    async def search(
        self,
        query: str,
        center_node_uuid: str | None = None,
        limit: int = 10,
    ) -> list[MemoryHit]:
        results = await self._graphiti.search(
            query, center_node_uuid=center_node_uuid, num_results=limit
        )
        return [
            MemoryHit(
                uuid=r.uuid,
                fact=r.fact,
                source_node_uuid=getattr(r, "source_node_uuid", None),
                valid_at=getattr(r, "valid_at", None),
                invalid_at=getattr(r, "invalid_at", None),
            )
            for r in results
        ]

    async def get_subgraph(self, limit: int = 300) -> Subgraph:
        """Read entities + RELATES_TO edges straight from Neo4j (via Graphiti's driver).

        Read-only Cypher for visualization only — all writes still go through
        Graphiti's pipeline, so this doesn't violate the adapter boundary.
        """
        node_records, _, _ = await self._graphiti.driver.execute_query(
            "MATCH (n:Entity) "
            "OPTIONAL MATCH (n)-[r:RELATES_TO]-() "
            "WITH n, count(r) AS degree "
            "RETURN n.uuid AS uuid, n.name AS name, coalesce(n.summary,'') AS summary, "
            "labels(n) AS labels, degree "
            "ORDER BY degree DESC LIMIT $limit",
            limit=limit,
        )
        nodes = [
            GraphNode(
                uuid=r["uuid"],
                name=r["name"],
                summary=r["summary"],
                labels=list(r["labels"]),
                attributes={"degree": r["degree"]},
            )
            for r in node_records
        ]
        ids = {n.uuid for n in nodes}

        link_records, _, _ = await self._graphiti.driver.execute_query(
            "MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity) "
            "RETURN a.uuid AS source, b.uuid AS target, "
            "coalesce(r.fact,'') AS fact, coalesce(r.name,'') AS name "
            "LIMIT $limit",
            limit=limit * 4,
        )
        links = [
            GraphLink(
                source=r["source"], target=r["target"], fact=r["fact"], name=r["name"]
            )
            for r in link_records
            if r["source"] in ids and r["target"] in ids
        ]
        return Subgraph(nodes=nodes, links=links)

    async def list_episodes(self, limit: int = 100) -> list[dict]:
        records, _, _ = await self._graphiti.driver.execute_query(
            "MATCH (e:Episodic) "
            "RETURN e.uuid AS uuid, e.name AS name, "
            "coalesce(e.source_description,'') AS source, toString(e.created_at) AS created_at "
            "ORDER BY e.created_at DESC LIMIT $limit",
            limit=limit,
        )
        return [
            {"uuid": r["uuid"], "name": r["name"], "source": r["source"], "created_at": r["created_at"]}
            for r in records
        ]

    async def forget_episode(self, uuid: str) -> bool:
        try:
            await self._graphiti.remove_episode(uuid)  # removes episode + its extracted edges
            return True
        except AttributeError:
            # Older graphiti without remove_episode: detach-delete the episode node.
            await self._graphiti.driver.execute_query(
                "MATCH (e:Episodic {uuid: $uuid}) DETACH DELETE e", uuid=uuid
            )
            return True

    async def counts(self) -> dict:
        records, _, _ = await self._graphiti.driver.execute_query(
            "OPTIONAL MATCH (n:Entity) WITH count(n) AS nodes "
            "OPTIONAL MATCH ()-[r:RELATES_TO]->() RETURN nodes, count(r) AS edges"
        )
        row = records[0] if records else {"nodes": 0, "edges": 0}
        return {"nodes": row["nodes"], "edges": row["edges"]}

    async def search_nodes(self, query: str, limit: int = 10) -> list[GraphNode]:
        config = NODE_HYBRID_SEARCH_RRF.model_copy(deep=True)
        config.limit = limit
        results = await self._graphiti._search(query=query, config=config)
        return [
            GraphNode(
                uuid=n.uuid,
                name=n.name,
                summary=n.summary or "",
                labels=list(n.labels or []),
                created_at=n.created_at,
                attributes=dict(getattr(n, "attributes", {}) or {}),
            )
            for n in results.nodes
        ]
