import { randomUUID } from "node:crypto"
import {
  AvatarAssetType,
  AvatarAssetValidationStatus,
  AvatarStatus,
  ConversationChannel,
  ConversationStatus,
  KnowledgeGapSource,
  MessageRole,
  RuntimeTraceStatus,
  SafetySource,
  WidgetPosition,
  WidgetTheme,
  type Prisma
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  buildAvatarAudioDisplayUrl,
  buildAvatarAudioStorageKey,
  buildAvatarVideoDisplayUrl,
  buildAvatarVideoStorageKey,
  deleteAvatarAssetFromDisk,
  readAvatarAssetFromDisk,
  writeAvatarAssetToDisk
} from "@/lib/avatar-asset-storage"
import {
  fetchAvatarByIdAndWorkspace,
  getCurrentSourcePhoto,
  hasActiveSelectedVoice,
  hasCurrentPhotoConsent,
  isAvatarPublicRuntimeEligible,
  isTextLengthSafe,
  type AvatarRecord
} from "@/lib/avatar"
import { isVoiceLanguageCompatible } from "@/lib/avatar-voice-shared"
import { fetchRelevantKnowledgeChunksForPreview } from "@/lib/avatar-runtime-retrieval"
import { sendRuntimeTextMessage, type RuntimeLeadCapture, type RuntimeResponse } from "@/lib/avatar-runtime-client"
import {
  buildConversationMessageUsageEvent,
  buildRuntimeResponseUsageEvents,
  recordUsageEvent,
  recordUsageEvents
} from "@/lib/usage"
import { recordRuntimeSafetyEvents } from "@/lib/safety"
import { recordRuntimeKnowledgeGap } from "@/lib/knowledge-gap"

export const WIDGET_THEMES = ["light"] as const
export const WIDGET_POSITIONS = ["bottom-right", "bottom-left"] as const

export type WidgetThemeValue = (typeof WIDGET_THEMES)[number]
export type WidgetPositionValue = (typeof WIDGET_POSITIONS)[number]
export type WidgetOutputMode = "text" | "audio" | "video"

export type WidgetSettingsRecord = {
  id: string
  workspaceId: string
  avatarId: string
  theme: WidgetThemeValue
  position: WidgetPositionValue
  greetingEnabled: boolean
  greetingText: string
  primaryColor: string | null
}

export type AllowedDomainRecord = {
  id: string
  workspaceId: string
  domain: string
  createdAt: Date
}

export type WidgetPublicConfig = {
  avatarId: string
  displayName: string
  role: string
  initials: string
  greetingEnabled: boolean
  greetingText: string
  theme: WidgetThemeValue
  position: WidgetPositionValue
  primaryColor: string | null
  supportedOutputModes: WidgetOutputMode[]
  defaultOutputMode: WidgetOutputMode
}

export type WidgetMessageResponse = {
  conversationId: string
  visitorId: string
  visitorMessageId: string
  avatarMessage: {
    id: string
    content: string
    audioUrl: string | null
    videoUrl: string | null
    outputMode: WidgetOutputMode
    runtimeStatus: RuntimeResponse["status"]
    leadCapture: RuntimeLeadCapture
  }
}

export class WidgetPublicError extends Error {
  statusCode: number
  code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

const WIDGET_MESSAGE_MIN_LENGTH = 2
const WIDGET_MESSAGE_MAX_LENGTH = 800
const WIDGET_VISITOR_ID_MAX_LENGTH = 120
const WIDGET_RATE_LIMIT_WINDOW_MS = 60_000
const WIDGET_RATE_LIMIT_MAX_MESSAGES = 20
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

function normalizeText(value: unknown): string {
  return String(value ?? "").trim()
}

function normalizeColor(value: unknown): string | null {
  const raw = normalizeText(value)
  if (!raw) {
    return null
  }

  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.toLowerCase()
  }

  return null
}

function mapThemeToDb(theme: WidgetThemeValue): WidgetTheme {
  return theme === "light" ? WidgetTheme.LIGHT : WidgetTheme.LIGHT
}

function mapPositionToDb(position: WidgetPositionValue): WidgetPosition {
  return position === "bottom-left" ? WidgetPosition.BOTTOM_LEFT : WidgetPosition.BOTTOM_RIGHT
}

export function mapWidgetTheme(theme: WidgetTheme | string | null | undefined): WidgetThemeValue {
  return theme === WidgetTheme.LIGHT || theme === "LIGHT" ? "light" : "light"
}

export function mapWidgetPosition(position: WidgetPosition | string | null | undefined): WidgetPositionValue {
  return position === WidgetPosition.BOTTOM_LEFT || position === "BOTTOM_LEFT" ? "bottom-left" : "bottom-right"
}

export function parseWidgetTheme(value: unknown): WidgetThemeValue {
  return normalizeText(value) === "light" ? "light" : "light"
}

export function parseWidgetPosition(value: unknown): WidgetPositionValue {
  return normalizeText(value) === "bottom-left" ? "bottom-left" : "bottom-right"
}

export function getWidgetInitials(displayName: string): string {
  const parts = displayName
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, 2)

  const initials = parts.map(part => part[0]?.toUpperCase()).join("")
  return initials || "AI"
}

