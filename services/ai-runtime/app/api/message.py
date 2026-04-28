from __future__ import annotations

import base64
import binascii
from datetime import UTC, datetime
from typing import Any, Dict, List, Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.settings import settings
from app.runtime.providers import (
    ProviderOutput,
    RuntimeProviderError,
    build_runtime_provider,
)
from app.runtime.avatar_media import (
    AvatarAudioReference,
    AvatarMediaInput,
    AvatarMediaProviderError,
    AvatarPhotoReference,
    AvatarVoiceReference,
    build_avatar_media_provider,
)
from app.runtime.safety import (
    SafetyDecision,
    SafetyResult,
    assess_context_match,
    assess_generated_answer_safety,
    assess_request_safety,
    infer_intent,
)
from app.runtime.tts import (
    TtsProviderError,
    TtsVoiceMetadata,
    build_tts_provider,
    encode_audio_base64,
)
from app.runtime.stt import (
    SttAudioInput,
    SttProviderError,
    build_stt_provider,
)

KnowledgeGapReason = Literal[
    "LOW_RETRIEVAL_CONFIDENCE",
    "NO_RELEVANT_KNOWLEDGE",
    "FALLBACK_USED",
    "USER_REPEATED_QUESTION",
    "SAFETY_HANDOFF",
    "OPERATOR_MARKED_POOR",
    "UNKNOWN",
]


router = APIRouter(prefix="/runtime")


class RuntimeKnowledgeChunk(BaseModel):
    id: str
    sourceId: str
    sourceTitle: str
    content: str
    sourceType: str
    position: int
    metadata: Dict[str, Any] | None = None


class RuntimeAvatarConfig(BaseModel):
    avatarId: str
    greeting: str
    tone: str
    answerStyle: str
    businessInstructions: str
    fallbackMessage: str
    leadCapturePreference: str
    handoffPreference: str
    language: str


class RuntimeVoiceMetadata(BaseModel):
    id: str
    provider: str
    providerVoiceId: str
    name: str
    language: str
    style: str
    presentationStyle: str
    status: str


class RuntimeAudioOutput(BaseModel):
    audioBase64: str
    mimeType: str
    fileExtension: str
    usage: Dict[str, Any]
    provider: str
    model: str | None = None


class RuntimeAudioError(BaseModel):
    code: str
    message: str
    provider: str | None = None


class RuntimeAvatarPhotoReference(BaseModel):
    assetId: str
    url: str
    mimeType: str
    width: int
    height: int


class RuntimeVideoOutput(BaseModel):
    status: Literal["completed", "processing", "failed"]
    providerJobId: str | None = None
    videoUrl: str | None = None
    videoBase64: str | None = None
    mimeType: str | None = None
    fileExtension: str | None = None
    durationSeconds: float | None = None
    usage: Dict[str, Any]
    provider: str


class RuntimeVideoError(BaseModel):
    code: str
    message: str
    provider: str | None = None


class RuntimeAudioInputReference(BaseModel):
    assetId: str
    audioBase64: str
    mimeType: str
    fileName: str
    sizeBytes: int
    durationSeconds: float | None = None


class RuntimeTranscriptionOutput(BaseModel):
    text: str
    language: str | None = None
    confidence: float | None = None
    durationSeconds: float | None = None
    usage: Dict[str, Any] = Field(default_factory=dict)
    provider: str
    model: str | None = None


class RuntimeMessageRequest(BaseModel):
    workspaceId: str
    avatarId: str
    conversationId: str
    messageId: str
    channel: Literal["DASHBOARD_PREVIEW", "WIDGET", "KIOSK", "API"]
    inputType: Literal["text", "audio"]
    inputText: str = ""
    audioInput: RuntimeAudioInputReference | None = None
    outputMode: Literal["text", "audio", "video"]
    visitorMessageCount: int = 1
    avatarConfig: RuntimeAvatarConfig
    selectedVoiceMetadata: RuntimeVoiceMetadata | None = None
    avatarPhotoReference: RuntimeAvatarPhotoReference | None = None
    knowledgeChunks: List[RuntimeKnowledgeChunk] = Field(default_factory=list)
    visitorLanguage: str | None = None


