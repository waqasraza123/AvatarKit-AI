from __future__ import annotations

import re
from typing import Any, Iterable, Literal, Tuple

from pydantic import BaseModel, Field


SafetySeverity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
SafetyAction = Literal["ALLOW", "WARN", "REWRITE", "REFUSE", "HANDOFF", "BLOCK", "SUSPEND_AVATAR"]
SafetyEventType = Literal[
    "unsafe_user_input",
    "unsafe_avatar_instruction",
    "unsupported_medical_request",
    "unsupported_legal_request",
    "unsupported_financial_request",
    "impersonation_risk",
    "public_figure_risk",
    "fake_endorsement_risk",
    "abusive_message",
    "prompt_injection_attempt",
    "generated_answer_blocked",
    "generated_answer_rewritten",
    "handoff_forced",
    "lead_input_flagged",
    "consent_required",
    "avatar_suspended",
]


class SafetyResult(BaseModel):
    allowed: bool
    severity: SafetySeverity
    action: SafetyAction
    reason: str
    fallbackAnswer: str | None = None
    handoffRequired: bool
    eventType: SafetyEventType
    metadata: dict[str, Any] = Field(default_factory=dict)


class SafetyDecision(BaseModel):
    allowed: bool
    intent: str
    confidence: float
    handoff_requested: bool
    reason: str | None = None
    result: SafetyResult | None = None


def _normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9\\s]", " ", value.lower())


def _contains_any(value: str, terms: Iterable[str]) -> bool:
    return any(f" {term} " in value or value.startswith(f"{term} ") or value.endswith(f" {term}") or value == term for term in terms)


def _result(
    event_type: SafetyEventType,
    severity: SafetySeverity,
    action: SafetyAction,
    reason: str,
    allowed: bool,
    handoff_required: bool,
    fallback_answer: str | None = None,
    metadata: dict[str, Any] | None = None
) -> SafetyResult:
    return SafetyResult(
        allowed=allowed,
        severity=severity,
        action=action,
        reason=reason,
        fallbackAnswer=fallback_answer,
        handoffRequired=handoff_required,
        eventType=event_type,
        metadata=metadata or {},
    )


def infer_intent(value: str, has_knowledge: bool, has_context_match: bool) -> str:
    normalized = _normalize(value)
    if any(token in normalized for token in ("hello", "hi", "hey", "thank")):
        return "greeting"
    if has_context_match:
        return "knowledge_lookup"
    if has_knowledge:
        return "assistance"
    return "fallback"


def assess_user_message_safety(text: str) -> SafetyResult | None:
    normalized = _normalize(text)

    rules: list[tuple[SafetyEventType, SafetySeverity, SafetyAction, bool, str, tuple[str, ...]]] = [
        (
            "prompt_injection_attempt",
            "HIGH",
            "REFUSE",
            False,
            "Prompt injection attempt detected.",
            (
                "ignore previous instructions",
                "ignore all previous instructions",
                "reveal system prompt",
                "show system prompt",
                "developer message",
                "disregard rules",
                "jailbreak",
            ),
        ),
        (
            "unsupported_medical_request",
            "HIGH",
            "HANDOFF",
            True,
            "Unsupported medical diagnosis or treatment request.",
            (
                "diagnose",
                "diagnosis",
                "treatment plan",
                "prescribe",
                "medical advice",
                "what medicine should i take",
                "symptoms mean",
            ),
        ),
        (
            "unsupported_legal_request",
            "HIGH",
            "HANDOFF",
            True,
            "Unsupported legal conclusion or contract advice request.",
            (
                "legal advice",
                "contract advice",
                "legal conclusion",
                "should i sue",
                "will i win my case",
                "is this contract valid",
            ),
        ),
        (
            "unsupported_financial_request",
            "HIGH",
            "HANDOFF",
            True,
            "Unsupported financial advice or guaranteed return request.",
            (
                "guaranteed return",
                "guaranteed returns",
                "investment advice",
                "financial advice",
                "what stock should i buy",
                "risk free profit",
                "double my money",
            ),
        ),
        (
            "fake_endorsement_risk",
            "HIGH",
            "REFUSE",
            False,
            "Fake endorsement or testimonial request detected.",
            (
                "fake testimonial",
                "fake endorsement",
                "celebrity endorses",
                "claim a celebrity",
                "make up a review",
            ),
        ),
        (
            "public_figure_risk",
            "HIGH",
            "REFUSE",
            False,
            "Public figure identity risk detected.",
            (
                "pretend to be a celebrity",
                "pretend you are a celebrity",
                "act as elon musk",
                "act as taylor swift",
                "act as the president",
                "public figure",
            ),
        ),
        (
            "impersonation_risk",
            "HIGH",
            "REFUSE",
            False,
            "Impersonation or deceptive identity request detected.",
            (
                "pretend you are a real human",
                "pretend to be a real human",
                "say you are a real person",
                "hide that you are ai",
                "do not disclose you are ai",
                "impersonate",
            ),
        ),
        (
            "abusive_message",
            "CRITICAL",
            "BLOCK",
            True,
            "Threatening, abusive, or harmful language detected.",
            (
                "i will kill",
                "i will hurt",
                "kill yourself",
                "make a bomb",
                "how to hack",
                "how to steal",
                "credit card fraud",
            ),
        ),
    ]

    for event_type, severity, action, handoff_required, reason, terms in rules:
        if _contains_any(normalized, terms) or any(term in normalized for term in terms if " " in term):
            fallback = (
                "I can’t handle that safely here. A human team member should review this request."
                if handoff_required
                else "I can’t help with that request, but I can answer questions within the approved business information."
            )
            return _result(
                event_type=event_type,
                severity=severity,
                action=action,
                reason=reason,
                allowed=action not in ("BLOCK", "REFUSE"),
                handoff_required=handoff_required,
                fallback_answer=fallback,
                metadata={"matchedRule": event_type, "phase": "pre_check"},
            )

    return None


