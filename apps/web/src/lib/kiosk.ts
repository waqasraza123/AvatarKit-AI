import { randomUUID } from "node:crypto"
import {
  AvatarStatus,
  ConversationChannel,
  ConversationStatus,
  KnowledgeGapSource,
  MessageRole,
  RuntimeTraceStatus,
  SafetySource,
  type KioskSettings
} from "@prisma/client"
import {
  fetchAvatarByIdAndWorkspace,
  getCurrentSourcePhoto,
  isAvatarPublicRuntimeEligible,
  isTextLengthSafe,
  type AvatarRecord
} from "@/lib/avatar"
import { fetchRelevantKnowledgeChunksForPreview } from "@/lib/avatar-runtime-retrieval"
import { sendRuntimeTextMessage, type RuntimeLeadCapture, type RuntimeResponse } from "@/lib/avatar-runtime-client"
import { recordRuntimeKnowledgeGap } from "@/lib/knowledge-gap"
import { prisma } from "@/lib/prisma"
import { recordRuntimeSafetyEvents } from "@/lib/safety"
import {
  buildConversationMessageUsageEvent,
  buildRuntimeResponseUsageEvents,
  recordUsageEvent,
  recordUsageEvents
} from "@/lib/usage"

export type KioskSettingsRecord = {
  id: string
  workspaceId: string
  avatarId: string
  enabled: boolean
  idleGreeting: string
  inactivityTimeoutSeconds: number
  privacyTimeoutSeconds: number
  allowedLanguage: string | null
  leadCaptureEnabled: boolean
  qrHandoffUrl: string | null
  staffCallLabel: string | null
  staffCallUrl: string | null
}

export type KioskPublicConfig = {
  avatarId: string
  displayName: string
  role: string
  useCase: string
  initials: string
  idleGreeting: string
  inactivityTimeoutSeconds: number
  privacyTimeoutSeconds: number
  allowedLanguage: string | null
  leadCaptureEnabled: boolean
  qrHandoffUrl: string | null
  staffCallLabel: string | null
  staffCallUrl: string | null
  photoUrl: string | null
}

export type KioskSessionResponse = {
  conversationId: string
  visitorId: string
  status: ConversationStatus
  createdAt: string
}

export type KioskMessageResponse = {
  conversationId: string
  visitorMessageId: string
  avatarMessage: {
    id: string
    content: string
    runtimeStatus: RuntimeResponse["status"]
    leadCapture: RuntimeLeadCapture
  }
}

export class KioskPublicError extends Error {
  statusCode: number
  code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

const KIOSK_MESSAGE_MIN_LENGTH = 2
const KIOSK_MESSAGE_MAX_LENGTH = 800
const KIOSK_VISITOR_ID_MAX_LENGTH = 120
const KIOSK_RATE_LIMIT_WINDOW_MS = 60_000
const KIOSK_RATE_LIMIT_MAX_MESSAGES = 30
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

function normalizeText(value: unknown): string {
  return String(value ?? "").trim()
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  const text = normalizeText(value).replace(/\s+/g, " ")
  if (!text || !isTextLengthSafe(text, maxLength)) {
    return null
  }

  return text
}

function normalizePositiveInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(min, Math.min(max, parsed))
}

function normalizeUrl(value: unknown): { url: string | null; error: string | null } {
  const raw = normalizeText(value)
  if (!raw) {
    return { url: null, error: null }
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { url: null, error: "Enter a valid URL." }
  }

  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    return { url: null, error: "Use HTTPS outside local development." }
  }

  parsed.hash = ""
  return { url: parsed.toString(), error: null }
}

function parseVisitorId(value: unknown): string {
  const visitorId = normalizeText(value)
  if (visitorId && isTextLengthSafe(visitorId, KIOSK_VISITOR_ID_MAX_LENGTH) && /^[a-zA-Z0-9_-]+$/.test(visitorId)) {
    return visitorId
  }

  return randomUUID()
}

function getKioskInitials(displayName: string): string {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("")
  return initials || "AI"
}

function requestIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
}