class RuntimeResponseSourceReference(BaseModel):
    chunkId: str
    sourceId: str
    sourceTitle: str | None = None
    score: float


class RuntimeUsage(BaseModel):
    provider: str
    elapsedMs: int | None = None
    mockFallbackUsed: bool | None = None
    reason: str | None = None
    retrievedChunkCount: int | None = None
    matchedChunkCount: int | None = None
    tokens: Dict[str, Any] | None = None


class RuntimeLeadCapture(BaseModel):
    required: bool = False
    reason: str | None = None
    fields: List[str] = Field(default_factory=list)
    promptText: str | None = None


class RuntimeMessageResponse(BaseModel):
    conversationId: str
    messageId: str
    status: Literal["ok", "fallback", "blocked", "error"]
    answer: str
    intent: str
    confidence: float
    retrievalConfidence: float | None = None
    fallbackUsed: bool = False
    missingKnowledge: bool = False
    handoffRequired: bool = False
    gapReason: KnowledgeGapReason | None = None
    originalQuestion: str | None = None
    leadCaptureDecision: Literal["none", "request"]
    leadCapture: RuntimeLeadCapture = Field(default_factory=RuntimeLeadCapture)
    handoffDecision: Literal["none", "request"]
    usage: RuntimeUsage
    sourceReferences: List[RuntimeResponseSourceReference]
    safetyReason: str | None = None
    audio: RuntimeAudioOutput | None = None
    audioError: RuntimeAudioError | None = None
    video: RuntimeVideoOutput | None = None
    videoError: RuntimeVideoError | None = None
    transcription: RuntimeTranscriptionOutput | None = None
    safetyEvents: List[SafetyResult] = Field(default_factory=list)


class SourceSimilarity:
    def __init__(self, chunk: RuntimeKnowledgeChunk, score: int) -> None:
        self.chunk = chunk
        self.score = score


class RuntimeDecision:
    def __init__(
        self,
        status: Literal["ok", "fallback", "blocked", "error"],
        intent: str,
        confidence: float,
        answer: str,
        lead_capture: RuntimeLeadCapture,
        handoff_request: bool,
        usage: Dict[str, Any],
        source_references: List[RuntimeResponseSourceReference],
        safety_reason: str | None = None
    ) -> None:
        self.status = status
        self.intent = intent
        self.confidence = confidence
        self.answer = answer
        self.lead_capture = lead_capture
        self.handoff_request = handoff_request
        self.usage = usage
        self.source_references = source_references
        self.safety_reason = safety_reason


def _require_service_token(token: str | None) -> None:
    expected = settings.ai_runtime_service_token
    if not expected:
        raise HTTPException(status_code=500, detail="Service token is not configured.")
    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid service token.")


def _build_profile_summary(config: RuntimeAvatarConfig) -> str:
    return (
        f"Avatar: {config.avatarId}. "
        f"Tone: {config.tone}. Style: {config.answerStyle}. "
        f"Business instructions: {config.businessInstructions}. "
        f"Language: {config.language}."
    )


def _build_context(chunks: List[RuntimeKnowledgeChunk]) -> str:
    return "\n\n".join(
        f"[{index + 1}] {chunk.sourceTitle}: {chunk.content}"
        for index, chunk in enumerate(chunks)
    )


def _score_chunk_for_query(chunk: RuntimeKnowledgeChunk, query_terms: List[str]) -> int:
    normalized_chunk = chunk.content.lower()
    score = 0
    for term in query_terms:
        if term and f" {term} " in f" {normalized_chunk} ":
            score += normalized_chunk.count(term)
    return score


