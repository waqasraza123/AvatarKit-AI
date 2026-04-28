from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Tuple


@dataclass(frozen=True)
class SafetyDecision:
    allowed: bool
    intent: str
    confidence: float
    handoff_requested: bool
    reason: str | None = None


SENSITIVE_KEYWORDS = (
    "medical",
    "diagnose",
    "prescribe",
    "surgery",
    "legal",
    "contract",
    "lawsuit",
    "tax",
    "investment",
    "stock",
    "bankruptcy",
    "loan",
    "scam",
    "violence",
    "weapon",
    "hack"
)


def _normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9\\s]", " ", value.lower())


def _contains_any(value: str, terms: Iterable[str]) -> bool:
    return any(f" {term} " in value or value.startswith(f"{term} ") or value.endswith(f" {term}") or value == term for term in terms)


def infer_intent(value: str, has_knowledge: bool, has_context_match: bool) -> str:
    normalized = _normalize(value)
    if any(token in normalized for token in ("hello", "hi", "hey", "thank")):
        return "greeting"
    if has_context_match:
        return "knowledge_lookup"
    if has_knowledge:
        return "assistance"
    return "fallback"


def assess_request_safety(text: str) -> SafetyDecision:
    normalized = _normalize(text)

    sensitive = _contains_any(normalized, SENSITIVE_KEYWORDS)
    if sensitive:
        return SafetyDecision(
            allowed=False,
            intent="safety_review",
            confidence=0.96,
            handoff_requested=True,
            reason="Request appears out of scope for definitive guidance."
        )

    return SafetyDecision(
        allowed=True,
        intent="assistant_response",
        confidence=0.9,
        handoff_requested=False
    )


def assess_context_match(input_text: str, knowledge_chunks: Iterable[dict[str, object]]) -> Tuple[int, int]:
    normalized_words = {
        token
        for token in _normalize(input_text).split()
        if len(token) > 2
    }

    match_count = 0
    matched_chunks = 0
    for chunk in knowledge_chunks:
        content = str(chunk.get("content", "")).lower()
        score = sum(1 for token in normalized_words if token and token in content)
        if score > 0:
            matched_chunks += 1
            match_count += score

    return match_count, matched_chunks
