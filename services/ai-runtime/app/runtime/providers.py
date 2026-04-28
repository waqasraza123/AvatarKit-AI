from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Tuple

from app.core.settings import settings


@dataclass(frozen=True)
class ProviderOutput:
    answer: str
    usage: Dict[str, Any]


class RuntimeProviderError(RuntimeError):
    pass


class RuntimeProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    async def answer_question(
        self,
        prompt: str,
        context: str,
        profile_summary: str,
        fallback_message: str
    ) -> ProviderOutput:
        pass


class MockProvider(RuntimeProvider):
    @property
    def name(self) -> str:
        return "MOCK"

    async def answer_question(
        self,
        prompt: str,
        context: str,
        profile_summary: str,
        fallback_message: str
    ) -> ProviderOutput:
        normalized_prompt = prompt.lower().strip()
        normalized_context = context.lower()
        if not normalized_context:
            answer = (
                f"I can’t find an exact match in your shared knowledge base for “{prompt}”. "
                f"{fallback_message}"
            )
            return ProviderOutput(
                answer=answer,
                usage={
                    "provider": "MOCK",
                    "mockFallbackUsed": True,
                    "reason": "missing_knowledge"
                }
            )

        if "how" in normalized_prompt and "help" in normalized_prompt:
            answer = (
                "Based on your configured profile and stored knowledge, here is the best-fit response: "
                f"{normalized_context[:240]}..."
            )
        else:
            answer = (
                "Thanks for the question. I’m using your configured knowledge to answer with a concise, "
                "business-safe response."
            )

        return ProviderOutput(
            answer=(
                f"{answer} I will stay within the provided context and avoid definitive legal, medical, or "
                f"financial advice."
            ),
            usage={
                "provider": "MOCK",
                "mockFallbackUsed": True
            }
        )


class OpenAIProvider(RuntimeProvider):
    @property
    def name(self) -> str:
        return "OPENAI"

    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    async def answer_question(
        self,
        prompt: str,
        context: str,
        profile_summary: str,
        fallback_message: str
    ) -> ProviderOutput:
        try:
            from openai import AsyncOpenAI
        except ModuleNotFoundError as exc:
            raise RuntimeProviderError("openai dependency is unavailable") from exc

        if not self.api_key:
            raise RuntimeProviderError("openai api key is missing")

        client = AsyncOpenAI(api_key=self.api_key)
        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a strict business assistant for the configured avatar profile. "
                        "Use only the provided context. If knowledge is missing, respond with a safe fallback."
                    )
                },
                {
                    "role": "system",
                    "content": profile_summary
                },
                {
                    "role": "system",
                    "content": f"Fallback message: {fallback_message}"
                },
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {prompt}"}
            ],
            temperature=0.2
        )

        answer = (response.choices[0].message.content or "").strip()
        usage = response.usage
        if not answer:
            answer = fallback_message

        usage_payload: Dict[str, Any] = {
            "provider": "OPENAI",
            "mockFallbackUsed": False
        }
        if usage is not None:
            usage_payload["tokens"] = {
                "promptTokens": usage.prompt_tokens,
                "completionTokens": usage.completion_tokens,
                "totalTokens": usage.total_tokens
            }

        return ProviderOutput(answer=answer, usage=usage_payload)


class AnthropicProvider(RuntimeProvider):
    @property
    def name(self) -> str:
        return "ANTHROPIC"

    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    async def answer_question(
        self,
        prompt: str,
        context: str,
        profile_summary: str,
        fallback_message: str
    ) -> ProviderOutput:
        try:
            from anthropic import AsyncAnthropic
        except ModuleNotFoundError as exc:
            raise RuntimeProviderError("anthropic dependency is unavailable") from exc

        if not self.api_key:
            raise RuntimeProviderError("anthropic api key is missing")

        client = AsyncAnthropic(api_key=self.api_key)
        message = await client.messages.create(
            model=self.model,
            system=(
                "You are a strict business assistant for the configured avatar profile. "
                "Use only the provided context. If knowledge is missing, respond with a safe fallback."
            ),
            max_tokens=500,
            messages=[
                {"role": "user", "content": f"{profile_summary}\n\nFallback message: {fallback_message}"},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion:\n{prompt}"}
            ]
        )

        answer = (
            message.content[0].text
            if message.content and hasattr(message.content[0], "text")
            else fallback_message
        )
        return ProviderOutput(
            answer=answer.strip(),
            usage={
                "provider": "ANTHROPIC",
                "mockFallbackUsed": False
            }
        )


def build_runtime_provider() -> Tuple[RuntimeProvider, str]:
    provider_name = settings.ai_runtime_provider.strip().upper()
    if provider_name == "OPENAI":
        return (
            OpenAIProvider(api_key=settings.openai_api_key, model=settings.openai_model),
            "OPENAI"
        )
    if provider_name == "ANTHROPIC":
        return (
            AnthropicProvider(api_key=settings.anthropic_api_key, model=settings.anthropic_model),
            "ANTHROPIC"
        )

    if provider_name == "MOCK":
        return (MockProvider(), "MOCK")

    return (MockProvider(), "MOCK")