export function normalizeAllowedDomainInput(input: unknown): {
  domain: string | null
  error: string | null
} {
  const raw = normalizeText(input).toLowerCase()
  if (!raw) {
    return { domain: null, error: "Domain is required." }
  }

  let hostname = raw
  if (raw.includes("://")) {
    try {
      const parsed = new URL(raw)
      if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
        return { domain: null, error: "Enter a domain without path, query, or hash." }
      }
      hostname = parsed.hostname
    } catch {
      return { domain: null, error: "Enter a valid domain." }
    }
  }

  if (hostname.includes("/") || hostname.includes("?") || hostname.includes("#")) {
    return { domain: null, error: "Enter a domain without path, query, or hash." }
  }

  hostname = hostname.replace(/^\.+|\.+$/g, "")
  if (!hostname) {
    return { domain: null, error: "Enter a valid domain." }
  }

  if (hostname.length > 253) {
    return { domain: null, error: "Domain is too long." }
  }

  if (
    hostname !== "localhost" &&
    hostname !== "127.0.0.1" &&
    hostname !== "::1" &&
    !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)
  ) {
    return { domain: null, error: "Enter a valid hostname such as example.com." }
  }

  return { domain: hostname, error: null }
}

export function getRequestOriginDomain(request: Request): string | null {
  const origin = request.headers.get("origin") || request.headers.get("referer")
  if (!origin) {
    return null
  }

  try {
    const parsed = new URL(origin)
    return parsed.hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isDevelopmentLocalDomain(domain: string | null): boolean {
  if (process.env.NODE_ENV === "production") {
    return false
  }

  return domain === "localhost" || domain === "127.0.0.1" || domain === "::1" || Boolean(domain?.endsWith(".localhost"))
}

export async function assertWidgetDomainAllowed(workspaceId: string, request: Request): Promise<{
  domain: string
  allowedDomainCount: number
  allowedByDevelopmentLocalhost: boolean
}> {
  const domain = getRequestOriginDomain(request)
  if (!domain) {
    throw new WidgetPublicError(403, "missing_origin", "Widget requests require an Origin or Referer header.")
  }

  const allowedByDevelopmentLocalhost = isDevelopmentLocalDomain(domain)
  const allowedDomainCount = await prisma.allowedDomain.count({ where: { workspaceId } })
  if (allowedByDevelopmentLocalhost) {
    return { domain, allowedDomainCount, allowedByDevelopmentLocalhost }
  }

  if (allowedDomainCount === 0) {
    throw new WidgetPublicError(403, "domain_allowlist_required", "This workspace has no allowed widget domains configured.")
  }

  const allowedDomain = await prisma.allowedDomain.findUnique({
    where: {
      workspaceId_domain: {
        workspaceId,
        domain
      }
    },
    select: { id: true }
  })

  if (!allowedDomain) {
    throw new WidgetPublicError(403, "domain_not_allowed", "This domain is not allowed to load the widget.")
  }

  return { domain, allowedDomainCount, allowedByDevelopmentLocalhost }
}

export function buildWidgetCorsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin"
  }
}

export function buildWidgetSettingsRecord(raw: {
  id: string
  workspaceId: string
  avatarId: string
  theme: WidgetTheme | string
  position: WidgetPosition | string
  greetingEnabled: boolean
  greetingText: string
  primaryColor: string | null
}): WidgetSettingsRecord {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId,
    avatarId: raw.avatarId,
    theme: mapWidgetTheme(raw.theme),
    position: mapWidgetPosition(raw.position),
    greetingEnabled: raw.greetingEnabled,
    greetingText: raw.greetingText,
    primaryColor: raw.primaryColor
  }
}

export function getDefaultWidgetSettings(avatar: Pick<AvatarRecord, "id" | "workspaceId" | "greeting">): Omit<WidgetSettingsRecord, "id"> {
  return {
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    theme: "light",
    position: "bottom-right",
    greetingEnabled: true,
    greetingText: avatar.greeting,
    primaryColor: null
  }
}

export async function fetchOrCreateWidgetSettings(avatar: Pick<AvatarRecord, "id" | "workspaceId" | "greeting">): Promise<WidgetSettingsRecord> {
  const existing = await prisma.widgetSettings.findUnique({
    where: { avatarId: avatar.id }
  })

  if (existing) {
    return buildWidgetSettingsRecord(existing)
  }

  const created = await prisma.widgetSettings.create({
    data: {
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      theme: WidgetTheme.LIGHT,
      position: WidgetPosition.BOTTOM_RIGHT,
      greetingEnabled: true,
      greetingText: avatar.greeting
    }
  })

  return buildWidgetSettingsRecord(created)
}

export async function fetchWidgetSettingsOrDefault(avatar: Pick<AvatarRecord, "id" | "workspaceId" | "greeting">): Promise<WidgetSettingsRecord> {
  const existing = await prisma.widgetSettings.findUnique({
    where: { avatarId: avatar.id }
  })

  if (existing) {
    return buildWidgetSettingsRecord(existing)
  }

  return {
    id: "",
    ...getDefaultWidgetSettings(avatar)
  }
}

export async function fetchAllowedDomainsForWorkspace(workspaceId: string): Promise<AllowedDomainRecord[]> {
  return prisma.allowedDomain.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      workspaceId: true,
      domain: true,
      createdAt: true
    }
  })
}

