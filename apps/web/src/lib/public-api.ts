import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import {
  AvatarStatus,
  ConversationChannel,
  ConversationStatus,
  KnowledgeGapSource,
  LeadSource,
  LeadStatus,
  MessageRole,
  RuntimeTraceStatus,
  SafetyAction,
  SafetySource,
  type ApiKey,
  type WebhookEndpoint
} from "@prisma/client"
import {
  fetchAvatarByIdAndWorkspace,
  getCurrentSourcePhoto,
  isAvatarPublicRuntimeEligible,
  isTextLengthSafe
} from "@/lib/avatar"
import { fetchRelevantKnowledgeChunksForPreview } from "@/lib/avatar-runtime-retrieval"
import { sendRuntimeTextMessage, type RuntimeResponse } from "@/lib/avatar-runtime-client"
import { validateLeadPayload } from "@/lib/lead"
import { prisma } from "@/lib/prisma"
import { assessLeadInputSafety, recordRuntimeSafetyEvents, recordSafetyEvent } from "@/lib/safety"
import {
  buildConversationMessageUsageEvent,
  buildRuntimeResponseUsageEvents,
  recordUsageEvent,
  recordUsageEvents
} from "@/lib/usage"
import { recordRuntimeKnowledgeGap } from "@/lib/knowledge-gap"

export const PUBLIC_API_SCOPES = [
  "avatars:read",
  "conversations:write",
  "conversations:read",
  "leads:write",
  "webhooks:write"
] as const

export const WEBHOOK_EVENTS = [
  "conversation.started",
  "conversation.ended",
  "lead.created",
  "handoff.requested",
  "avatar.failed",
  "safety.flagged"
] as const

export type PublicApiScope = (typeof PUBLIC_API_SCOPES)[number]
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]
export type PublicApiOutputMode = "text" | "audio" | "video"

export type PublicApiContext = {
  workspaceId: string
  apiKeyId: string
  apiKeyPrefix: string
  scopes: string[]
}

export type CreatedPublicApiKey = {
  rawKey: string
  prefix: string
  keyHash: string
}

export type CreatedWebhookSecret = {
  rawSecret: string
  prefix: string
  secretHash: string
}

export class PublicApiError extends Error {
  statusCode: number
  code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

const API_KEY_PREFIX_LENGTH = 12
const API_KEY_SECRET_BYTES = 32
const WEBHOOK_SECRET_PREFIX_LENGTH = 10
const PUBLIC_API_MESSAGE_MIN_LENGTH = 2
const PUBLIC_API_MESSAGE_MAX_LENGTH = 800
const PUBLIC_API_VISITOR_ID_MAX_LENGTH = 120

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function safeCompareHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex")
  const rightBuffer = Buffer.from(right, "hex")
  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim()
}

function parsePublicApiKey(value: string): { rawKey: string; prefix: string } | null {
  const match = /^(avk_(?:live|test)_([a-z0-9]{12})_[a-zA-Z0-9_-]{32,})$/.exec(value.trim())
  if (!match?.[1] || !match[2]) {
    return null
  }

  return {
    rawKey: match[1],
    prefix: match[2]
  }
}

function parseBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim() ?? ""
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() ?? null
}

function parseJsonObject(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {}
}

function parseVisitorId(value: unknown): string {
  const visitorId = normalizeText(value)
  if (visitorId && isTextLengthSafe(visitorId, PUBLIC_API_VISITOR_ID_MAX_LENGTH) && /^[a-zA-Z0-9_-]+$/.test(visitorId)) {
    return visitorId
  }

  return randomUUID()
}

function parseOutputMode(_value: unknown): PublicApiOutputMode {
  return "text"
}

function apiKeySelect() {
  return {
    id: true,
    workspaceId: true,
    name: true,
    prefix: true,
    scopes: true,
    createdAt: true,
    lastUsedAt: true,
    revokedAt: true
  } satisfies Record<keyof Pick<ApiKey, "id" | "workspaceId" | "name" | "prefix" | "createdAt" | "lastUsedAt" | "revokedAt"> | "scopes", true>
}

function webhookEndpointSelect() {
  return {
    id: true,
    workspaceId: true,
    url: true,
    description: true,
    events: true,
    signingSecretPrefix: true,
    createdAt: true,
    lastDeliveryAt: true,
    revokedAt: true
  } satisfies Record<keyof Pick<WebhookEndpoint, "id" | "workspaceId" | "url" | "description" | "createdAt" | "lastDeliveryAt" | "revokedAt"> | "events" | "signingSecretPrefix", true>
}