function enforceRateLimit(params: { avatarId: string; visitorId: string; ip: string }): void {
  const now = Date.now()
  if (rateLimitBuckets.size > 1000) {
    for (const [bucketKey, bucketValue] of rateLimitBuckets.entries()) {
      if (bucketValue.resetAt <= now) {
        rateLimitBuckets.delete(bucketKey)
      }
    }
  }

  const key = `${params.avatarId}:${params.visitorId}:${params.ip}`
  const bucket = rateLimitBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + KIOSK_RATE_LIMIT_WINDOW_MS
    })
    return
  }

  bucket.count += 1
  if (bucket.count > KIOSK_RATE_LIMIT_MAX_MESSAGES) {
    throw new KioskPublicError(429, "rate_limited", "Too many kiosk messages. Please wait a moment.")
  }
}

function settingsRecord(settings: KioskSettings): KioskSettingsRecord {
  return {
    id: settings.id,
    workspaceId: settings.workspaceId,
    avatarId: settings.avatarId,
    enabled: settings.enabled,
    idleGreeting: settings.idleGreeting,
    inactivityTimeoutSeconds: settings.inactivityTimeoutSeconds,
    privacyTimeoutSeconds: settings.privacyTimeoutSeconds,
    allowedLanguage: settings.allowedLanguage,
    leadCaptureEnabled: settings.leadCaptureEnabled,
    qrHandoffUrl: settings.qrHandoffUrl,
    staffCallLabel: settings.staffCallLabel,
    staffCallUrl: settings.staffCallUrl
  }
}

export function getDefaultKioskSettings(avatar: Pick<AvatarRecord, "id" | "workspaceId" | "greeting" | "language">): Omit<KioskSettingsRecord, "id"> {
  return {
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    enabled: false,
    idleGreeting: avatar.greeting,
    inactivityTimeoutSeconds: 90,
    privacyTimeoutSeconds: 180,
    allowedLanguage: avatar.language,
    leadCaptureEnabled: true,
    qrHandoffUrl: null,
    staffCallLabel: null,
    staffCallUrl: null
  }
}

export async function fetchOrCreateKioskSettings(avatar: Pick<AvatarRecord, "id" | "workspaceId" | "greeting" | "language">): Promise<KioskSettingsRecord> {
  const existing = await prisma.kioskSettings.findUnique({
    where: { avatarId: avatar.id }
  })

  if (existing) {
    return settingsRecord(existing)
  }

  const defaults = getDefaultKioskSettings(avatar)
  const created = await prisma.kioskSettings.create({
    data: defaults
  })

  return settingsRecord(created)
}

export function parseKioskSettingsInput(formData: FormData): {
  avatarId: string
  enabled: boolean
  idleGreeting: string
  inactivityTimeoutSeconds: number
  privacyTimeoutSeconds: number
  allowedLanguage: string | null
  leadCaptureEnabled: boolean
  qrHandoffUrl: string | null
  staffCallLabel: string | null
  staffCallUrl: string | null
  errors: Record<string, string>
} {
  const avatarId = normalizeText(formData.get("avatarId"))
  const enabled = formData.get("enabled") === "on"
  const idleGreeting = normalizeText(formData.get("idleGreeting")).replace(/\s+/g, " ")
  const inactivityTimeoutSeconds = normalizePositiveInteger(formData.get("inactivityTimeoutSeconds"), 90, 30, 1800)
  const privacyTimeoutSeconds = normalizePositiveInteger(formData.get("privacyTimeoutSeconds"), 180, 60, 3600)
  const allowedLanguage = normalizeOptionalText(formData.get("allowedLanguage"), 16)
  const leadCaptureEnabled = formData.get("leadCaptureEnabled") === "on"
  const staffCallLabel = normalizeOptionalText(formData.get("staffCallLabel"), 40)
  const qrHandoff = normalizeUrl(formData.get("qrHandoffUrl"))
  const staffCall = normalizeUrl(formData.get("staffCallUrl"))
  const errors: Record<string, string> = {}

  if (!avatarId) {
    errors.avatarId = "Avatar is required."
  }

  if (!idleGreeting) {
    errors.idleGreeting = "Idle greeting is required."
  } else if (!isTextLengthSafe(idleGreeting, 220)) {
    errors.idleGreeting = "Idle greeting must be 220 characters or fewer."
  }

  if (privacyTimeoutSeconds < inactivityTimeoutSeconds) {
    errors.privacyTimeoutSeconds = "Privacy timeout must be greater than or equal to inactivity timeout."
  }

  if (normalizeText(formData.get("qrHandoffUrl")) && qrHandoff.error) {
    errors.qrHandoffUrl = qrHandoff.error
  }

  if (normalizeText(formData.get("staffCallUrl")) && staffCall.error) {
    errors.staffCallUrl = staffCall.error
  }

  if (normalizeText(formData.get("staffCallLabel")) && !staffCallLabel) {
    errors.staffCallLabel = "Staff call label must be 40 characters or fewer."
  }

  return {
    avatarId,
    enabled,
    idleGreeting,
    inactivityTimeoutSeconds,
    privacyTimeoutSeconds,
    allowedLanguage,
    leadCaptureEnabled,
    qrHandoffUrl: qrHandoff.url,
    staffCallLabel,
    staffCallUrl: staffCall.url,
    errors
  }
}

