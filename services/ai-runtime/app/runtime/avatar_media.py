from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Literal

from app.core.settings import settings


AvatarMediaStatus = Literal["completed", "processing", "failed"]


@dataclass(frozen=True)
class AvatarPhotoReference:
    asset_id: str
    url: str
    mime_type: str
    width: int
    height: int


@dataclass(frozen=True)
class AvatarVoiceReference:
    id: str
    provider: str
    provider_voice_id: str
    name: str
    language: str
    style: str
    presentation_style: str
    status: str


@dataclass(frozen=True)
class AvatarAudioReference:
    audio_base64: str | None
    mime_type: str | None
    file_extension: str | None
    url: str | None
    provider: str | None


@dataclass(frozen=True)
class AvatarMediaInput:
    workspace_id: str
    avatar_id: str
    conversation_id: str
    message_id: str
    photo: AvatarPhotoReference
    text: str
    language: str
    voice: AvatarVoiceReference | None
    audio: AvatarAudioReference | None


@dataclass(frozen=True)
class AvatarMediaOutput:
    status: AvatarMediaStatus
    provider_job_id: str | None = None
    video_url: str | None = None
    video_base64: str | None = None
    mime_type: str | None = None
    file_extension: str | None = None
    duration_seconds: float | None = None
    usage: Dict[str, Any] | None = None
    metadata: Dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None


class AvatarMediaProviderError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class AvatarMediaProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    async def generate_video(self, payload: AvatarMediaInput) -> AvatarMediaOutput:
        pass

    async def get_generation_status(self, provider_job_id: str) -> AvatarMediaOutput:
        raise AvatarMediaProviderError(
            "status_unavailable",
            "Provider status lookup is unavailable."
        )


class MockAvatarMediaProvider(AvatarMediaProvider):
    @property
    def name(self) -> str:
        return "MOCK"

    async def generate_video(self, payload: AvatarMediaInput) -> AvatarMediaOutput:
        video_url = settings.ai_runtime_mock_avatar_video_url.strip()
        if not video_url:
            raise AvatarMediaProviderError(
                "mock_video_url_missing",
                "Configure AI_RUNTIME_MOCK_AVATAR_VIDEO_URL to return a local mock video URL."
            )

        return AvatarMediaOutput(
            status="completed",
            video_url=video_url,
            duration_seconds=3.0,
            usage={
                "requests": 1,
                "seconds": 3.0,
                "provider": "MOCK",
                "mockFallbackUsed": True
            },
            metadata={
                "sourcePhotoAssetId": payload.photo.asset_id,
                "voiceId": payload.voice.id if payload.voice else None
            }
        )


