"""AI Router: picks the model for a task type. Manual override always wins.

V1 is rule-based. V2: LLM-classified task types, task splitting + merge.
All completions go through LiteLLM, so providers are interchangeable.
"""

from typing import Any

import litellm

from app.config import settings

TASK_ROUTES: dict[str, str] = {
    "code": settings.model_code,
    "research": settings.model_research,
    "general": settings.model_general,
    "offline": settings.model_offline,
}

_KEYWORDS: dict[str, tuple[str, ...]] = {
    "code": ("code", "bug", "function", "implement", "refactor", "error", "debug", "api"),
    "research": ("paper", "research", "compare", "explain", "summarize", "study"),
}


def classify_task(prompt: str) -> str:
    """Cheap heuristic classification. Replace with LLM classifier in V2."""
    lowered = prompt.lower()
    for task, words in _KEYWORDS.items():
        if any(w in lowered for w in words):
            return task
    return "general"


def resolve_model(prompt: str, task: str | None = None, model_override: str | None = None) -> tuple[str, str]:
    """Returns (task_type, model). Precedence: explicit model > explicit task > classified."""
    if model_override:
        return (task or "manual", model_override)
    task = task or classify_task(prompt)
    return (task, TASK_ROUTES.get(task, settings.model_general))


def _looks_like_outage(exc: Exception) -> bool:
    text = f"{type(exc).__name__}: {exc}".lower()
    return any(s in text for s in ("ratelimit", "429", "503", "quota", "overloaded", "unavailable"))


async def complete(
    messages: list[dict[str, Any]],
    task: str | None = None,
    model_override: str | None = None,
    **kwargs: Any,
):
    """Route to the best model; if the cloud is out (quota/outage), the local
    night-shift model answers instead and says so. Chat never goes dark."""
    prompt = messages[-1]["content"] if messages else ""
    task_type, model = resolve_model(prompt, task=task, model_override=model_override)
    try:
        response = await litellm.acompletion(model=model, messages=messages, **kwargs)
        return {
            "task": task_type,
            "model": model,
            "content": response.choices[0].message.content,
            "notice": None,
        }
    except Exception as e:  # noqa: BLE001
        offline = settings.model_offline
        if model == offline or not _looks_like_outage(e):
            raise
        response = await litellm.acompletion(model=offline, messages=messages, **kwargs)
        return {
            "task": task_type,
            "model": offline,
            "content": response.choices[0].message.content,
            "notice": (
                "night shift: the cloud model is unavailable "
                f"({type(e).__name__}) — answered by the local model instead"
            ),
        }