export function createPublicApiKeySecret(): CreatedPublicApiKey {
  const prefix = randomBytes(API_KEY_PREFIX_LENGTH / 2).toString("hex")
  const secret = randomBytes(API_KEY_SECRET_BYTES).toString("base64url")
  const rawKey = `avk_live_${prefix}_${secret}`
  return {
    rawKey,
    prefix,
    keyHash: hashSecret(rawKey)
  }
}

export function createWebhookSigningSecret(): CreatedWebhookSecret {
  const prefix = randomBytes(WEBHOOK_SECRET_PREFIX_LENGTH / 2).toString("hex")
  const secret = randomBytes(32).toString("base64url")
  const rawSecret = `whsec_${prefix}_${secret}`
  return {
    rawSecret,
    prefix,
    secretHash: hashSecret(rawSecret)
  }
}

export function signWebhookPayload(payload: string, signingSecret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac("sha256", signingSecret).update(`${timestamp}.${payload}`).digest("hex")
  return `t=${timestamp},v1=${signature}`
}

export function normalizeApiKeyName(value: unknown): { name: string | null; error: string | null } {
  const name = normalizeText(value).replace(/\s+/g, " ")
  if (name.length < 3) {
    return { name: null, error: "Name must be at least 3 characters." }
  }

  if (name.length > 80) {
    return { name: null, error: "Name must be 80 characters or fewer." }
  }

  return { name, error: null }
}

export function normalizeWebhookUrl(value: unknown): { url: string | null; error: string | null } {
  const raw = normalizeText(value)
  if (!raw) {
    return { url: null, error: "Webhook URL is required." }
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { url: null, error: "Enter a valid HTTPS webhook URL." }
  }

  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    return { url: null, error: "Webhook URLs must use HTTPS outside local development." }
  }

  parsed.hash = ""
  return { url: parsed.toString(), error: null }
}

export function parseWebhookEvents(values: unknown[]): { events: WebhookEvent[]; error: string | null } {
  const selected = values
    .map(value => normalizeText(value))
    .filter((value): value is WebhookEvent => WEBHOOK_EVENTS.includes(value as WebhookEvent))
  const events = [...new Set(selected)]
  if (events.length === 0) {
    return { events: [], error: "Select at least one webhook event." }
  }

  return { events, error: null }
}

export async function authenticatePublicApiRequest(request: Request, requiredScope: PublicApiScope): Promise<PublicApiContext> {
  const token = parseBearerToken(request)
  const parsed = token ? parsePublicApiKey(token) : null
  if (!parsed) {
    throw new PublicApiError(401, "invalid_api_key", "Provide a valid Bearer API key.")
  }

  const key = await prisma.apiKey.findUnique({
    where: { prefix: parsed.prefix },
    select: {
      id: true,
      workspaceId: true,
      keyHash: true,
      scopes: true,
      revokedAt: true
    }
  })

  if (!key || key.revokedAt || !safeCompareHex(hashSecret(parsed.rawKey), key.keyHash)) {
    throw new PublicApiError(401, "invalid_api_key", "API key is invalid or revoked.")
  }

  if (!key.scopes.includes(requiredScope) && !key.scopes.includes("*")) {
    throw new PublicApiError(403, "scope_forbidden", `API key is missing ${requiredScope}.`)
  }

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() }
  }).catch(() => undefined)

  return {
    workspaceId: key.workspaceId,
    apiKeyId: key.id,
    apiKeyPrefix: parsed.prefix,
    scopes: key.scopes
  }
}

export async function listApiKeysForWorkspace(workspaceId: string) {
  return prisma.apiKey.findMany({
    where: { workspaceId },
    select: apiKeySelect(),
    orderBy: { createdAt: "desc" }
  })
}

export async function listWebhookEndpointsForWorkspace(workspaceId: string) {
  return prisma.webhookEndpoint.findMany({
    where: { workspaceId },
    select: webhookEndpointSelect(),
    orderBy: { createdAt: "desc" }
  })
}

export async function getPublicAvatarConfig(context: PublicApiContext, avatarId: string) {
  const avatar = await fetchAvatarByIdAndWorkspace(context.workspaceId, avatarId)
  if (!avatar || !isAvatarPublicRuntimeEligible(avatar) || avatar.status !== AvatarStatus.PUBLISHED) {
    throw new PublicApiError(404, "avatar_unavailable", "Avatar is not available for public API use.")
  }

  const supportedOutputModes: PublicApiOutputMode[] = ["text"]

  return {
    id: avatar.id,
    displayName: avatar.displayName,
    role: avatar.role,
    useCase: avatar.useCase,
    language: avatar.language,
    status: avatar.status,
    supportedOutputModes,
    defaultOutputMode: "text",
    publishedAt: avatar.publishedAt?.toISOString() ?? null
  }
}