def _build_source_references(
    chunks: List[RuntimeKnowledgeChunk],
    query_terms: List[str]
) -> List[RuntimeResponseSourceReference]:
    scored_chunks = [
        SourceSimilarity(chunk, _score_chunk_for_query(chunk, query_terms))
        for chunk in chunks
    ]
    scored_chunks.sort(key=lambda item: item.score, reverse=True)

    if not scored_chunks:
        return []

    top_chunks = [
        item for item in scored_chunks
        if item.score > 0
    ]

    if not top_chunks:
        top_chunks = scored_chunks[:6]

    return [
        RuntimeResponseSourceReference(
            chunkId=item.chunk.id,
            sourceId=item.chunk.sourceId,
            sourceTitle=item.chunk.sourceTitle,
            score=float(item.score)
        )
        for item in top_chunks[:6]
    ]


def _build_prompt(text: str, profile_summary: str, chunks: List[RuntimeKnowledgeChunk]) -> str:
    return (
        f"{profile_summary}\n\n"
        f"Input: {text}\n\n"
        f"Knowledge:\n{_build_context(chunks)}"
    )


def _resolve_handoff_decision(
    status: Literal["ok", "fallback", "blocked", "error"],
    safety: SafetyDecision,
    matched: bool
) -> Literal["none", "request"]:
    if status == "blocked":
        return "request"
    if safety.handoff_requested:
        return "request"
    if not matched and status == "fallback":
        return "request"
    return "none"


BUYING_INTENT_KEYWORDS = [
    "price",
    "pricing",
    "quote",
    "book",
    "appointment",
    "call",
    "contact",
    "schedule",
    "interested",
    "buy",
    "hire",
    "property viewing",
    "demo",
]


def _lead_capture_request(reason: str) -> RuntimeLeadCapture:
    prompt_text = (
        "Share your contact details and a short note so the team can follow up with the right next step."
    )
    if reason == "buying_intent":
        prompt_text = "Share your contact details and what you need, and the team can follow up about availability or next steps."
    elif reason == "cannot_answer":
        prompt_text = "I may not have enough approved information here. Share your details and the team can follow up."
    elif reason == "message_threshold":
        prompt_text = "If you would like a team member to continue from here, share your contact details."

    return RuntimeLeadCapture(
        required=True,
        reason=reason,
        fields=["name", "email", "phone", "message"],
        promptText=prompt_text,
    )


def _has_buying_intent(text: str) -> bool:
    normalized = text.lower()
    return any(keyword in normalized for keyword in BUYING_INTENT_KEYWORDS)


def _resolve_lead_capture(
    request: RuntimeMessageRequest,
    status: Literal["ok", "fallback", "blocked", "error"],
    confidence: float,
    input_text: str | None = None
) -> RuntimeLeadCapture:
    preference = request.avatarConfig.leadCapturePreference.strip().lower()
    lead_text = input_text if input_text is not None else request.inputText
    if preference == "never automatically ask":
        return RuntimeLeadCapture()

    if preference == "ask when visitor shows buying intent" and _has_buying_intent(lead_text):
        return _lead_capture_request("buying_intent")

    if preference == "ask when avatar cannot answer" and (status in ("fallback", "error") or confidence < 0.32):
        return _lead_capture_request("cannot_answer")

    if preference == "ask after a few messages" and request.visitorMessageCount >= 3:
        return _lead_capture_request("message_threshold")

    return RuntimeLeadCapture()


def _normalize_query(text: str) -> List[str]:
    normalized = text.lower().strip()
    terms = normalized.replace("\n", " ").replace("\r", " ").replace("\t", " ").split(" ")
    return [token for token in terms if len(token) > 2]


def _estimate_tokens(text: str) -> int:
    normalized = " ".join(text.split())
    if not normalized:
        return 0

    return max(1, round(len(normalized) / 4))


