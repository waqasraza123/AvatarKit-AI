from __future__ import annotations

import io
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict

from app.core.settings import settings


@dataclass(frozen=True)
class SttAudioInput:
    audio_bytes: bytes
    mime_type: str
    file_name: str
    language: str | None = None
    duration_seconds: float | None = None


@dataclass(frozen=True)
class SttProviderMetadata:
    provider: str
    model: str | None = None
    raw: Dict[str, Any] | None = None


@dataclass(frozen=True)
class SttProviderOutput:
    transcript: str
    language: str | None
    confidence: float | None
    duration_seconds: float | None
    usage: Dict[str, Any]
    metadata: SttProviderMetadata


class SttProviderError(RuntimeError):
    pass


class SttProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    async def transcribe_audio(self, audio: SttAudioInput) -> SttProviderOutput:
        pass


def _usage(provider: str, duration_seconds: float | None, mock_fallback_used: bool) -> Dict[str, Any]:
    seconds = duration_seconds if duration_seconds is not None else 0.0
    return {
        "provider": provider,
        "requests": 1,
        "seconds": seconds,
        "durationSeconds": seconds,
        "durationEstimated": duration_seconds is None,
        "mockFallbackUsed": mock_fallback_used
    }


class MockSttProvider(SttProvider):
    @property
    def name(self) -> str:
        return "MOCK"

    async def transcribe_audio(self, audio: SttAudioInput) -> SttProviderOutput:
        transcript = settings.ai_runtime_mock_stt_transcript.strip()
        if not transcript:
            transcript = "How can you help my business?"

        return SttProviderOutput(
            transcript=transcript,
            language=audio.language or "en",
            confidence=0.98,
            duration_seconds=audio.duration_seconds,
            usage=_usage("MOCK", audio.duration_seconds, True),
            metadata=SttProviderMetadata(provider="MOCK", model="mock-transcript")
        )


class OpenAIWhisperSttProvider(SttProvider):
    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    @property
    def name(self) -> str:
        return "OPENAI_WHISPER"

    async def transcribe_audio(self, audio: SttAudioInput) -> SttProviderOutput:
        try:
            from openai import AsyncOpenAI
        except ModuleNotFoundError as exc:
            raise SttProviderError("openai dependency is unavailable") from exc

        if not self.api_key:
            raise SttProviderError("openai api key is missing")

        audio_file = io.BytesIO(audio.audio_bytes)
        audio_file.name = audio.file_name
        client = AsyncOpenAI(api_key=self.api_key)
        response = await client.audio.transcriptions.create(
            model=self.model,
            file=audio_file,
            response_format="verbose_json"
        )
        transcript = str(getattr(response, "text", "") or "").strip()
        language = getattr(response, "language", None)
        duration = getattr(response, "duration", None)
        resolved_duration = float(duration) if isinstance(duration, (int, float)) else audio.duration_seconds

        return SttProviderOutput(
            transcript=transcript,
            language=str(language) if language else audio.language,
            confidence=None,
            duration_seconds=resolved_duration,
            usage=_usage("OPENAI_WHISPER", resolved_duration, False),
            metadata=SttProviderMetadata(provider="OPENAI_WHISPER", model=self.model)
        )


class DeepgramSttProvider(SttProvider):
    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    @property
    def name(self) -> str:
        return "DEEPGRAM"

    async def transcribe_audio(self, audio: SttAudioInput) -> SttProviderOutput:
        try:
            import httpx
        except ModuleNotFoundError as exc:
            raise SttProviderError("httpx dependency is unavailable") from exc

        if not self.api_key:
            raise SttProviderError("deepgram api key is missing")

        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                "https://api.deepgram.com/v1/listen",
                params={
                    "model": self.model,
                    "smart_format": "true",
                    "detect_language": "true"
                },
                headers={
                    "authorization": f"Token {self.api_key}",
                    "content-type": audio.mime_type
                },
                content=audio.audio_bytes
            )

        if response.status_code >= 400:
            raise SttProviderError(f"deepgram request failed with status {response.status_code}")

        data = response.json()
        channel = data.get("results", {}).get("channels", [{}])[0]
        alternative = channel.get("alternatives", [{}])[0]
        transcript = str(alternative.get("transcript") or "").strip()
        confidence = alternative.get("confidence")
        metadata = data.get("metadata", {})
        duration = metadata.get("duration")
        languages = data.get("results", {}).get("languages", [])
        language_value = languages[0] if isinstance(languages, list) and languages else None
        language = language_value.get("language") if isinstance(language_value, dict) else language_value
        resolved_duration = float(duration) if isinstance(duration, (int, float)) else audio.duration_seconds

        return SttProviderOutput(
            transcript=transcript,
            language=str(language) if language else audio.language,
            confidence=float(confidence) if isinstance(confidence, (int, float)) else None,
            duration_seconds=resolved_duration,
            usage=_usage("DEEPGRAM", resolved_duration, False),
            metadata=SttProviderMetadata(provider="DEEPGRAM", model=self.model)
        )


def build_stt_provider() -> SttProvider:
    provider_name = settings.ai_runtime_stt_provider.strip().upper()
    if provider_name == "OPENAI_WHISPER":
        return OpenAIWhisperSttProvider(
            api_key=settings.openai_api_key,
            model=settings.openai_stt_model
        )
    if provider_name == "DEEPGRAM":
        return DeepgramSttProvider(
            api_key=settings.deepgram_api_key,
            model=settings.deepgram_stt_model
        )

    return MockSttProvider()