export function resolveWidgetOutputModes(avatar: AvatarRecord): {
  supportedOutputModes: WidgetOutputMode[]
  defaultOutputMode: WidgetOutputMode
} {
  const supportedOutputModes: WidgetOutputMode[] = ["text"]
  const hasUsableVoice = Boolean(
    hasActiveSelectedVoice(avatar) &&
      avatar.voice &&
      isVoiceLanguageCompatible(avatar.language, avatar.voice.language)
  )
  const currentPhoto = getCurrentSourcePhoto(avatar)

  if (hasUsableVoice) {
    supportedOutputModes.push("audio")
  }

  if (hasUsableVoice && currentPhoto && hasCurrentPhotoConsent(avatar)) {
    supportedOutputModes.push("video")
  }

  return {
    supportedOutputModes,
    defaultOutputMode: supportedOutputModes.includes("video")
      ? "video"
      : supportedOutputModes.includes("audio")
        ? "audio"
        : "text"
  }
}

export async function getPublicWidgetConfig(avatarId: string, request: Request): Promise<WidgetPublicConfig> {
  const avatarRow = await prisma.avatar.findUnique({
    where: { id: avatarId },
    select: { workspaceId: true }
  })

  if (!avatarRow) {
    throw new WidgetPublicError(404, "avatar_not_found", "Avatar was not found.")
  }

  await assertWidgetDomainAllowed(avatarRow.workspaceId, request)

  const avatar = await fetchAvatarByIdAndWorkspace(avatarRow.workspaceId, avatarId)
  if (!avatar || !isAvatarPublicRuntimeEligible(avatar) || avatar.status === AvatarStatus.SUSPENDED) {
    throw new WidgetPublicError(404, "avatar_unavailable", "Avatar is not available for public widget use.")
  }

  const settings = await fetchWidgetSettingsOrDefault(avatar)
  const modes = resolveWidgetOutputModes(avatar)

  return {
    avatarId: avatar.id,
    displayName: avatar.displayName,
    role: avatar.role,
    initials: getWidgetInitials(avatar.displayName),
    greetingEnabled: settings.greetingEnabled,
    greetingText: settings.greetingText,
    theme: settings.theme,
    position: settings.position,
    primaryColor: settings.primaryColor,
    ...modes
  }
}

function parseWidgetOutputMode(value: unknown, avatar: AvatarRecord): WidgetOutputMode {
  const requested = normalizeText(value)
  const modes = resolveWidgetOutputModes(avatar)
  if (requested === "audio" && modes.supportedOutputModes.includes("audio")) {
    return "audio"
  }

  if (requested === "video" && modes.supportedOutputModes.includes("video")) {
    return "video"
  }

  return modes.defaultOutputMode
}

function parseVisitorId(value: unknown): string {
  const visitorId = normalizeText(value)
  if (visitorId && isTextLengthSafe(visitorId, WIDGET_VISITOR_ID_MAX_LENGTH) && /^[a-zA-Z0-9_-]+$/.test(visitorId)) {
    return visitorId
  }

  return randomUUID()
}

function getRequestIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown"
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown"
}

function enforceWidgetRateLimit(params: {
  avatarId: string
  visitorId: string
  domain: string
  ip: string
}): void {
  const now = Date.now()
  const key = `${params.avatarId}:${params.visitorId}:${params.domain}:${params.ip}`
  const bucket = rateLimitBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + WIDGET_RATE_LIMIT_WINDOW_MS })
    return
  }

  if (bucket.count >= WIDGET_RATE_LIMIT_MAX_MESSAGES) {
    throw new WidgetPublicError(429, "rate_limited", "Too many widget messages. Try again shortly.")
  }

  bucket.count += 1
}

async function createRuntimeTrace(params: {
  workspaceId: string
  avatarId?: string | null
  conversationId?: string | null
  eventType: string
  status: RuntimeTraceStatus
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  try {
    await prisma.runtimeTrace.create({
      data: {
        workspaceId: params.workspaceId,
        avatarId: params.avatarId ?? null,
        conversationId: params.conversationId ?? null,
        eventType: params.eventType,
        status: params.status,
        metadata: params.metadata ?? null
      }
    })
  } catch {
    return
  }
}

async function persistWidgetRuntimeSafetyState(params: {
  workspaceId: string
  avatarId: string
  conversationId: string
  inputMessageId: string
  outputMessageId: string
  inputText: string
  outputText: string
  runtimeResponse: RuntimeResponse
}): Promise<void> {
  const safetyEvents = params.runtimeResponse.safetyEvents ?? []
  await createRuntimeTrace({
    workspaceId: params.workspaceId,
    avatarId: params.avatarId,
    conversationId: params.conversationId,
    eventType: "safety.pre_check.started",
    status: RuntimeTraceStatus.STARTED
  })
  await createRuntimeTrace({
    workspaceId: params.workspaceId,
    avatarId: params.avatarId,
    conversationId: params.conversationId,
    eventType: "safety.pre_check.completed",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      safetyEventCount: safetyEvents.length,
      status: params.runtimeResponse.status
    }
  })
  await createRuntimeTrace({
    workspaceId: params.workspaceId,
    avatarId: params.avatarId,
    conversationId: params.conversationId,
    eventType: "safety.post_check.started",
    status: RuntimeTraceStatus.STARTED
  })
  await createRuntimeTrace({
    workspaceId: params.workspaceId,
    avatarId: params.avatarId,
    conversationId: params.conversationId,
    eventType: "safety.post_check.completed",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      rewritten: safetyEvents.some(event => event.action === "REWRITE"),
      blocked: params.runtimeResponse.status === "blocked",
      handoffDecision: params.runtimeResponse.handoffDecision
    }
  })

  if (params.runtimeResponse.status === "blocked" || safetyEvents.some(event => event.action === "BLOCK" || event.action === "REFUSE")) {
    await createRuntimeTrace({
      workspaceId: params.workspaceId,
      avatarId: params.avatarId,
      conversationId: params.conversationId,
      eventType: "safety.blocked",
      status: RuntimeTraceStatus.SUCCESS,
      metadata: {
        reason: params.runtimeResponse.safetyReason ?? null
      }
    })
  }

  if (safetyEvents.some(event => event.action === "REWRITE")) {
    await createRuntimeTrace({
      workspaceId: params.workspaceId,
      avatarId: params.avatarId,
      conversationId: params.conversationId,
      eventType: "safety.rewritten",
      status: RuntimeTraceStatus.SUCCESS,
      metadata: {
        reason: params.runtimeResponse.safetyReason ?? null
      }
    })
  }

  if (params.runtimeResponse.handoffDecision === "request" && safetyEvents.some(event => event.handoffRequired)) {
    await createRuntimeTrace({
      workspaceId: params.workspaceId,
      avatarId: params.avatarId,
      conversationId: params.conversationId,
      eventType: "safety.handoff_forced",
      status: RuntimeTraceStatus.SUCCESS,
      metadata: {
        reason: params.runtimeResponse.safetyReason ?? null
      }
    })
  }

  const persistedCount = await recordRuntimeSafetyEvents({
    workspaceId: params.workspaceId,
    avatarId: params.avatarId,
    conversationId: params.conversationId,
    inputMessageId: params.inputMessageId,
    outputMessageId: params.outputMessageId,
    source: SafetySource.WIDGET_RUNTIME,
    inputText: params.inputText,
    outputText: params.outputText,
    safetyEvents
  })

  if (safetyEvents.length > 0) {
    await createRuntimeTrace({
      workspaceId: params.workspaceId,
      avatarId: params.avatarId,
      conversationId: params.conversationId,
      eventType: persistedCount === safetyEvents.length ? "safety.event.persisted" : "safety.event_failed",
      status: persistedCount === safetyEvents.length ? RuntimeTraceStatus.SUCCESS : RuntimeTraceStatus.FAILURE,
      metadata: {
        attemptedCount: safetyEvents.length,
        persistedCount
      }
    })
  }
}