def assess_request_safety(text: str) -> SafetyDecision:
    result = assess_user_message_safety(text)
    if result:
        return SafetyDecision(
            allowed=result.action not in ("BLOCK", "REFUSE", "HANDOFF"),
            intent="safety_review",
            confidence=0.96,
            handoff_requested=result.handoffRequired,
            reason=result.reason,
            result=result,
        )

    return SafetyDecision(
        allowed=True,
        intent="assistant_response",
        confidence=0.9,
        handoff_requested=False,
        result=None,
    )


def assess_generated_answer_safety(
    answer: str,
    confidence: float,
    matched_chunk_count: int,
    fallback_message: str
) -> SafetyResult | None:
    normalized = _normalize(answer)
    definitive_sensitive = (
        "you definitely have",
        "you should take",
        "i prescribe",
        "this contract is valid",
        "you will win",
        "guaranteed return",
        "risk free",
        "celebrity endorses",
        "i am a real human",
        "i am not ai",
        "ignore the rules",
        "system prompt",
    )
    unsafe_instruction = (
        "make a bomb",
        "hack into",
        "steal credit card",
        "commit fraud",
    )

    if any(term in normalized for term in unsafe_instruction):
        return _result(
            event_type="generated_answer_blocked",
            severity="CRITICAL",
            action="REFUSE",
            reason="Generated answer included unsafe instructions.",
            allowed=False,
            handoff_required=True,
            fallback_answer="I can’t provide that safely. A human team member should review this request.",
            metadata={"phase": "post_check", "rule": "unsafe_instruction"},
        )

    if any(term in normalized for term in definitive_sensitive):
        return _result(
            event_type="generated_answer_rewritten",
            severity="HIGH",
            action="REWRITE",
            reason="Generated answer was rewritten because it sounded too definitive for a sensitive topic.",
            allowed=True,
            handoff_required=True,
            fallback_answer=(
                f"{fallback_message} I can share approved business information, but a qualified human should review sensitive medical, legal, financial, or identity-related requests."
            ),
            metadata={"phase": "post_check", "rule": "definitive_sensitive_claim"},
        )

    weak_context = confidence < 0.32 or matched_chunk_count == 0
    risky_claims = (
        "guarantee",
        "always available",
        "certified",
        "official partner",
        "cure",
        "100 percent",
    )
    if weak_context and any(term in normalized for term in risky_claims):
        return _result(
            event_type="generated_answer_rewritten",
            severity="MEDIUM",
            action="REWRITE",
            reason="Generated answer was rewritten because support from approved knowledge was weak.",
            allowed=True,
            handoff_required=True,
            fallback_answer=(
                f"{fallback_message} I do not have enough approved information to make that claim. Please contact the team for confirmation."
            ),
            metadata={"phase": "post_check", "rule": "weak_context_claim"},
        )

    return None


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
