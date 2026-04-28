import type { RuntimeKnowledgeChunkForRuntime } from "@/lib/avatar-runtime-retrieval"

export type RuntimeAvatarConfig = {
  avatarId: string
  greeting: string
  tone: string
  answerStyle: string
  businessInstructions: string
  fallbackMessage: string
  leadCapturePreference: string
  handoffPreference: string
  language: string
}

export type RuntimeVoiceMetadata = {
  id: string
  provider: string
  providerVoiceId: string
  name: string
  language: string
  style: string
  presentationStyle: string
  status: string
}

export type RuntimeAvatarPhotoReference = {
  assetId: string
  url: string
  mimeType: string
  width: number
  height: number
}

export type RuntimeRequest = {
  workspaceId: string
  avatarId: string
  conversationId: string
  messageId: string
  channel: "DASHBOARD_PREVIEW" | "WIDGET" | "KIOSK" | "API"
  inputType: "text" | "audio"
  inputText: string
  audioInput?: RuntimeAudioInputReference | null
  outputMode: "text" | "audio" | "video"
  visitorMessageCount: number
  avatarConfig: RuntimeAvatarConfig
  selectedVoiceMetadata?: RuntimeVoiceMetadata | null
  avatarPhotoReference?: RuntimeAvatarPhotoReference | null
  knowledgeChunks: RuntimeKnowledgeChunkForRuntime[]
  visitorLanguage?: string
}

export type RuntimeAudioInputReference = {
  assetId: string
  audioBase64: string
  mimeType: string
  fileName: string
  sizeBytes: number
  durationSeconds: number | null
}

export type RuntimeResponseSourceReference = {
  chunkId: string
  sourceId: string
  sourceTitle: string | null
  score: number
}

export type RuntimeUsage = {
  provider: string
  elapsedMs?: number
  mockFallbackUsed?: boolean
  reason?: string
  retrievedChunkCount?: number
  matchedChunkCount?: number
  tokens?: Record<string, number>
}

export type RuntimeAudioOutput = {
  audioBase64: string
  mimeType: string
  fileExtension: string
  usage: Record<string, unknown>
  provider: string
  model?: string | null
}

export type RuntimeAudioError = {
  code: string
  message: string
  provider?: string | null
}

export type RuntimeVideoOutput = {
  status: "completed" | "processing" | "failed"
  providerJobId?: string | null
  videoUrl?: string | null
  videoBase64?: string | null
  mimeType?: string | null
  fileExtension?: string | null
  durationSeconds?: number | null
  usage: Record<string, unknown>
  provider: string
}

export type RuntimeVideoError = {
  code: string
  message: string
  provider?: string | null
}

export type RuntimeTranscription = {
  text: string
  language?: string | null
  confidence?: number | null
  durationSeconds?: number | null
  usage?: Record<string, unknown>
  provider: string
  model?: string | null
}

export type RuntimeLeadCapture = {
  required: boolean
  reason: string | null
  fields: string[]
  promptText: string | null
}

export type RuntimeResponse = {
  conversationId: string
  messageId: string
  status: "ok" | "fallback" | "blocked" | "error"
  answer: string
  intent?: string
  confidence?: number
  leadCaptureDecision: "none" | "request"
  leadCapture: RuntimeLeadCapture
  handoffDecision: "none" | "request"
  usage: RuntimeUsage
  sourceReferences: RuntimeResponseSourceReference[]
  safetyReason?: string
  audio?: RuntimeAudioOutput | null
  audioError?: RuntimeAudioError | null
  video?: RuntimeVideoOutput | null
  videoError?: RuntimeVideoError | null
  transcription?: RuntimeTranscription | null
}

export type RuntimeErrorResponse = {
  status: "error"
  message: string
  statusCode?: number
}

export function isRuntimeError(value: unknown): value is RuntimeErrorResponse {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as { status?: unknown }
  return candidate.status === "error"
}

function resolveRuntimeBaseUrl(): string {
  return (process.env.AI_RUNTIME_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")
}

function resolveRuntimeServiceToken(): string {
  return (
    process.env.AI_RUNTIME_SERVICE_TOKEN ??
    process.env.AVATAR_RUNTIME_SERVICE_TOKEN ??
    ""
  )
}

function resolveRuntimeTimeoutMs(): number {
  const raw = process.env.AI_RUNTIME_REQUEST_TIMEOUT_MS
  const parsed = raw ? Number(raw) : 15000
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 15000
  }

  return Math.floor(parsed)
}

function defaultLeadCapture(): RuntimeLeadCapture {
  return {
    required: false,
    reason: null,
    fields: [],
    promptText: null
  }
}