async function resolveWidgetConversation(params: {
  workspaceId: string
  avatarId: string
  conversationId: string
  visitorId: string
}): Promise<{ id: string; created: boolean }> {
  if (params.conversationId) {
    const existing = await prisma.conversation.findFirst({
      where: {
        id: params.conversationId,
        workspaceId: params.workspaceId,
        avatarId: params.avatarId,
        channel: ConversationChannel.WIDGET,
        status: ConversationStatus.ACTIVE
      },
      select: { id: true }
    })

    if (existing) {
      return { id: existing.id, created: false }
    }
  }

  const visitorConversation = await prisma.conversation.findFirst({
    where: {
      workspaceId: params.workspaceId,
      avatarId: params.avatarId,
      visitorId: params.visitorId,
      channel: ConversationChannel.WIDGET,
      status: ConversationStatus.ACTIVE
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true }
  })

  if (visitorConversation) {
    return { id: visitorConversation.id, created: false }
  }

  const created = await prisma.conversation.create({
    data: {
      workspaceId: params.workspaceId,
      avatarId: params.avatarId,
      visitorId: params.visitorId,
      channel: ConversationChannel.WIDGET,
      status: ConversationStatus.ACTIVE
    },
    select: { id: true }
  })

  return { id: created.id, created: true }
}

function buildPublicMediaUrl(messageId: string, token: string, kind: "audio" | "video"): string {
  return `/api/widget/media/${messageId}?kind=${kind}&token=${encodeURIComponent(token)}`
}