def _estimated_token_usage(input_text: str, output_text: str, reason: str) -> Dict[str, Any]:
    input_tokens = _estimate_tokens(input_text)
    output_tokens = _estimate_tokens(output_text)
    return {
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "totalTokens": input_tokens + output_tokens,
        "estimated": True,
        "estimationReason": reason
    }


async def _run_with_provider(
    prompt: str,
    context: str,
    profile_summary: str,
    fallback_message: str
) -> tuple[ProviderOutput, str]:
    provider, provider_name = build_runtime_provider()
    output = await provider.answer_question(
        prompt=prompt,
        context=context,
        profile_summary=profile_summary,
        fallback_message=fallback_message
    )
    output.usage["provider"] = provider_name
    return output, provider_name


def _build_error_payload(
    request: RuntimeMessageRequest,
    elapsed_ms: int,
    provider_name: str,
    reason: str,
    input_text: str | None = None,
    transcription: RuntimeTranscriptionOutput | None = None
) -> RuntimeMessageResponse:
    lead_capture = _resolve_lead_capture(request, "error", 0.18, input_text)
    original_question = input_text or request.inputText
    return RuntimeMessageResponse(
        conversationId=request.conversationId,
        messageId=request.messageId,
        status="error",
        answer=(
            "I’m sorry, I can’t produce a reliable answer right now. "
            "Please review this in a support workflow."
        ),
        intent="runtime_failure",
        confidence=0.18,
        retrievalConfidence=0.0,
        fallbackUsed=True,
        missingKnowledge=False,
        handoffRequired=True,
        gapReason=None,
        originalQuestion=original_question,
        leadCaptureDecision="request" if lead_capture.required else "none",
        leadCapture=lead_capture,
        handoffDecision="request",
        usage=RuntimeUsage(
            provider=provider_name,
            elapsedMs=elapsed_ms,
            mockFallbackUsed=True,
            reason=reason,
            retrievedChunkCount=0,
            matchedChunkCount=0,
            tokens=_estimated_token_usage(
                input_text or request.inputText,
                "I’m sorry, I can’t produce a reliable answer right now. Please review this in a support workflow.",
                reason
            )
        ),
        sourceReferences=[],
        safetyReason=None,
        audio=None,
        audioError=None,
        video=None,
        videoError=None,
        transcription=transcription,
        safetyEvents=[]
    )


def _resolve_gap_reason(
    status: Literal["ok", "fallback", "blocked", "error"],
    retrieval_confidence: float,
    missing_knowledge: bool,
    handoff_required: bool,
    usage_reason: str | None
) -> KnowledgeGapReason | None:
    if missing_knowledge or usage_reason == "missing_knowledge":
        return "NO_RELEVANT_KNOWLEDGE"
    if status == "fallback" or usage_reason == "generated_answer_rewritten":
        return "FALLBACK_USED"
    if retrieval_confidence < 0.32:
        return "LOW_RETRIEVAL_CONFIDENCE"
    if handoff_required:
        return "SAFETY_HANDOFF"
    return None


def _decode_audio_base64(audio_base64: str) -> bytes:
    try:
        return base64.b64decode(audio_base64, validate=True)
    except binascii.Error as exc:
        raise SttProviderError("audio payload is not valid base64") from exc


