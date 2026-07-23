"""Central settings. Everything configurable lives here, loaded from .env."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives at the repo root (one level above backend/), not the uvicorn cwd.
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    # Databases
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "neuralnexus"
    database_url: str = "postgresql+asyncpg://nexus:neuralnexus@localhost:5432/nexus"

    # Provider keys (LiteLLM reads most of these from the environment itself;
    # declared here so .env is the single source of truth)
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None
    groq_api_key: str | None = None
    openrouter_api_key: str | None = None

    # Graph engine (Graphiti) LLM provider: "gemini" (free tier), "ollama" (local,
    # free), or "openai" (paid). Powers entity extraction + embeddings.
    graph_provider: str = "gemini"
    gemini_model: str = "gemini-2.5-flash"
    gemini_small_model: str = "gemini-2.5-flash-lite"
    gemini_embedding_model: str = "gemini-embedding-001"
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "llama3.1:8b"
    ollama_embedding_model: str = "nomic-embed-text"

    # AI Router: task type -> LiteLLM model string (defaults are all free)
    model_code: str = "gemini/gemini-2.5-flash"
    model_research: str = "gemini/gemini-2.5-flash"
    model_general: str = "gemini/gemini-2.5-flash"
    model_offline: str = "ollama/llama3.1:8b"


settings = Settings()

# Export provider keys so libraries that read os.environ (LiteLLM, Graphiti) see them.
import os  # noqa: E402

for _env, _val in {
    "OPENAI_API_KEY": settings.openai_api_key,
    "ANTHROPIC_API_KEY": settings.anthropic_api_key,
    "GEMINI_API_KEY": settings.gemini_api_key,
    "GOOGLE_API_KEY": settings.gemini_api_key,  # Graphiti's Gemini client reads this name
    "GROQ_API_KEY": settings.groq_api_key,
    "OPENROUTER_API_KEY": settings.openrouter_api_key,
}.items():
    if _val and not os.environ.get(_env):
        os.environ[_env] = _val