async function persistWidgetRuntimeMedia(params: {
  runtimeResponse: RuntimeResponse
  workspaceId: string
  avatarId: string
  conversationId: string
  avatarMessageId: string
  outputMode: WidgetOutputMode
  publicMediaToken: string
}): Promise<{
  audioUrl: string | null
  videoUrl: string | null
  audioAssetId: string | null
  videoAssetId: string | null
  audioErrorMessage: string | null
  videoErrorMessage: string | null
  audioUsage: Record<string, unknown> | null
  videoUsage: Record<string, unknown> | null
  videoDurationSeconds: number | null
  videoProviderJobId: string | null
}> {
  let audioUrl: string | null = null
  let audioAssetId: string | null = null
  let audioErrorMessage: string | null = params.runtimeResponse.audioError?.message ?? null
  let audioUsage: Record<string, unknown> | null = params.runtimeResponse.audio?.usage ?? null
  let videoUrl: string | null = null
  let videoAssetId: string | null = null
  let videoErrorMessage: string | null = params.runtimeResponse.videoError?.message ?? null
  let videoUsage: Record<string, unknown> | null = params.runtimeResponse.video?.usage ?? null
  const videoDurationSeconds = typeof params.runtimeResponse.video?.durationSeconds === "number"
    ? params.runtimeResponse.video.durationSeconds
    : null
  const videoProviderJobId = params.runtimeResponse.video?.providerJobId ?? null

  if (params.outputMode === "audio" || params.outputMode === "video") {
    await createRuntimeTrace({
      workspaceId: params.workspaceId,
      avatarId: params.avatarId,
      conversationId: params.conversationId,
      eventType: "tts.started",
      status: RuntimeTraceStatus.STARTED
    })

    if (params.runtimeResponse.audio) {
      await createRuntimeTrace({
        workspaceId: params.workspaceId,
        avatarId: params.avatarId,
        conversationId: params.conversationId,
        eventType: "tts.completed",
        status: RuntimeTraceStatus.SUCCESS,
        metadata: {
          provider: params.runtimeResponse.audio.provider,
          mimeType: params.runtimeResponse.audio.mimeType
        }
      })

      const createdAudioAssetId = randomUUID()
      const fileExtension = params.runtimeResponse.audio.fileExtension || "bin"
      const storageKey = buildAvatarAudioStorageKey({
        workspaceId: params.workspaceId,
        avatarId: params.avatarId,
        conversationId: params.conversationId,
        messageId: params.avatarMessageId,
        assetId: createdAudioAssetId,
        fileExtension
      })

      try {
        const audioBytes = Buffer.from(params.runtimeResponse.audio.audioBase64, "base64")
        await writeAvatarAssetToDisk({ storageKey, content: audioBytes })
        const privateAudioUrl = buildAvatarAudioDisplayUrl(createdAudioAssetId)
        await prisma.avatarAsset.create({
          data: {
            id: createdAudioAssetId,
            workspaceId: params.workspaceId,
            avatarId: params.avatarId,
            type: AvatarAssetType.GENERATED_SPEECH_AUDIO,
            storageKey,
            displayUrl: privateAudioUrl,
            originalFileName: `widget-avatar-response-${params.avatarMessageId}.${fileExtension}`,
            mimeType: params.runtimeResponse.audio.mimeType,
            sizeBytes: audioBytes.byteLength,
            width: 0,
            height: 0,
            validationStatus: AvatarAssetValidationStatus.VALID,
            validationIssues: []
          }
        })
        await recordUsageEvent({
          workspaceId: params.workspaceId,
          avatarId: params.avatarId,
          conversationId: params.conversationId,
          messageId: null,
          eventType: "storage.bytes.uploaded",
          quantity: audioBytes.byteLength,
          unit: "bytes",
          metadata: {
            assetId: createdAudioAssetId,
            assetType: AvatarAssetType.GENERATED_SPEECH_AUDIO,
            mimeType: params.runtimeResponse.audio.mimeType,
            source: "widget_generated_audio"
          },
          idempotencyKey: `storage-upload:${createdAudioAssetId}`
        })
        audioAssetId = createdAudioAssetId
        audioUrl = buildPublicMediaUrl(params.avatarMessageId, params.publicMediaToken, "audio")
        await createRuntimeTrace({
          workspaceId: params.workspaceId,
          avatarId: params.avatarId,
          conversationId: params.conversationId,
          eventType: "audio.stored",
          status: RuntimeTraceStatus.SUCCESS,
          metadata: {
            assetId: createdAudioAssetId,
            storage: "public_widget_media_token"
          }
        })
      } catch {
        audioErrorMessage = "Audio was generated but could not be stored."
        await deleteAvatarAssetFromDisk(storageKey).catch(() => undefined)
        await createRuntimeTrace({
          workspaceId: params.workspaceId,
          avatarId: params.avatarId,
          conversationId: params.conversationId,
          eventType: "audio.failed",
          status: RuntimeTraceStatus.FAILURE,
          metadata: { reason: "storage_failed" }
        })
      }
    } else {
      await createRuntimeTrace({
        workspaceId: params.workspaceId,
        avatarId: params.avatarId,
        conversationId: params.conversationId,
        eventType: "tts.failed",
        status: RuntimeTraceStatus.FAILURE,
        metadata: {
          reason: params.runtimeResponse.audioError?.code ?? "missing_audio",
          message: params.runtimeResponse.audioError?.message ?? "TTS provider did not return audio.",
          provider: params.runtimeResponse.audioError?.provider ?? null
        }
      })
    }
  }

  if (params.outputMode === "video") {
    if (params.runtimeResponse.video && params.runtimeResponse.video.status === "completed") {
      await createRuntimeTrace({
        workspaceId: params.workspaceId,
        avatarId: params.avatarId,
        conversationId: params.conversationId,
        eventType: "avatar_video.completed",
        status: RuntimeTraceStatus.SUCCESS,
        metadata: {
          provider: params.runtimeResponse.video.provider,
          providerJobId: params.runtimeResponse.video.providerJobId ?? null
        }
      })

      if (params.runtimeResponse.video.videoBase64) {
        const createdVideoAssetId = randomUUID()
        const videoMimeType = params.runtimeResponse.video.mimeType || "video/mp4"
        const fileExtension = params.runtimeResponse.video.fileExtension ||
          (videoMimeType.includes("webm") ? "webm" : videoMimeType.includes("quicktime") ? "mov" : "mp4")
        const storageKey = buildAvatarVideoStorageKey({
          workspaceId: params.workspaceId,
          avatarId: params.avatarId,
          conversationId: params.conversationId,
          messageId: params.avatarMessageId,
          assetId: createdVideoAssetId,
          fileExtension
        })

        try {
          const videoBytes = Buffer.from(params.runtimeResponse.video.videoBase64, "base64")
          await writeAvatarAssetToDisk({ storageKey, content: videoBytes })
          const privateVideoUrl = buildAvatarVideoDisplayUrl(createdVideoAssetId)
          await prisma.avatarAsset.create({
            data: {
              id: createdVideoAssetId,
              workspaceId: params.workspaceId,
              avatarId: params.avatarId,
              type: AvatarAssetType.GENERATED_AVATAR_VIDEO,
              storageKey,
              displayUrl: privateVideoUrl,
              originalFileName: `widget-avatar-response-${params.avatarMessageId}.${fileExtension}`,
              mimeType: videoMimeType,
              sizeBytes: videoBytes.byteLength,
              width: 0,
              height: 0,
              validationStatus: AvatarAssetValidationStatus.VALID,
              validationIssues: []
            }
          })
          await recordUsageEvent({
            workspaceId: params.workspaceId,
            avatarId: params.avatarId,
            conversationId: params.conversationId,
            messageId: null,
            eventType: "storage.bytes.uploaded",
            quantity: videoBytes.byteLength,
            unit: "bytes",
            metadata: {
              assetId: createdVideoAssetId,
              assetType: AvatarAssetType.GENERATED_AVATAR_VIDEO,
              mimeType: videoMimeType,
              source: "widget_generated_video"
            },
            idempotencyKey: `storage-upload:${createdVideoAssetId}`
          })
          videoAssetId = createdVideoAssetId
          videoUrl = buildPublicMediaUrl(params.avatarMessageId, params.publicMediaToken, "video")
          await createRuntimeTrace({
            workspaceId: params.workspaceId,
            avatarId: params.avatarId,
            conversationId: params.conversationId,
            eventType: "video.stored",
            status: RuntimeTraceStatus.SUCCESS,
            metadata: {
              assetId: createdVideoAssetId,
              storage: "public_widget_media_token"
            }
          })
        } catch {
          videoErrorMessage = "Video was generated but could not be stored."
          await deleteAvatarAssetFromDisk(storageKey).catch(() => undefined)
          await createRuntimeTrace({
            workspaceId: params.workspaceId,
            avatarId: params.avatarId,
            conversationId: params.conversationId,
            eventType: "video.failed",
            status: RuntimeTraceStatus.FAILURE,
            metadata: { reason: "storage_failed" }
          })
        }
      } else if (params.runtimeResponse.video.videoUrl) {
        videoUrl = params.runtimeResponse.video.videoUrl
        await createRuntimeTrace({
          workspaceId: params.workspaceId,
          avatarId: params.avatarId,
          conversationId: params.conversationId,
          eventType: "video.stored",
          status: RuntimeTraceStatus.SUCCESS,
          metadata: {
            provider: params.runtimeResponse.video.provider,
            storage: "provider_hosted_reference"
          }
        })
      } else {
        videoErrorMessage = "Video generation completed without a playable video URL."
      }
    } else {
      videoErrorMessage = params.runtimeResponse.videoError?.message ??
        (params.runtimeResponse.video?.status === "processing"
          ? "Video generation is still processing. Phase 12 widget does not include polling yet."
          : "Avatar video provider did not return a completed video.")
      await createRuntimeTrace({
        workspaceId: params.workspaceId,
        avatarId: params.avatarId,
        conversationId: params.conversationId,
        eventType: "avatar_video.failed",
        status: RuntimeTraceStatus.FAILURE,
        metadata: {
          reason: params.runtimeResponse.videoError?.code ?? params.runtimeResponse.video?.status ?? "missing_video",
          message: videoErrorMessage
        }
      })
    }
  }

  return {
    audioUrl,
    videoUrl,
    audioAssetId,
    videoAssetId,
    audioErrorMessage,
    videoErrorMessage,
    audioUsage,
    videoUsage,
    videoDurationSeconds,
    videoProviderJobId
  }
}

