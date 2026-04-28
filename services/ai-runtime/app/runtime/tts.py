from __future__ import annotations

import base64
import io
import math
import struct
import wave
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict

from app.core.settings import settings


@dataclass(frozen=True)
class TtsVoiceMetadata:
    id: str
    provider: str
    provider_voice_id: str
    name: str
    language: str
    style: str
    presentation_style: str
    status: str


@dataclass(frozen=True)
class TtsProviderMetadata:
    provider: str
    model: str | None = None


@dataclass(frozen=True)
class TtsProviderOutput:
    audio_bytes: bytes
    mime_type: str
    file_extension: str
    usage: Dict[str, Any]
    metadata: TtsProviderMetadata


class TtsProviderError(RuntimeError):
    pass


class TtsProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    async def generate_audio(
        self,
        text: str,
        voice: TtsVoiceMetadata,
        language: str
    ) -> TtsProviderOutput:
        pass


def _character_usage(text: str) -> Dict[str, Any]:
    return {
        "characters": len(text),
        "requests": 1,
        "estimated": False
    }


def _build_mock_wav(text: str) -> bytes:
    sample_rate = 16000
    duration_seconds = min(3.0, max(0.8, len(text) / 90))
    total_samples = int(sample_rate * duration_seconds)
    amplitude = 7200
    frequency = 440.0

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for index in range(total_samples):
            envelope = min(1.0, index / max(1, sample_rate * 0.08))
            sample = int(amplitude * envelope * math.sin(2 * math.pi * frequency * index / sample_rate))
            wav_file.writeframesraw(struct.pack("<h", sample))

    return buffer.getvalue()


class MockTtsProvider(TtsProvider):
    @property
    def name(self) -> str:
        return "MOCK"

    async def generate_audio(
        self,
        text: str,
        voice: TtsVoiceMetadata,
        language: str
    ) -> TtsProviderOutput:
        return TtsProviderOutput(
            audio_bytes=_build_mock_wav(text),
            mime_type="audio/wav",
            file_extension="wav",
            usage={
                **_character_usage(text),
                "provider": "MOCK",
                "mockFallbackUsed": True,
                "voiceId": voice.id,
                "language": language
            },
            metadata=TtsProviderMetadata(provider="MOCK", model="mock-wav-tone")
        )


class OpenAITtsProvider(TtsProvider):
    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    @property
    def name(self) -> str:
        return "OPENAI"

    async def generate_audio(
        self,
        text: str,
        voice: TtsVoiceMetadata,
        language: str
    ) -> TtsProviderOutput:
        try:
            from openai import AsyncOpenAI
        except ModuleNotFoundError as exc:
            raise TtsProviderError("openai dependency is unavailable") from exc

        if not self.api_key:
            raise TtsProviderError("openai api key is missing")

        client = AsyncOpenAI(api_key=self.api_key)
        response = await client.audio.speech.create(
            model=self.model,
            voice=voice.provider_voice_id,
            input=text,
            response_format="mp3"
        )
        audio_bytes = response.content
        return TtsProviderOutput(
            audio_bytes=audio_bytes,
            mime_type="audio/mpeg",
            file_extension="mp3",
            usage={
                **_character_usage(text),
                "provider": "OPENAI",
                "mockFallbackUsed": False,
                "voiceId": voice.id,
                "language": language
            },
            metadata=TtsProviderMetadata(provider="OPENAI", model=self.model)
        )


class ElevenLabsTtsProvider(TtsProvider):
    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    @property
    def name(self) -> str:
        return "ELEVENLABS"

    async def generate_audio(
        self,
        text: str,
        voice: TtsVoiceMetadata,
        language: str
    ) -> TtsProviderOutput:
        try:
            import httpx
        except ModuleNotFoundError as exc:
            raise TtsProviderError("httpx dependency is unavailable") from exc

        if not self.api_key:
            raise TtsProviderError("elevenlabs api key is missing")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice.provider_voice_id}",
                headers={
                    "xi-api-key": self.api_key,
                    "accept": "audio/mpeg",
                    "content-type": "application/json"
                },
                json={
                    "text": text,
                    "model_id": self.model
                }
            )

        if response.status_code >= 400:
            raise TtsProviderError(f"elevenlabs request failed with status {response.status_code}")

        return TtsProviderOutput(
            audio_bytes=response.content,
            mime_type="audio/mpeg",
            file_extension="mp3",
            usage={
                **_character_usage(text),
                "provider": "ELEVENLABS",
                "mockFallbackUsed": False,
                "voiceId": voice.id,
                "language": language
            },
            metadata=TtsProviderMetadata(provider="ELEVENLABS", model=self.model)
        )


class AzurePlaceholderTtsProvider(TtsProvider):
    @property
    def name(self) -> str:
        return "AZURE"

    async def generate_audio(
        self,
        text: str,
        voice: TtsVoiceMetadata,
        language: str
    ) -> TtsProviderOutput:
        raise TtsProviderError("azure tts provider is a placeholder in this phase")


def build_tts_provider() -> TtsProvider:
    provider_name = settings.ai_runtime_tts_provider.strip().upper()
    if provider_name == "OPENAI":
        return OpenAITtsProvider(
            api_key=settings.openai_api_key,
            model=settings.openai_tts_model
        )
    if provider_name == "ELEVENLABS":
        return ElevenLabsTtsProvider(
            api_key=settings.elevenlabs_api_key,
            model=settings.elevenlabs_tts_model
        )
    if provider_name == "AZURE":
        return AzurePlaceholderTtsProvider()

    return MockTtsProvider()


def encode_audio_base64(audio_bytes: bytes) -> str:
    return base64.b64encode(audio_bytes).decode("ascii")