function parseRuntimeLeadCapture(value: unknown, decision: "none" | "request"): RuntimeLeadCapture {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return decision === "request"
      ? {
        required: true,
        reason: "lead_capture_requested",
        fields: ["name", "email", "phone", "message"],
        promptText: "Share your contact details and the team can follow up."
      }
      : defaultLeadCapture()
  }

  const candidate = value as {
    required?: unknown
    reason?: unknown
    fields?: unknown
    promptText?: unknown
  }

  const fields = Array.isArray(candidate.fields)
    ? candidate.fields
      .map(item => String(item).trim())
      .filter(item => item === "name" || item === "email" || item === "phone" || item === "message")
    : []

  return {
    required: candidate.required === true,
    reason: typeof candidate.reason === "string" && candidate.reason.trim() ? candidate.reason.trim() : null,
    fields,
    promptText: typeof candidate.promptText === "string" && candidate.promptText.trim() ? candidate.promptText.trim() : null
  }
}

async function readRuntimeBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text)
  } catch {
    return {
      status: "error",
      message: `Invalid JSON payload from runtime service (HTTP ${response.status}).`
    }
  }
}

export async function sendRuntimeTextMessage(
  request: RuntimeRequest
): Promise<RuntimeResponse> {
  const baseUrl = resolveRuntimeBaseUrl()
  const token = resolveRuntimeServiceToken()
  const timeoutMs = resolveRuntimeTimeoutMs()

  if (!token) {
    return {
      status: "error",
      conversationId: request.conversationId,
      messageId: request.messageId,
      answer: "Runtime service token is not configured for runtime requests.",
      leadCaptureDecision: "none",
      leadCapture: defaultLeadCapture(),
      handoffDecision: "request",
      usage: { provider: "MOCK", mockFallbackUsed: true },
      sourceReferences: []
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${baseUrl}/runtime/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-service-token": token
      },
      body: JSON.stringify({
        ...request,
        knowledgeChunks: request.knowledgeChunks.map(chunk => ({
          id: chunk.id,
          sourceId: chunk.sourceId,
          sourceTitle: chunk.sourceTitle,
          content: chunk.content,
          metadata: chunk.metadata ?? null,
          sourceType: chunk.sourceType,
          position: chunk.position
        }))
      }),
      signal: controller.signal
    })

    const payload = await readRuntimeBody(response)
    if (!response.ok) {
      if (isRuntimeError(payload)) {
        return {
          ...payload,
          conversationId: request.conversationId,
          messageId: request.messageId,
          status: "error",
          leadCaptureDecision: "none",
          leadCapture: defaultLeadCapture(),
          handoffDecision: "request",
          usage: { provider: "unknown" },
          sourceReferences: []
        }
      }

      return {
        status: "error",
        conversationId: request.conversationId,
        messageId: request.messageId,
        answer: typeof (payload as { detail?: unknown }).detail === "string"
          ? String((payload as { detail: string }).detail)
          : `Runtime request failed with status ${response.status}.`,
        leadCaptureDecision: "none",
        leadCapture: defaultLeadCapture(),
        handoffDecision: "request",
        usage: { provider: "unknown", reason: `HTTP_${response.status}` },
        sourceReferences: []
      }
    }

    const typedPayload = payload as Partial<RuntimeResponse>
    const parsedLeadCapture = parseRuntimeLeadCapture(
      typedPayload.leadCapture,
      typedPayload.leadCaptureDecision === "request" ? "request" : "none"
    )
    const leadCaptureDecision = typedPayload.leadCaptureDecision === "request" || parsedLeadCapture.required ? "request" : "none"
    return {
      status: typedPayload.status === "ok" || typedPayload.status === "fallback" || typedPayload.status === "blocked" || typedPayload.status === "error"
        ? typedPayload.status
        : "fallback",
      conversationId: String(typedPayload.conversationId ?? request.conversationId),
      messageId: String(typedPayload.messageId ?? request.messageId),
      answer: String(typedPayload.answer ?? ""),
      leadCaptureDecision,
      leadCapture: parsedLeadCapture,
      handoffDecision:
        typedPayload.handoffDecision === "request" ? "request" : "none",
      usage: typedPayload.usage || { provider: "unknown" },
      sourceReferences: typedPayload.sourceReferences ?? [],
      safetyReason: typedPayload.safetyReason,
      audio: typedPayload.audio ?? null,
      audioError: typedPayload.audioError ?? null,
      video: typedPayload.video ?? null,
      videoError: typedPayload.videoError ?? null,
      transcription: typedPayload.transcription ?? null
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        status: "error",
        conversationId: request.conversationId,
        messageId: request.messageId,
        answer: "Runtime request timed out.",
        leadCaptureDecision: "none",
        leadCapture: defaultLeadCapture(),
        handoffDecision: "request",
        usage: { provider: "unknown", reason: "timeout" },
        sourceReferences: []
      }
    }

    return {
      status: "error",
      conversationId: request.conversationId,
      messageId: request.messageId,
      answer: "Runtime request failed. Please try again shortly.",
      leadCaptureDecision: "none",
      leadCapture: defaultLeadCapture(),
      handoffDecision: "request",
      usage: { provider: "unknown", reason: "network_error" },
      sourceReferences: []
    }
  } finally {
    clearTimeout(timeout)
  }
}