class DidAvatarMediaProvider(AvatarMediaProvider):
    def __init__(self, api_key: str, base_url: str, poll_attempts: int) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.poll_attempts = max(1, poll_attempts)

    @property
    def name(self) -> str:
        return "DID"

    async def generate_video(self, payload: AvatarMediaInput) -> AvatarMediaOutput:
        if not self.api_key:
            raise AvatarMediaProviderError(
                "provider_not_configured",
                "D-ID API key is missing."
            )

        try:
            import httpx
        except ModuleNotFoundError as exc:
            raise AvatarMediaProviderError(
                "dependency_missing",
                "httpx dependency is unavailable."
            ) from exc

        script: Dict[str, Any]
        if payload.audio and payload.audio.url:
            script = {
                "type": "audio",
                "audio_url": payload.audio.url
            }
        else:
            script = {
                "type": "text",
                "input": payload.text
            }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/talks",
                headers={
                    "authorization": f"Basic {self.api_key}",
                    "content-type": "application/json"
                },
                json={
                    "source_url": payload.photo.url,
                    "script": script,
                    "config": {
                        "stitch": True
                    }
                }
            )

            if response.status_code >= 400:
                raise AvatarMediaProviderError(
                    "provider_request_failed",
                    f"D-ID request failed with status {response.status_code}."
                )

            data = response.json()
            provider_job_id = str(data.get("id") or "")
            result_url = data.get("result_url") or data.get("resultUrl")
            if isinstance(result_url, str) and result_url:
                return AvatarMediaOutput(
                    status="completed",
                    provider_job_id=provider_job_id or None,
                    video_url=result_url,
                    duration_seconds=_parse_duration_seconds(data),
                    usage=_video_usage("DID", _parse_duration_seconds(data)),
                    metadata={"providerStatus": data.get("status")}
                )

            if not provider_job_id:
                raise AvatarMediaProviderError(
                    "provider_job_missing",
                    "D-ID did not return a job id."
                )

            for _ in range(self.poll_attempts):
                await asyncio.sleep(2)
                status_response = await client.get(
                    f"{self.base_url}/talks/{provider_job_id}",
                    headers={"authorization": f"Basic {self.api_key}"}
                )
                if status_response.status_code >= 400:
                    raise AvatarMediaProviderError(
                        "provider_status_failed",
                        f"D-ID status request failed with status {status_response.status_code}."
                    )

                status_data = status_response.json()
                status_value = str(status_data.get("status") or "").lower()
                status_url = status_data.get("result_url") or status_data.get("resultUrl")
                if isinstance(status_url, str) and status_url:
                    duration_seconds = _parse_duration_seconds(status_data)
                    return AvatarMediaOutput(
                        status="completed",
                        provider_job_id=provider_job_id,
                        video_url=status_url,
                        duration_seconds=duration_seconds,
                        usage=_video_usage("DID", duration_seconds),
                        metadata={"providerStatus": status_data.get("status")}
                    )
                if status_value in ("error", "failed", "rejected"):
                    raise AvatarMediaProviderError(
                        "provider_generation_failed",
                        "D-ID failed to generate the avatar video."
                    )

        return AvatarMediaOutput(
            status="processing",
            provider_job_id=provider_job_id,
            usage=_video_usage("DID", None),
            metadata={"pollAttempts": self.poll_attempts}
        )

    async def get_generation_status(self, provider_job_id: str) -> AvatarMediaOutput:
        if not self.api_key:
            raise AvatarMediaProviderError(
                "provider_not_configured",
                "D-ID API key is missing."
            )

        try:
            import httpx
        except ModuleNotFoundError as exc:
            raise AvatarMediaProviderError(
                "dependency_missing",
                "httpx dependency is unavailable."
            ) from exc

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.base_url}/talks/{provider_job_id}",
                headers={"authorization": f"Basic {self.api_key}"}
            )

        if response.status_code >= 400:
            raise AvatarMediaProviderError(
                "provider_status_failed",
                f"D-ID status request failed with status {response.status_code}."
            )

        data = response.json()
        result_url = data.get("result_url") or data.get("resultUrl")
        if isinstance(result_url, str) and result_url:
            duration_seconds = _parse_duration_seconds(data)
            return AvatarMediaOutput(
                status="completed",
                provider_job_id=provider_job_id,
                video_url=result_url,
                duration_seconds=duration_seconds,
                usage=_video_usage("DID", duration_seconds),
                metadata={"providerStatus": data.get("status")}
            )

        return AvatarMediaOutput(
            status="processing",
            provider_job_id=provider_job_id,
            usage=_video_usage("DID", None),
            metadata={"providerStatus": data.get("status")}
        )


class TavusPlaceholderAvatarMediaProvider(AvatarMediaProvider):
    @property
    def name(self) -> str:
        return "TAVUS"

    async def generate_video(self, payload: AvatarMediaInput) -> AvatarMediaOutput:
        if not settings.tavus_api_key:
            raise AvatarMediaProviderError("provider_not_configured", "Tavus API key is missing.")
        if not settings.tavus_default_replica_id or not settings.tavus_default_persona_id:
            raise AvatarMediaProviderError(
                "provider_not_configured",
                "Tavus replica and persona ids are required for video generation."
            )
        raise AvatarMediaProviderError(
            "provider_placeholder",
            "Tavus video generation is a Phase 10 placeholder until the replica flow is configured."
        )


class SimliPlaceholderAvatarMediaProvider(AvatarMediaProvider):
    @property
    def name(self) -> str:
        return "SIMLI"

    async def generate_video(self, payload: AvatarMediaInput) -> AvatarMediaOutput:
        raise AvatarMediaProviderError(
            "provider_placeholder",
            "Simli avatar media is reserved for a future provider adapter."
        )


class SelfHostedUnavailableAvatarMediaProvider(AvatarMediaProvider):
    @property
    def name(self) -> str:
        return "SELF_HOSTED"

    async def generate_video(self, payload: AvatarMediaInput) -> AvatarMediaOutput:
        raise AvatarMediaProviderError(
            "provider_unavailable",
            "Self-hosted avatar media generation is reserved for a future phase."
        )


def _parse_duration_seconds(data: Dict[str, Any]) -> float | None:
    for key in ("duration", "duration_seconds", "durationSeconds"):
        value = data.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                continue
    return None


def _video_usage(provider: str, duration_seconds: float | None) -> Dict[str, Any]:
    return {
        "requests": 1,
        "seconds": duration_seconds,
        "provider": provider,
        "mockFallbackUsed": provider == "MOCK"
    }


def build_avatar_media_provider() -> AvatarMediaProvider:
    provider_name = settings.ai_runtime_avatar_media_provider.strip().upper()
    if provider_name == "DID":
        return DidAvatarMediaProvider(
            api_key=settings.did_api_key,
            base_url=settings.did_base_url,
            poll_attempts=settings.did_poll_attempts
        )
    if provider_name == "TAVUS":
        return TavusPlaceholderAvatarMediaProvider()
    if provider_name == "SIMLI":
        return SimliPlaceholderAvatarMediaProvider()
    if provider_name == "SELF_HOSTED":
        return SelfHostedUnavailableAvatarMediaProvider()
    return MockAvatarMediaProvider()