export async function processWidgetMessage(avatarId: string, request: Request, body: unknown): Promise<WidgetMessageResponse> {
  const avatarRow = await prisma.avatar.findUnique({
    where: { id: avatarId },
    select: { workspaceId: true }
  })

  if (!avatarRow) {
    throw new WidgetPublicError(404, "avatar_not_found", "Avatar was not found.")
  }

  const domainAccess = await assertWidgetDomainAllowed(avatarRow.workspaceId, request)
  const avatar = await fetchAvatarByIdAndWorkspace(avatarRow.workspaceId, avatarId)
  if (!avatar || !isAvatarPublicRuntimeEligible(avatar) || avatar.status === AvatarStatus.SUSPENDED) {
    throw new WidgetPublicError(404, "avatar_unavailable", "Avatar is not available for public widget use.")
  }

  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const inputText = normalizeText(payload.message)
  if (inputText.length < WIDGET_MESSAGE_MIN_LENGTH) {
    throw new WidgetPublicError(400, "message_too_short", "Enter at least two characters.")
  }

  if (!isTextLengthSafe(inputText, WIDGET_MESSAGE_MAX_LENGTH)) {
    throw new WidgetPublicError(400, "message_too_long", `Message must be ${WIDGET_MESSAGE_MAX_LENGTH} characters or fewer.`)
  }

  const visitorId = parseVisitorId(payload.visitorId)
  enforceWidgetRateLimit({
    avatarId,
    visitorId,
    domain: domainAccess.domain,
    ip: getRequestIp(request)
  })

  const outputMode = parseWidgetOutputMode(payload.outputMode, avatar)
  const conversationId = normalizeText(payload.conversationId)
  const targetConversation = await resolveWidgetConversation({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId,
    visitorId
  })

  if (targetConversation.created) {
    await recordUsageEvent({
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      conversationId: targetConversation.id,
      eventType: "widget.session.started",
      quantity: 1,
      unit: "count",
      metadata: {
        visitorId,
        domain: domainAccess.domain
      },
      idempotencyKey: `widget-session-started:${targetConversation.id}`
    })
  }

  await createRuntimeTrace({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: targetConversation.id,
    eventType: "message.received",
    status: RuntimeTraceStatus.STARTED,
    metadata: {
      channel: ConversationChannel.WIDGET,
      domain: domainAccess.domain
    }
  })

  const visitorMessageId = randomUUID()
  await prisma.message.create({
    data: {
      id: visitorMessageId,
      conversationId: targetConversation.id,
      role: MessageRole.VISITOR,
      content: inputText,
      metadata: {
        channel: ConversationChannel.WIDGET,
        domain: domainAccess.domain
      }
    }
  })
  await recordUsageEvent(buildConversationMessageUsageEvent({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: targetConversation.id,
    messageId: visitorMessageId,
    role: MessageRole.VISITOR,
    channel: ConversationChannel.WIDGET
  }))

  const visitorMessageCount = await prisma.message.count({
    where: {
      conversationId: targetConversation.id,
      role: MessageRole.VISITOR
    }
  })

  await prisma.conversation.update({
    where: { id: targetConversation.id },
    data: { updatedAt: new Date() }
  })

  await createRuntimeTrace({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: targetConversation.id,
    eventType: "message.received",
    status: RuntimeTraceStatus.SUCCESS
  })

  await createRuntimeTrace({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: targetConversation.id,
    eventType: "retrieval.started",
    status: RuntimeTraceStatus.STARTED
  })

  const knowledgeChunks = await fetchRelevantKnowledgeChunksForPreview({
    workspaceId: avatar.workspaceId,
    messageText: inputText
  })

  await createRuntimeTrace({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: targetConversation.id,
    eventType: "retrieval.completed",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      requestedChunkCount: knowledgeChunks.length
    }
  })

  await createRuntimeTrace({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: targetConversation.id,
    eventType: "llm.started",
    status: RuntimeTraceStatus.STARTED
  })

  const currentSourcePhoto = getCurrentSourcePhoto(avatar)
  if (outputMode === "video") {
    await createRuntimeTrace({
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      conversationId: targetConversation.id,
      eventType: "avatar_video.started",
      status: RuntimeTraceStatus.STARTED,
      metadata: {
        sourcePhotoAssetId: currentSourcePhoto?.id ?? null,
        voiceId: avatar.voice?.id ?? null
      }
    })
  }

  let runtimeResponse: RuntimeResponse
  try {
    runtimeResponse = await sendRuntimeTextMessage({
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      conversationId: targetConversation.id,
      messageId: visitorMessageId,
      channel: "WIDGET",
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
      conversationId: targetConversation.id,
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

  await createRuntimeTrace({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: targetConversation.id,
    eventType: "llm.completed",
    status: runtimeResponse.status === "error" ? RuntimeTraceStatus.FAILURE : RuntimeTraceStatus.SUCCESS,
    metadata: {
      provider: runtimeResponse.usage.provider,
      status: runtimeResponse.status
    }
  })

  await createRuntimeTrace({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: targetConversation.id,
    eventType: "safety.checked",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      handoffDecision: runtimeResponse.handoffDecision,
      leadCaptureDecision: runtimeResponse.leadCaptureDecision
    }
  })

  const avatarMessageId = randomUUID()
  const publicMediaToken = randomUUID()
  const media = await persistWidgetRuntimeMedia({
    runtimeResponse,
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: targetConversation.id,
    avatarMessageId,
    outputMode,
    publicMediaToken
  })

  await prisma.message.create({
    data: {
      id: avatarMessageId,
      conversationId: targetConversation.id,
      role: MessageRole.AVATAR,
      content: runtimeResponse.answer || "",
      audioUrl: media.audioUrl,
      videoUrl: media.videoUrl,
      metadata: {
        runtimeStatus: runtimeResponse.status,
        usage: runtimeResponse.usage,
        outputMode,
        widgetPublicMediaToken: publicMediaToken,
        widgetAudioAssetId: media.audioAssetId,
        widgetVideoAssetId: media.videoAssetId,
        audioStatus: outputMode === "audio" || outputMode === "video"
          ? media.audioUrl ? "generated" : "failed"
          : "none",
        audioError: media.audioErrorMessage,
        ttsUsage: media.audioUsage,
        videoStatus: outputMode === "video"
          ? media.videoUrl ? "generated" : "failed"
          : "none",
        videoError: media.videoErrorMessage,
        videoUsage: media.videoUsage,
        videoDurationSeconds: media.videoDurationSeconds,
        videoProviderJobId: media.videoProviderJobId,
        intent: runtimeResponse.intent ?? null,
        confidence: runtimeResponse.confidence ?? null,
        handoffDecision: runtimeResponse.handoffDecision,
        leadCaptureDecision: runtimeResponse.leadCaptureDecision,
        leadCapture: runtimeResponse.leadCapture,
        safetyReason: runtimeResponse.safetyReason ?? null,
        safetyEventCount: runtimeResponse.safetyEvents?.length ?? 0,
        safetyAction: runtimeResponse.safetyEvents?.[0]?.action ?? null,
        safetyFallbackUsed: runtimeResponse.status === "blocked" || runtimeResponse.safetyEvents?.some(event => event.action === "REWRITE") || false,
        sourceReferenceCount: runtimeResponse.sourceReferences.length,
        domain: domainAccess.domain
      }
    }
  })
  await persistWidgetRuntimeSafetyState({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: targetConversation.id,
    inputMessageId: visitorMessageId,
    outputMessageId: avatarMessageId,
    inputText,
    outputText: runtimeResponse.answer || "",
    runtimeResponse
  })
  await recordRuntimeKnowledgeGap({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: targetConversation.id,
    messageId: visitorMessageId,
    question: inputText,
    source: KnowledgeGapSource.WIDGET_RUNTIME,
    runtimeResponse
  })
  await recordUsageEvents([
    buildConversationMessageUsageEvent({
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      conversationId: targetConversation.id,
      messageId: avatarMessageId,
      role: MessageRole.AVATAR,
      channel: ConversationChannel.WIDGET
    }),
    ...buildRuntimeResponseUsageEvents({
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      conversationId: targetConversation.id,
      inputMessageId: visitorMessageId,
      outputMessageId: avatarMessageId,
      inputType: "text",
      outputMode
    }, runtimeResponse)
  ])

  await prisma.conversation.update({
    where: { id: targetConversation.id },
    data: { updatedAt: new Date() }
  })

  await createRuntimeTrace({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: targetConversation.id,
    eventType: "response.saved",
    status: RuntimeTraceStatus.SUCCESS
  })

  await createRuntimeTrace({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: targetConversation.id,
    eventType: "response.returned",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      messageId: avatarMessageId
    }
  })

  return {
    conversationId: targetConversation.id,
    visitorId,
    visitorMessageId,
    avatarMessage: {
      id: avatarMessageId,
      content: runtimeResponse.answer || "",
      audioUrl: media.audioUrl,
      videoUrl: media.videoUrl,
      outputMode,
      runtimeStatus: runtimeResponse.status,
      leadCapture: runtimeResponse.leadCapture
    }
  }
}