export async function startPublicApiConversation(context: PublicApiContext, body: unknown) {
  const payload = parseJsonObject(body)
  const avatarId = normalizeText(payload.avatarId)
  if (!avatarId) {
    throw new PublicApiError(400, "avatar_required", "avatarId is required.")
  }

  const avatar = await fetchAvatarByIdAndWorkspace(context.workspaceId, avatarId)
  if (!avatar || !isAvatarPublicRuntimeEligible(avatar) || avatar.status !== AvatarStatus.PUBLISHED) {
    throw new PublicApiError(404, "avatar_unavailable", "Avatar is not available for public API use.")
  }

  const visitorId = parseVisitorId(payload.visitorId)
  const conversation = await prisma.conversation.create({
    data: {
      workspaceId: context.workspaceId,
      avatarId: avatar.id,
      visitorId,
      channel: ConversationChannel.API,
      status: ConversationStatus.ACTIVE,
      summary: normalizeText(payload.summary) || null
    },
    select: {
      id: true,
      status: true,
      createdAt: true
    }
  })

  await recordUsageEvent({
    workspaceId: context.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    eventType: "api.conversation.started",
    quantity: 1,
    unit: "count",
    metadata: {
      channel: ConversationChannel.API,
      visitorId,
      apiKeyPrefix: context.apiKeyPrefix
    },
    idempotencyKey: `api-conversation-started:${conversation.id}`
  })

  await createPublicApiRuntimeTrace({
    workspaceId: context.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    eventType: "api.conversation.started",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      apiKeyPrefix: context.apiKeyPrefix
    }
  })

  return {
    conversationId: conversation.id,
    avatarId: avatar.id,
    visitorId,
    status: conversation.status,
    createdAt: conversation.createdAt.toISOString()
  }
}

export async function getPublicApiConversationStatus(context: PublicApiContext, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: context.workspaceId,
      channel: ConversationChannel.API
    },
    select: {
      id: true,
      avatarId: true,
      visitorId: true,
      status: true,
      summary: true,
      createdAt: true,
      updatedAt: true,
      endedAt: true,
      _count: {
        select: { messages: true }
      }
    }
  })

  if (!conversation) {
    throw new PublicApiError(404, "conversation_not_found", "Conversation was not found.")
  }

  return {
    conversationId: conversation.id,
    avatarId: conversation.avatarId,
    visitorId: conversation.visitorId,
    status: conversation.status,
    summary: conversation.summary,
    messageCount: conversation._count.messages,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    endedAt: conversation.endedAt?.toISOString() ?? null
  }
}

