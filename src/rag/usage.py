from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Iterable, Optional

from langchain_core.messages import AIMessage

# Every ChatOpenAI call in the live /query path currently uses this one
# model (see GENERATION_MODEL/QUERY_REWRITE_MODEL/KHOAN_SELECT_MODEL/
# RELEVANCE_MODEL — all "gpt-4o-mini"). Prices are USD per 1M tokens, current
# as of this writing — update these two dicts if OpenAI repriced the model;
# nothing else in the usage-tracking path needs to change. A model missing
# from these dicts prices at $0 rather than raising, so an unrecognized
# model still shows accurate token counts even if the cost column is 0.
PRICE_PER_1M_INPUT_TOKENS: dict[str, float] = {"gpt-4o-mini": 0.15}
PRICE_PER_1M_OUTPUT_TOKENS: dict[str, float] = {"gpt-4o-mini": 0.60}


@dataclass
class UsageEvent:
    stage: str
    model: str
    prompt_tokens: int
    completion_tokens: int

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    @property
    def cost_usd(self) -> float:
        input_price = PRICE_PER_1M_INPUT_TOKENS.get(self.model, 0.0)
        output_price = PRICE_PER_1M_OUTPUT_TOKENS.get(self.model, 0.0)
        return (self.prompt_tokens / 1_000_000) * input_price + (self.completion_tokens / 1_000_000) * output_price


# ContextVar rather than a threaded-through parameter: the call graph here
# is several modules deep (generate -> query_rewrite/subchunk/supersession),
# some of it behind @lru_cache (rewrite_query) where adding a tracker
# parameter would also have to become part of the cache key or be excluded
# from it awkwardly. None set (the default) means "not tracking" — every
# recorder below is then a silent no-op, so this stays opt-in and callers
# outside a request (ingestion scripts, ad-hoc REPL use) are unaffected.
_current: ContextVar[Optional[list[UsageEvent]]] = ContextVar("_rag_usage_events", default=None)


def start_tracking() -> None:
    _current.set([])


def stop_tracking() -> list[UsageEvent]:
    events = _current.get() or []
    _current.set(None)
    return events


def _record(stage: str, model: str, usage: Optional[dict]) -> None:
    events = _current.get()
    if events is None or not usage:
        return
    prompt = usage.get("input_tokens") or usage.get("prompt_tokens") or 0
    completion = usage.get("output_tokens") or usage.get("completion_tokens") or 0
    if prompt == 0 and completion == 0:
        return
    events.append(UsageEvent(stage=stage, model=model, prompt_tokens=prompt, completion_tokens=completion))


def record_response(stage: str, model: str, response: object) -> None:
    """Record usage from a single LLM response (an AIMessage-like object
    carrying `.usage_metadata`, as every langchain_openai.ChatOpenAI
    response does)."""
    _record(stage, model, getattr(response, "usage_metadata", None))


def record_messages(stage: str, model: str, messages: Iterable[object]) -> None:
    """Record usage summed across every AIMessage in a transcript — the
    ReAct tool-calling loop (langgraph's create_react_agent) makes one model
    call per round, and each round's AIMessage carries its own
    usage_metadata; this captures the whole loop in one call."""
    for m in messages:
        if isinstance(m, AIMessage):
            record_response(stage, model, m)