async def _resolve_runtime_input_text(
    request: RuntimeMessageRequest
) -> tuple[str, RuntimeTranscriptionOutput | None]:
    if request.inputType == "text":
        user_input = request.inputText.strip()
        if not user_input:
            raise HTTPException(status_code=400, detail="inputText is required.")
        return user_input, None

    if request.audioInput is None:
        raise HTTPException(status_code=400, detail="audioInput is required for audio input.")

    audio_bytes = _decode_audio_base64(request.audioInput.audioBase64)
    provider = build_stt_provider()
    try:
        output = await provider.transcribe_audio(
            SttAudioInput(
                audio_bytes=audio_bytes,
                mime_type=request.audioInput.mimeType,
                file_name=request.audioInput.fileName,
                language=request.visitorLanguage or request.avatarConfig.language,
                duration_seconds=request.audioInput.durationSeconds
            )
        )
    except SttProviderError as exc:
        raise HTTPException(status_code=422, detail=f"Transcription failed: {str(exc)}") from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Transcription failed.") from exc

    transcript = output.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=422, detail="Transcription returned no text.")

    return transcript, RuntimeTranscriptionOutput(
        text=transcript,
        language=output.language,
        confidence=output.confidence,
        durationSeconds=output.duration_seconds,
        usage=output.usage,
        provider=output.metadata.provider,
        model=output.metadata.model
    )


async def _generate_audio_for_response(
    request: RuntimeMessageRequest,
    answer: str
) -> tuple[RuntimeAudioOutput | None, RuntimeAudioError | None]:
    if request.outputMode not in ("audio", "video"):
        return None, None

    if request.selectedVoiceMetadata is None:
        return None, RuntimeAudioError(
            code="missing_voice",
            message="A selected active voice is required for audio output.",
            provider=None
        )

    if request.selectedVoiceMetadata.status != "ACTIVE":
        return None, RuntimeAudioError(
            code="inactive_voice",
            message="The selected voice is inactive.",
            provider=request.selectedVoiceMetadata.provider
        )

    provider = build_tts_provider()
    try:
        output = await provider.generate_audio(
            text=answer,
            voice=TtsVoiceMetadata(
                id=request.selectedVoiceMetadata.id,
                provider=request.selectedVoiceMetadata.provider,
                provider_voice_id=request.selectedVoiceMetadata.providerVoiceId,
                name=request.selectedVoiceMetadata.name,
                language=request.selectedVoiceMetadata.language,
                style=request.selectedVoiceMetadata.style,
                presentation_style=request.selectedVoiceMetadata.presentationStyle,
                status=request.selectedVoiceMetadata.status
            ),
            language=request.visitorLanguage or request.avatarConfig.language
        )
    except TtsProviderError as error:
        return None, RuntimeAudioError(
            code="tts_provider_failed",
            message=str(error),
            provider=provider.name
        )
    except Exception:
        return None, RuntimeAudioError(
            code="tts_provider_failed",
            message="TTS provider failed to generate audio.",
            provider=provider.name
        )

    return RuntimeAudioOutput(
        audioBase64=encode_audio_base64(output.audio_bytes),
        mimeType=output.mime_type,
        fileExtension=output.file_extension,
        usage=output.usage,
        provider=output.metadata.provider,
        model=output.metadata.model
    ), None