function parseMetadataObject(raw: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null
  }

  return raw as Record<string, unknown>
}

export async function resolveWidgetMedia(params: {
  messageId: string
  token: string
  kind: "audio" | "video"
  request: Request
}): Promise<{
  content: Buffer
  mimeType: string
}> {
  const message = await prisma.message.findFirst({
    where: {
      id: params.messageId,
      role: MessageRole.AVATAR,
      conversation: {
        channel: ConversationChannel.WIDGET,
        avatar: {
          status: AvatarStatus.PUBLISHED
        }
      }
    },
    select: {
      audioUrl: true,
      videoUrl: true,
      metadata: true,
      conversation: {
        select: {
          workspaceId: true
        }
      }
    }
  })

  if (!message) {
    throw new WidgetPublicError(404, "media_not_found", "Widget media was not found.")
  }

  const metadata = parseMetadataObject(message.metadata)
  if (metadata?.widgetPublicMediaToken !== params.token) {
    throw new WidgetPublicError(403, "media_token_invalid", "Widget media token is invalid.")
  }

  const domain = getRequestOriginDomain(params.request)
  if (domain) {
    await assertWidgetDomainAllowed(message.conversation.workspaceId, params.request)
  }

  const assetId = params.kind === "audio"
    ? typeof metadata?.widgetAudioAssetId === "string" ? metadata.widgetAudioAssetId : null
    : typeof metadata?.widgetVideoAssetId === "string" ? metadata.widgetVideoAssetId : null

  if (!assetId) {
    throw new WidgetPublicError(404, "media_not_stored", "Widget media is not stored locally.")
  }

  const asset = await prisma.avatarAsset.findFirst({
    where: {
      id: assetId,
      workspaceId: message.conversation.workspaceId,
      validationStatus: AvatarAssetValidationStatus.VALID,
      type: params.kind === "audio"
        ? AvatarAssetType.GENERATED_SPEECH_AUDIO
        : AvatarAssetType.GENERATED_AVATAR_VIDEO
    },
    select: {
      storageKey: true,
      mimeType: true
    }
  })

  if (!asset) {
    throw new WidgetPublicError(404, "media_asset_not_found", "Widget media asset was not found.")
  }

  return {
    content: await readAvatarAssetFromDisk(asset.storageKey),
    mimeType: asset.mimeType
  }
}