async function createRuntimeTrace(params: {
  workspaceId: string
  avatarId?: string | null
  conversationId?: string | null
  eventType: string
  status: RuntimeTraceStatus
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  await prisma.runtimeTrace.create({
    data: {
      workspaceId: params.workspaceId,
      avatarId: params.avatarId ?? null,
      conversationId: params.conversationId ?? null,
      eventType: params.eventType,
      status: params.status,
      metadata: params.metadata ?? null
    }
  }).catch(() => undefined)
}

async function loadKioskAvatar(avatarId: string): Promise<{ avatar: AvatarRecord; settings: KioskSettingsRecord }> {
  const avatarRow = await prisma.avatar.findUnique({
    where: { id: avatarId },
    select: { workspaceId: true }
  })

  if (!avatarRow) {
    throw new KioskPublicError(404, "avatar_not_found", "Avatar was not found.")
  }

  const avatar = await fetchAvatarByIdAndWorkspace(avatarRow.workspaceId, avatarId)
  if (!avatar || !isAvatarPublicRuntimeEligible(avatar) || avatar.status !== AvatarStatus.PUBLISHED) {
    throw new KioskPublicError(404, "avatar_unavailable", "Avatar is not available for kiosk mode.")
  }

  const settings = await fetchOrCreateKioskSettings(avatar)
  if (!settings.enabled) {
    throw new KioskPublicError(403, "kiosk_disabled", "Kiosk mode is not enabled for this avatar.")
  }

  return { avatar, settings }
}

export async function getPublicKioskConfig(avatarId: string): Promise<KioskPublicConfig> {
  const { avatar, settings } = await loadKioskAvatar(avatarId)
  const photo = getCurrentSourcePhoto(avatar)
  return {
    avatarId: avatar.id,
    displayName: avatar.displayName,
    role: avatar.role,
    useCase: avatar.useCase,
    initials: getKioskInitials(avatar.displayName),
    idleGreeting: settings.idleGreeting,
    inactivityTimeoutSeconds: settings.inactivityTimeoutSeconds,
    privacyTimeoutSeconds: settings.privacyTimeoutSeconds,
    allowedLanguage: settings.allowedLanguage,
    leadCaptureEnabled: settings.leadCaptureEnabled,
    qrHandoffUrl: settings.qrHandoffUrl,
    staffCallLabel: settings.staffCallLabel,
    staffCallUrl: settings.staffCallUrl,
    photoUrl: photo?.displayUrl ?? null
  }
}

export async function startKioskSession(avatarId: string, request: Request, body: unknown): Promise<KioskSessionResponse> {
  const { avatar } = await loadKioskAvatar(avatarId)
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const visitorId = parseVisitorId(payload.visitorId)
  enforceRateLimit({ avatarId: avatar.id, visitorId, ip: requestIp(request) })

  const conversation = await prisma.conversation.create({
    data: {
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      visitorId,
      channel: ConversationChannel.KIOSK,
      status: ConversationStatus.ACTIVE
    },
    select: {
      id: true,
      status: true,
      createdAt: true
    }
  })

  await recordUsageEvent({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    eventType: "kiosk.session.started",
    quantity: 1,
    unit: "count",
    metadata: { visitorId },
    idempotencyKey: `kiosk-session-started:${conversation.id}`
  })

  await createRuntimeTrace({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    eventType: "kiosk.session.started",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: { visitorId }
  })

  return {
    conversationId: conversation.id,
    visitorId,
    status: conversation.status,
    createdAt: conversation.createdAt.toISOString()
  }
}

export async function processKioskMessage(avatarId: string, conversationId: string, request: Request, body: unknown): Promise<KioskMessageResponse> {
  const { avatar, settings } = await loadKioskAvatar(avatarId)
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const inputText = normalizeText(payload.message)
  if (inputText.length < KIOSK_MESSAGE_MIN_LENGTH) {
    throw new KioskPublicError(400, "message_too_short", "Enter at least two characters.")
  }

  if (!isTextLengthSafe(inputText, KIOSK_MESSAGE_MAX_LENGTH)) {
    throw new KioskPublicError(400, "message_too_long", `Message must be ${KIOSK_MESSAGE_MAX_LENGTH} characters or fewer.`)
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      channel: ConversationChannel.KIOSK,
      status: ConversationStatus.ACTIVE
    },
    select: {
      id: true,
      visitorId: true,
      updatedAt: true
    }
  })

  if (!conversation) {
    throw new KioskPublicError(404, "conversation_not_found", "Active kiosk session was not found.")
  }

  const now = Date.now()
  if (now - conversation.updatedAt.getTime() > settings.privacyTimeoutSeconds * 1000) {
    await endKioskSession(avatarId, conversation.id)
    throw new KioskPublicError(409, "session_expired", "Kiosk session expired for privacy.")
  }

  enforceRateLimit({
    avatarId: avatar.id,
    visitorId: conversation.visitorId ?? "anonymous",
    ip: requestIp(request)
  })

  const visitorMessageId = randomUUID()
  await prisma.message.create({
    data: {
      id: visitorMessageId,
      conversationId: conversation.id,
      role: MessageRole.VISITOR,
      content: inputText,
      metadata: {
        channel: ConversationChannel.KIOSK,
        surface: "kiosk"
      }
    }
  })

  await recordUsageEvent(buildConversationMessageUsageEvent({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    messageId: visitorMessageId,
    role: MessageRole.VISITOR,
    channel: ConversationChannel.KIOSK
  }))

  const visitorMessageCount = await prisma.message.count({
    where: {
      conversationId: conversation.id,
      role: MessageRole.VISITOR
    }
  })

  await createRuntimeTrace({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    eventType: "kiosk.message.received",
    status: RuntimeTraceStatus.SUCCESS
  })

  const knowledgeChunks = await fetchRelevantKnowledgeChunksForPreview({
    workspaceId: avatar.workspaceId,
    messageText: inputText
  })

  let runtimeResponse: RuntimeResponse
  try {
    runtimeResponse = await sendRuntimeTextMessage({
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      conversationId: conversation.id,
      messageId: visitorMessageId,
      channel: "KIOSK",
      inputType: "text",
      inputText,
      outputMode: "text",
      visitorMessageCount,
      avatarConfig: {
        avatarId: avatar.id,
        greeting: avatar.greeting,
        tone: avatar.tone,
        answerStyle: avatar.answerStyle,
        businessInstructions: avatar.businessInstructions,
        fallbackMessage: avatar.fallbackMessage,
        leadCapturePreference: settings.leadCaptureEnabled ? avatar.leadCapturePreference : "never automatically ask",
        handoffPreference: avatar.handoffPreference,
        language: settings.allowedLanguage ?? avatar.language
      },
      selectedVoiceMetadata: avatar.voice ? {
        id: avatar.voice.id,
        provider: avatar.voice.provider,
        providerVoiceId: avatar.voice.providerVoiceId,
        name: avatar.voice.name,
        language: avatar.voice.language,
        style: avatar.voice.style,
        presentationStyle: avatar.voice.presentationStyle,
        status: avatar.voice.status
      } : null,
      avatarPhotoReference: null,
      knowledgeChunks
    })
  } catch {
    runtimeResponse = {
      conversationId: conversation.id,
      messageId: visitorMessageId,
      status: "error",
      answer: "The kiosk runtime failed. Please ask a staff member for help.",
      leadCaptureDecision: "none",
      leadCapture: {
        required: false,
        reason: null,
        fields: [],
        promptText: null
      },
      handoffDecision: "request",
      usage: { provider: "unknown" },
      sourceReferences: [],
      safetyEvents: []
    }
  }

  if (!settings.leadCaptureEnabled) {
    runtimeResponse = {
      ...runtimeResponse,
      leadCaptureDecision: "none",
      leadCapture: {
        required: false,
        reason: null,
        fields: [],
        promptText: null
      }
    }
  }

  const avatarMessageId = randomUUID()
  await prisma.message.create({
    data: {
      id: avatarMessageId,
      conversationId: conversation.id,
      role: MessageRole.AVATAR,
      content: runtimeResponse.answer || "",
      metadata: {
        runtimeStatus: runtimeResponse.status,
        usage: runtimeResponse.usage,
        outputMode: "text",
        channel: ConversationChannel.KIOSK,
        surface: "kiosk",
        handoffDecision: runtimeResponse.handoffDecision,
        leadCaptureDecision: runtimeResponse.leadCaptureDecision,
        leadCapture: runtimeResponse.leadCapture
      }
    }
  })

  await recordRuntimeSafetyEvents({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    inputMessageId: visitorMessageId,
    outputMessageId: avatarMessageId,
    source: SafetySource.KIOSK_RUNTIME,
    inputText,
    outputText: runtimeResponse.answer || "",
    safetyEvents: runtimeResponse.safetyEvents ?? []
  })

  await recordRuntimeKnowledgeGap({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    messageId: visitorMessageId,
    question: inputText,
    source: KnowledgeGapSource.KIOSK_RUNTIME,
    runtimeResponse
  })

  await recordUsageEvents([
    buildConversationMessageUsageEvent({
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      conversationId: conversation.id,
      messageId: avatarMessageId,
      role: MessageRole.AVATAR,
      channel: ConversationChannel.KIOSK
    }),
    ...buildRuntimeResponseUsageEvents({
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      conversationId: conversation.id,
      inputMessageId: visitorMessageId,
      outputMessageId: avatarMessageId,
      inputType: "text",
      outputMode: "text"
    }, runtimeResponse)
  ])

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() }
  })

  await createRuntimeTrace({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    eventType: "kiosk.response.saved",
    status: runtimeResponse.status === "error" ? RuntimeTraceStatus.FAILURE : RuntimeTraceStatus.SUCCESS,
    metadata: {
      provider: runtimeResponse.usage.provider,
      runtimeStatus: runtimeResponse.status
    }
  })

  return {
    conversationId: conversation.id,
    visitorMessageId,
    avatarMessage: {
      id: avatarMessageId,
      content: runtimeResponse.answer || "",
      runtimeStatus: runtimeResponse.status,
      leadCapture: runtimeResponse.leadCapture
    }
  }
}

export async function endKioskSession(avatarId: string, conversationId: string): Promise<void> {
  const avatarRow = await prisma.avatar.findUnique({
    where: { id: avatarId },
    select: { workspaceId: true }
  })

  if (!avatarRow) {
    throw new KioskPublicError(404, "avatar_not_found", "Avatar was not found.")
  }

  const updated = await prisma.conversation.updateMany({
    where: {
      id: conversationId,
      workspaceId: avatarRow.workspaceId,
      avatarId,
      channel: ConversationChannel.KIOSK,
      status: ConversationStatus.ACTIVE
    },
    data: {
      status: ConversationStatus.ENDED,
      endedAt: new Date(),
      updatedAt: new Date()
    }
  })

  if (updated.count > 0) {
    await createRuntimeTrace({
      workspaceId: avatarRow.workspaceId,
      avatarId,
      conversationId,
      eventType: "kiosk.session.ended",
      status: RuntimeTraceStatus.SUCCESS
    })
  }
}