async def _generate_video_for_response(
    request: RuntimeMessageRequest,
    answer: str,
    audio: RuntimeAudioOutput | None
) -> tuple[RuntimeVideoOutput | None, RuntimeVideoError | None]:
    if request.outputMode != "video":
        return None, None

    if request.avatarPhotoReference is None:
        return None, RuntimeVideoError(
            code="missing_photo",
            message="A valid avatar source photo is required for video output.",
            provider=None
        )

    if request.selectedVoiceMetadata is None:
        return None, RuntimeVideoError(
            code="missing_voice",
            message="A selected active voice is required for video output.",
            provider=None
        )

    provider = build_avatar_media_provider()
    try:
        output = await provider.generate_video(
            AvatarMediaInput(
                workspace_id=request.workspaceId,
                avatar_id=request.avatarId,
                conversation_id=request.conversationId,
                message_id=request.messageId,
                photo=AvatarPhotoReference(
                    asset_id=request.avatarPhotoReference.assetId,
                    url=request.avatarPhotoReference.url,
                    mime_type=request.avatarPhotoReference.mimeType,
                    width=request.avatarPhotoReference.width,
                    height=request.avatarPhotoReference.height
                ),
                text=answer,
                language=request.visitorLanguage or request.avatarConfig.language,
                voice=AvatarVoiceReference(
                    id=request.selectedVoiceMetadata.id,
                    provider=request.selectedVoiceMetadata.provider,
                    provider_voice_id=request.selectedVoiceMetadata.providerVoiceId,
                    name=request.selectedVoiceMetadata.name,
                    language=request.selectedVoiceMetadata.language,
                    style=request.selectedVoiceMetadata.style,
                    presentation_style=request.selectedVoiceMetadata.presentationStyle,
                    status=request.selectedVoiceMetadata.status
                ),
                audio=AvatarAudioReference(
                    audio_base64=audio.audioBase64 if audio else None,
                    mime_type=audio.mimeType if audio else None,
                    file_extension=audio.fileExtension if audio else None,
                    url=None,
                    provider=audio.provider if audio else None
                ) if audio else None
            )
        )
    except AvatarMediaProviderError as error:
        return None, RuntimeVideoError(
            code=error.code,
            message=error.message,
            provider=provider.name
        )
    except Exception:
        return None, RuntimeVideoError(
            code="avatar_video_provider_failed",
            message="Avatar media provider failed to generate video.",
            provider=provider.name
        )

    if output.status == "failed":
        return None, RuntimeVideoError(
            code=output.error_code or "avatar_video_failed",
            message=output.error_message or "Avatar video generation failed.",
            provider=provider.name
        )

    return RuntimeVideoOutput(
        status=output.status,
        providerJobId=output.provider_job_id,
        videoUrl=output.video_url,
        videoBase64=output.video_base64,
        mimeType=output.mime_type,
        fileExtension=output.file_extension,
        durationSeconds=output.duration_seconds,
        usage=output.usage or {
            "requests": 1,
            "seconds": output.duration_seconds,
            "provider": provider.name
        },
        provider=provider.name
    ), None