export function parseWidgetSettingsInput(formData: FormData): {
  avatarId: string
  theme: WidgetThemeValue
  position: WidgetPositionValue
  greetingEnabled: boolean
  greetingText: string
  primaryColor: string | null
  errors: Record<string, string>
} {
  const avatarId = normalizeText(formData.get("avatarId"))
  const theme = parseWidgetTheme(formData.get("theme"))
  const position = parseWidgetPosition(formData.get("position"))
  const greetingEnabled = formData.get("greetingEnabled") === "on"
  const greetingText = normalizeText(formData.get("greetingText"))
  const primaryColor = normalizeColor(formData.get("primaryColor"))
  const errors: Record<string, string> = {}

  if (!avatarId) {
    errors.avatarId = "Avatar is required."
  }

  if (greetingEnabled && !greetingText) {
    errors.greetingText = "Greeting text is required when greeting is enabled."
  }

  if (!isTextLengthSafe(greetingText, 220)) {
    errors.greetingText = "Greeting text must be 220 characters or fewer."
  }

  const rawColor = normalizeText(formData.get("primaryColor"))
  if (rawColor && !primaryColor) {
    errors.primaryColor = "Use a 6-digit hex color such as #355cff."
  }

  return {
    avatarId,
    theme,
    position,
    greetingEnabled,
    greetingText,
    primaryColor,
    errors
  }
}

export function widgetDbSettingsInput(input: {
  theme: WidgetThemeValue
  position: WidgetPositionValue
  greetingEnabled: boolean
  greetingText: string
  primaryColor: string | null
}) {
  return {
    theme: mapThemeToDb(input.theme),
    position: mapPositionToDb(input.position),
    greetingEnabled: input.greetingEnabled,
    greetingText: input.greetingText,
    primaryColor: input.primaryColor
  }
}