async function createPublicApiRuntimeTrace(params: {
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

export async function sendPublicApiConversationMessage(context: PublicApiContext, conversationId: string, body: unknown) {
  const payload = parseJsonObject(body)
  const inputText = normalizeText(payload.message)
  if (inputText.length < PUBLIC_API_MESSAGE_MIN_LENGTH) {
    throw new PublicApiError(400, "message_too_short", "Enter at least two characters.")
  }

  if (!isTextLengthSafe(inputText, PUBLIC_API_MESSAGE_MAX_LENGTH)) {
    throw new PublicApiError(400, "message_too_long", `Message must be ${PUBLIC_API_MESSAGE_MAX_LENGTH} characters or fewer.`)
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: context.workspaceId,
      channel: ConversationChannel.API,
      status: ConversationStatus.ACTIVE
    },
    select: {
      id: true,
      avatarId: true,
      visitorId: true
    }
  })

  if (!conversation) {
    throw new PublicApiError(404, "conversation_not_found", "Active API conversation was not found.")
  }

  const avatar = await fetchAvatarByIdAndWorkspace(context.workspaceId, conversation.avatarId)
  if (!avatar || !isAvatarPublicRuntimeEligible(avatar) || avatar.status !== AvatarStatus.PUBLISHED) {
    throw new PublicApiError(404, "avatar_unavailable", "Avatar is not available for public API use.")
  }

  const outputMode = parseOutputMode(payload.outputMode)
  const visitorMessageId = randomUUID()
  await prisma.message.create({
    data: {
      id: visitorMessageId,
      conversationId: conversation.id,
      role: MessageRole.VISITOR,
      content: inputText,
      metadata: {
        channel: ConversationChannel.API,
        apiKeyPrefix: context.apiKeyPrefix
      }
    }
  })

  const visitorMessageCount = await prisma.message.count({
    where: {
      conversationId: conversation.id,
      role: MessageRole.VISITOR
    }
  })

  await createPublicApiRuntimeTrace({
    workspaceId: context.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    eventType: "api.message.received",
    status: RuntimeTraceStatus.SUCCESS
  })

  const knowledgeChunks = await fetchRelevantKnowledgeChunksForPreview({
    workspaceId: context.workspaceId,
    messageText: inputText
  })
  const currentSourcePhoto = getCurrentSourcePhoto(avatar)
  let runtimeResponse: RuntimeResponse

  try {
    runtimeResponse = await sendRuntimeTextMessage({
      workspaceId: context.workspaceId,
      avatarId: avatar.id,
      conversationId: conversation.id,
      messageId: visitorMessageId,
      channel: "API",
      inputType: "text",
      inputText,
      outputMode,
      visitorMessageCount,
      avatarConfig: {
        avatarId: avatar.id,
        greeting: avatar.greeting,
        tone: avatar.tone,
        answerStyle: avatar.answerStyle,
        businessInstructions: avatar.businessInstructions,
        fallbackMessage: avatar.fallbackMessage,
        leadCapturePreference: avatar.leadCapturePreference,
        handoffPreference: avatar.handoffPreference,
        language: avatar.language
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
      avatarPhotoReference: currentSourcePhoto ? {
        assetId: currentSourcePhoto.id,
        url: currentSourcePhoto.displayUrl,
        mimeType: currentSourcePhoto.mimeType,
        width: currentSourcePhoto.width,
        height: currentSourcePhoto.height
      } : null,
      knowledgeChunks
    })
  } catch {
    runtimeResponse = {
      conversationId: conversation.id,
      messageId: visitorMessageId,
      status: "error",
      answer: "Runtime request failed. Please try again.",
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

  const avatarMessageId = randomUUID()
  await prisma.message.create({
    data: {
      id: avatarMessageId,
      conversationId: conversation.id,
      role: MessageRole.AVATAR,
      content: runtimeResponse.answer || "",
      audioUrl: null,
      videoUrl: null,
      metadata: {
        runtimeStatus: runtimeResponse.status,
        usage: runtimeResponse.usage,
        outputMode,
        sourceReferenceCount: runtimeResponse.sourceReferences.length,
        intent: runtimeResponse.intent ?? null,
        confidence: runtimeResponse.confidence ?? null,
        handoffDecision: runtimeResponse.handoffDecision,
        leadCaptureDecision: runtimeResponse.leadCaptureDecision,
        leadCapture: runtimeResponse.leadCapture,
        safetyReason: runtimeResponse.safetyReason ?? null,
        safetyEventCount: runtimeResponse.safetyEvents?.length ?? 0,
        safetyAction: runtimeResponse.safetyEvents?.[0]?.action ?? null,
        channel: ConversationChannel.API,
        apiKeyPrefix: context.apiKeyPrefix
      }
    }
  })

  await recordRuntimeSafetyEvents({
    workspaceId: context.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    inputMessageId: visitorMessageId,
    outputMessageId: avatarMessageId,
    source: SafetySource.API_RUNTIME,
    inputText,
    outputText: runtimeResponse.answer || "",
    safetyEvents: runtimeResponse.safetyEvents ?? []
  })

  await recordRuntimeKnowledgeGap({
    workspaceId: context.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    messageId: visitorMessageId,
    question: inputText,
    source: KnowledgeGapSource.API_RUNTIME,
    runtimeResponse
  })

  await recordUsageEvents([
    buildConversationMessageUsageEvent({
      workspaceId: context.workspaceId,
      avatarId: avatar.id,
      conversationId: conversation.id,
      messageId: visitorMessageId,
      role: MessageRole.VISITOR,
      channel: ConversationChannel.API
    }),
    buildConversationMessageUsageEvent({
      workspaceId: context.workspaceId,
      avatarId: avatar.id,
      conversationId: conversation.id,
      messageId: avatarMessageId,
      role: MessageRole.AVATAR,
      channel: ConversationChannel.API
    }),
    ...buildRuntimeResponseUsageEvents({
      workspaceId: context.workspaceId,
      avatarId: avatar.id,
      conversationId: conversation.id,
      inputMessageId: visitorMessageId,
      outputMessageId: avatarMessageId,
      inputType: "text",
      outputMode
    }, runtimeResponse)
  ])

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() }
  })

  await createPublicApiRuntimeTrace({
    workspaceId: context.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    eventType: "api.response.saved",
    status: runtimeResponse.status === "error" ? RuntimeTraceStatus.FAILURE : RuntimeTraceStatus.SUCCESS,
    metadata: {
      runtimeStatus: runtimeResponse.status,
      outputMode,
      apiKeyPrefix: context.apiKeyPrefix
    }
  })

  return {
    conversationId: conversation.id,
    visitorMessageId,
    avatarMessage: {
      id: avatarMessageId,
      content: runtimeResponse.answer || "",
      audioUrl: null,
      videoUrl: null,
      outputMode,
      runtimeStatus: runtimeResponse.status,
      leadCapture: runtimeResponse.leadCapture
    }
  }
}