@router.post("/message", response_model=RuntimeMessageResponse)
async def runtime_message(
    request: RuntimeMessageRequest,
    x_service_token: str | None = Header(default=None)
) -> RuntimeMessageResponse:
    _require_service_token(x_service_token)

    started_at = datetime.now(UTC)
    user_input, transcription = await _resolve_runtime_input_text(request)
    chunks = list(request.knowledgeChunks)
    query_terms = _normalize_query(user_input)
    query_terms.extend(_normalize_query(request.avatarConfig.businessInstructions))
    match_count, matched_chunk_count = assess_context_match(user_input, [
        {"content": chunk.content} for chunk in chunks
    ])

    safety = assess_request_safety(user_input)
    intent = infer_intent(user_input, len(chunks) > 0, matched_chunk_count > 0)
    source_references = _build_source_references(chunks, query_terms)

    if not chunks:
        elapsed_ms = int((datetime.now(UTC) - started_at).total_seconds() * 1000)
        answer = (
            f"{request.avatarConfig.fallbackMessage} "
            "There are no approved knowledge chunks available for this workspace right now."
        )
        audio, audio_error = await _generate_audio_for_response(request, answer)
        video, video_error = await _generate_video_for_response(request, answer, audio)
        lead_capture = _resolve_lead_capture(request, "fallback", 0.2, user_input)
        return RuntimeMessageResponse(
            conversationId=request.conversationId,
            messageId=request.messageId,
            status="fallback",
            answer=answer,
            intent=intent,
            confidence=0.2,
            retrievalConfidence=0.0,
            fallbackUsed=True,
            missingKnowledge=True,
            handoffRequired=True,
            gapReason="NO_RELEVANT_KNOWLEDGE",
            originalQuestion=user_input,
            leadCaptureDecision="request" if lead_capture.required else "none",
            leadCapture=lead_capture,
            handoffDecision="request",
            usage=RuntimeUsage(
                provider="MOCK",
                elapsedMs=elapsed_ms,
                mockFallbackUsed=True,
                reason="missing_knowledge",
                retrievedChunkCount=0,
                matchedChunkCount=0,
                tokens=_estimated_token_usage(user_input, answer, "missing_knowledge")
            ),
            sourceReferences=[],
            safetyReason=None,
            audio=audio,
            audioError=audio_error,
            video=video,
            videoError=video_error,
            transcription=transcription,
            safetyEvents=[]
        )

    if not safety.allowed:
        elapsed_ms = int((datetime.now(UTC) - started_at).total_seconds() * 1000)
        answer = safety.result.fallbackAnswer if safety.result and safety.result.fallbackAnswer else (
            "I can’t handle that safely here. A human team member should review this request."
        )
        audio, audio_error = await _generate_audio_for_response(request, answer)
        video, video_error = await _generate_video_for_response(request, answer, audio)
        lead_capture = _resolve_lead_capture(request, "blocked", safety.confidence, user_input)
        safety_events = [safety.result] if safety.result else []
        return RuntimeMessageResponse(
            conversationId=request.conversationId,
            messageId=request.messageId,
            status="blocked",
            answer=answer,
            intent=safety.intent,
            confidence=safety.confidence,
            retrievalConfidence=float(matched_chunk_count) / max(1.0, float(len(chunks))),
            fallbackUsed=True,
            missingKnowledge=False,
            handoffRequired=True,
            gapReason=None,
            originalQuestion=user_input,
            leadCaptureDecision="request" if lead_capture.required else "none",
            leadCapture=lead_capture,
            handoffDecision="request",
            usage=RuntimeUsage(
                provider="MOCK",
                elapsedMs=elapsed_ms,
                mockFallbackUsed=True,
                reason="safety_blocked",
                retrievedChunkCount=len(chunks),
                matchedChunkCount=matched_chunk_count,
                tokens=_estimated_token_usage(user_input, answer, "safety_blocked")
            ),
            sourceReferences=[],
            safetyReason=safety.reason,
            audio=audio,
            audioError=audio_error,
            video=video,
            videoError=video_error,
            transcription=transcription,
            safetyEvents=safety_events
        )

    context = _build_context(chunks)
    prompt = _build_prompt(user_input, _build_profile_summary(request.avatarConfig), chunks)

    try:
        provider_output, provider_name = await _run_with_provider(
            prompt=prompt,
            context=context,
            profile_summary=_build_profile_summary(request.avatarConfig),
            fallback_message=request.avatarConfig.fallbackMessage
        )
    except RuntimeProviderError as error:
        return _build_error_payload(
            request=request,
            elapsed_ms=int((datetime.now(UTC) - started_at).total_seconds() * 1000),
            provider_name="MOCK",
            reason=str(error),
            input_text=user_input,
            transcription=transcription
        )
    except Exception:
        return _build_error_payload(
            request=request,
            elapsed_ms=int((datetime.now(UTC) - started_at).total_seconds() * 1000),
            provider_name="MOCK",
            reason="provider_execution_failed",
            input_text=user_input,
            transcription=transcription
        )

    elapsed_ms = int((datetime.now(UTC) - started_at).total_seconds() * 1000)
    response_text = provider_output.answer.strip() or request.avatarConfig.fallbackMessage

    if not response_text:
        response_text = request.avatarConfig.fallbackMessage

    match_ratio = 0.0
    if len(user_input) > 0:
        match_ratio = min(0.97, 0.2 + (match_count / max(1, len(user_input))))

    response_status: Literal["ok", "fallback", "blocked", "error"] = "ok"
    if match_count == 0 and " " in user_input and query_terms:
        response_status = "fallback"
    elif match_ratio < 0.32 and matched_chunk_count == 0:
        response_status = "fallback"

    usage_payload = provider_output.usage.copy()
    usage_payload["elapsedMs"] = elapsed_ms
    usage_payload["retrievedChunkCount"] = len(chunks)
    usage_payload["matchedChunkCount"] = matched_chunk_count

    if "provider" not in usage_payload:
        usage_payload["provider"] = provider_name

    if "mockFallbackUsed" not in usage_payload:
        usage_payload["mockFallbackUsed"] = provider_name == "MOCK"

    if response_status == "ok" and response_text == request.avatarConfig.fallbackMessage:
        response_status = "fallback"

    safety_events: List[SafetyResult] = []
    post_check = assess_generated_answer_safety(
        answer=response_text,
        confidence=match_ratio,
        matched_chunk_count=matched_chunk_count,
        fallback_message=request.avatarConfig.fallbackMessage
    )
    if post_check:
        safety_events.append(post_check)
        if post_check.action == "REWRITE" and post_check.fallbackAnswer:
            response_text = post_check.fallbackAnswer
            response_status = "fallback"
        elif post_check.action in ("REFUSE", "BLOCK") and post_check.fallbackAnswer:
            response_text = post_check.fallbackAnswer
            response_status = "blocked"
        usage_payload["reason"] = post_check.eventType

    decision = RuntimeDecision(
        status=response_status,
        intent=intent,
        confidence=match_ratio,
        answer=response_text,
        lead_capture=_resolve_lead_capture(request, response_status, match_ratio, user_input),
        handoff_request=(
            _resolve_handoff_decision(response_status, safety, matched_chunk_count > 0) == "request"
            or any(event.handoffRequired for event in safety_events)
        ),
        usage=usage_payload,
        source_references=source_references
    )

    if decision.status == "blocked":
        decision.safety_reason = (safety.reason or safety_events[0].reason) if safety_events else safety.reason
    elif safety_events:
        decision.safety_reason = safety_events[0].reason

    audio, audio_error = await _generate_audio_for_response(request, decision.answer)
    video, video_error = await _generate_video_for_response(request, decision.answer, audio)

    usage_reason = str(usage_payload.get("reason", "")) if usage_payload.get("reason") else None
    retrieval_confidence = min(0.97, float(matched_chunk_count) / max(1.0, float(len(chunks))))
    missing_knowledge = matched_chunk_count == 0 and decision.status == "fallback"

    return RuntimeMessageResponse(
        conversationId=request.conversationId,
        messageId=request.messageId,
        status=decision.status,
        answer=decision.answer,
        intent=decision.intent,
        confidence=decision.confidence,
        retrievalConfidence=retrieval_confidence,
        fallbackUsed=decision.status == "fallback",
        missingKnowledge=missing_knowledge,
        handoffRequired=decision.handoff_request,
        gapReason=_resolve_gap_reason(
            decision.status,
            retrieval_confidence,
            missing_knowledge,
            decision.handoff_request,
            usage_reason
        ),
        originalQuestion=user_input,
        leadCaptureDecision="request" if decision.lead_capture.required else "none",
        leadCapture=decision.lead_capture,
        handoffDecision="request" if decision.handoff_request else "none",
        usage=RuntimeUsage(
            provider=str(usage_payload.get("provider", "MOCK")),
            elapsedMs=int(usage_payload.get("elapsedMs", 0)),
            mockFallbackUsed=bool(usage_payload.get("mockFallbackUsed", False)),
            reason=usage_reason,
            retrievedChunkCount=int(usage_payload.get("retrievedChunkCount", 0)),
            matchedChunkCount=int(usage_payload.get("matchedChunkCount", matched_chunk_count)),
            tokens=(
                dict(usage_payload.get("tokens", {}))
                if isinstance(usage_payload.get("tokens"), dict)
                else None
            )
        ),
        sourceReferences=decision.source_references,
        safetyReason=decision.safety_reason,
        audio=audio,
        audioError=audio_error,
        video=video,
        videoError=video_error,
        transcription=transcription,
        safetyEvents=safety_events
    )