export async function submitPublicApiLead(context: PublicApiContext, conversationId: string, body: unknown) {
  const parsed = validateLeadPayload({
    ...parseJsonObject(body),
    conversationId
  })

  if (Object.keys(parsed.errors).length > 0) {
    throw new PublicApiError(400, "invalid_lead", Object.values(parsed.errors)[0] ?? "Lead details are invalid.")
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: parsed.values.conversationId,
      workspaceId: context.workspaceId,
      channel: ConversationChannel.API
    },
    select: {
      id: true,
      avatarId: true,
      lead: {
        select: { id: true }
      }
    }
  })

  if (!conversation) {
    throw new PublicApiError(404, "conversation_not_found", "Conversation was not found.")
  }

  const avatar = await fetchAvatarByIdAndWorkspace(context.workspaceId, conversation.avatarId)
  if (!avatar || !isAvatarPublicRuntimeEligible(avatar) || avatar.status !== AvatarStatus.PUBLISHED) {
    throw new PublicApiError(404, "avatar_unavailable", "Avatar is not available for public API use.")
  }

  const leadSafety = assessLeadInputSafety(parsed.values)
  if (leadSafety) {
    await recordSafetyEvent({
      workspaceId: context.workspaceId,
      avatarId: avatar.id,
      conversationId: conversation.id,
      eventType: leadSafety.eventType,
      severity: leadSafety.severity,
      action: leadSafety.action,
      source: SafetySource.LEAD_CAPTURE,
      inputExcerpt: [
        parsed.values.name,
        parsed.values.email,
        parsed.values.phone,
        parsed.values.message
      ].filter(Boolean).join(" "),
      reason: leadSafety.reason,
      metadata: {
        ...leadSafety.metadata,
        channel: ConversationChannel.API,
        apiKeyPrefix: context.apiKeyPrefix
      }
    })

    if (leadSafety.action === SafetyAction.BLOCK) {
      throw new PublicApiError(400, "lead_safety_blocked", "Lead details could not be accepted because the message appears unsafe.")
    }
  }

  const duplicateBehavior = conversation.lead ? "updated" : "created"
  const lead = await prisma.lead.upsert({
    where: { conversationId: conversation.id },
    create: {
      workspaceId: context.workspaceId,
      avatarId: avatar.id,
      conversationId: conversation.id,
      source: LeadSource.API,
      status: LeadStatus.NEW,
      name: parsed.values.name,
      email: parsed.values.email,
      phone: parsed.values.phone,
      message: parsed.values.message,
      metadata: {
        channel: ConversationChannel.API,
        apiKeyPrefix: context.apiKeyPrefix,
        safetyFlagged: Boolean(leadSafety),
        safetyReason: leadSafety?.reason ?? null
      }
    },
    update: {
      avatarId: avatar.id,
      name: parsed.values.name ?? undefined,
      email: parsed.values.email ?? undefined,
      phone: parsed.values.phone ?? undefined,
      message: parsed.values.message ?? undefined,
      metadata: {
        channel: ConversationChannel.API,
        apiKeyPrefix: context.apiKeyPrefix,
        duplicateBehavior: "updated_existing_primary_lead",
        safetyFlagged: Boolean(leadSafety),
        safetyReason: leadSafety?.reason ?? null
      }
    },
    select: {
      id: true,
      status: true
    }
  })

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() }
  })

  await createPublicApiRuntimeTrace({
    workspaceId: context.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    eventType: duplicateBehavior === "created" ? "api.lead.created" : "api.lead.updated",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      leadId: lead.id,
      apiKeyPrefix: context.apiKeyPrefix
    }
  })

  return {
    leadId: lead.id,
    status: lead.status,
    duplicateBehavior
  }
}
