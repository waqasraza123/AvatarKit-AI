import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { formatWorkspaceLocalTime } from "@/lib/avatar"
import type { RuntimeResponse } from "@/lib/avatar-runtime-client"

export const USAGE_EVENT_TYPES = [
  "widget.session.started",
  "conversation.message.created",
  "llm.tokens.input",
  "llm.tokens.output",
  "stt.seconds",
  "stt.requests",
  "tts.characters",
  "tts.requests",
  "avatar.video.seconds",
  "avatar.video.requests",
  "knowledge.source.created",
  "knowledge.chunk.created",
  "knowledge.gap.created",
  "realtime.session.started",
  "realtime.event.sent",
  "storage.bytes.uploaded"
] as const

export const USAGE_UNITS = [
  "count",
  "tokens",
  "seconds",
  "characters",
  "bytes"
] as const

export const USAGE_PERIODS = ["7d", "30d", "all"] as const

export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number]
export type UsageUnit = (typeof USAGE_UNITS)[number]
export type UsagePeriod = (typeof USAGE_PERIODS)[number]

export type RecordUsageEventInput = {
  workspaceId: string
  avatarId?: string | null
  conversationId?: string | null
  messageId?: string | null
  eventType: UsageEventType
  quantity: number
  unit: UsageUnit
  provider?: string | null
  costEstimateCents?: number | null
  metadata?: Record<string, unknown> | null
  idempotencyKey?: string | null
}

export type UsageTotals = {
  conversations: number
  messages: number
  widgetSessions: number
  llmInputTokens: number
  llmOutputTokens: number
  sttSeconds: number
  sttRequests: number
  ttsCharacters: number
  ttsRequests: number
  avatarVideoSeconds: number
  avatarVideoRequests: number
  knowledgeSources: number
  knowledgeChunks: number
  storageBytesUploaded: number
  estimatedCostCents: number
}

export type UsageAvatarSummary = {
  avatarId: string
  avatarName: string
  messages: number
  widgetSessions: number
  llmInputTokens: number
  llmOutputTokens: number
  ttsCharacters: number
  sttSeconds: number
  avatarVideoSeconds: number
  avatarVideoRequests: number
  storageBytesUploaded: number
  estimatedCostCents: number
}

export type UsageRecentEvent = {
  id: string
  avatarName: string | null
  eventType: string
  quantity: number
  unit: string
  provider: string | null
  costEstimateCents: number | null
  createdAt: string
}

export type UsageDashboardData = {
  period: UsagePeriod
  periodLabel: string
  totals: UsageTotals
  perAvatar: UsageAvatarSummary[]
  recentEvents: UsageRecentEvent[]
  softLimitWarnings: string[]
}

export type RuntimeUsageAssociation = {
  workspaceId: string
  avatarId: string
  conversationId: string
  inputMessageId?: string | null
  outputMessageId?: string | null
  inputType: "text" | "audio"
  inputDurationSeconds?: number | null
  outputMode: "text" | "audio" | "video"
}

type CostEstimateRule = {
  unit: UsageUnit
  centsPerUnit: number
  label: string
}

export const USAGE_COST_ESTIMATE_RULES: Partial<Record<UsageEventType, CostEstimateRule>> = {
  "llm.tokens.input": {
    unit: "tokens",
    centsPerUnit: 0.00015,
    label: "Estimated LLM input cost per token"
  },
  "llm.tokens.output": {
    unit: "tokens",
    centsPerUnit: 0.0006,
    label: "Estimated LLM output cost per token"
  },
  "stt.seconds": {
    unit: "seconds",
    centsPerUnit: 0.01,
    label: "Estimated STT cost per second"
  },
  "tts.characters": {
    unit: "characters",
    centsPerUnit: 0.0015,
    label: "Estimated TTS cost per character"
  },
  "avatar.video.seconds": {
    unit: "seconds",
    centsPerUnit: 8,
    label: "Estimated avatar video cost per second"
  },
  "avatar.video.requests": {
    unit: "count",
    centsPerUnit: 2,
    label: "Estimated avatar video request overhead"
  },
  "storage.bytes.uploaded": {
    unit: "bytes",
    centsPerUnit: 0.000000002,
    label: "Estimated storage upload footprint"
  }
}

const DEFAULT_SOFT_LIMITS = {
  messages: 1000,
  llmTokens: 1_000_000,
  ttsCharacters: 100_000,
  sttSeconds: 3600,
  avatarVideoSeconds: 600,
  storageBytesUploaded: 1_073_741_824
}

function emptyTotals(): UsageTotals {
  return {
    conversations: 0,
    messages: 0,
    widgetSessions: 0,
    llmInputTokens: 0,
    llmOutputTokens: 0,
    sttSeconds: 0,
    sttRequests: 0,
    ttsCharacters: 0,
    ttsRequests: 0,
    avatarVideoSeconds: 0,
    avatarVideoRequests: 0,
    knowledgeSources: 0,
    knowledgeChunks: 0,
    storageBytesUploaded: 0,
    estimatedCostCents: 0
  }
}

function sanitizeMetadata(metadata: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (!metadata) {
    return undefined
  }

  return JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue
}

function normalizeQuantity(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0
  }

  return Number(quantity)
}

export function estimateUsageCostCents(eventType: UsageEventType, quantity: number): number | null {
  const rule = USAGE_COST_ESTIMATE_RULES[eventType]
  if (!rule) {
    return 0
  }

  const normalizedQuantity = normalizeQuantity(quantity)
  if (normalizedQuantity <= 0) {
    return 0
  }

  return normalizedQuantity * rule.centsPerUnit
}

export async function recordUsageEvent(input: RecordUsageEventInput): Promise<void> {
  const quantity = normalizeQuantity(input.quantity)
  if (!input.workspaceId || quantity <= 0) {
    return
  }

  const costEstimateCents = typeof input.costEstimateCents === "number"
    ? input.costEstimateCents
    : estimateUsageCostCents(input.eventType, quantity)

  try {
    const data = {
      workspaceId: input.workspaceId,
      avatarId: input.avatarId ?? null,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      eventType: input.eventType,
      quantity,
      unit: input.unit,
      provider: input.provider ?? null,
      costEstimateCents,
      metadata: sanitizeMetadata(input.metadata),
      idempotencyKey: input.idempotencyKey ?? null
    }

    if (input.idempotencyKey) {
      await prisma.usageEvent.upsert({
        where: { idempotencyKey: input.idempotencyKey },
        create: data,
        update: { idempotencyKey: input.idempotencyKey }
      })
      return
    }

    await prisma.usageEvent.create({ data })
  } catch (error) {
    console.error("Usage event recording failed", {
      eventType: input.eventType,
      workspaceId: input.workspaceId,
      avatarId: input.avatarId ?? null,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      error
    })
  }
}

export async function recordUsageEvents(events: RecordUsageEventInput[]): Promise<void> {
  await Promise.all(events.map(event => recordUsageEvent(event)))
}

function readUsageNumber(source: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!source) {
    return null
  }

  for (const key of keys) {
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value
    }
  }

  return null
}

function readUsageBoolean(source: Record<string, unknown> | null | undefined, key: string): boolean | null {
  if (!source) {
    return null
  }

  return typeof source[key] === "boolean" ? source[key] : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function estimateVideoSecondsFromText(text: string): number {
  return Math.max(2, Math.min(20, Math.round((text.length / 13) * 100) / 100))
}

export function buildConversationMessageUsageEvent(input: {
  workspaceId: string
  avatarId: string
  conversationId: string
  messageId: string
  role: string
  channel: string
}): RecordUsageEventInput {
  return {
    workspaceId: input.workspaceId,
    avatarId: input.avatarId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    eventType: "conversation.message.created",
    quantity: 1,
    unit: "count",
    metadata: {
      role: input.role,
      channel: input.channel
    },
    idempotencyKey: `conversation-message-created:${input.messageId}`
  }
}

export function buildRuntimeResponseUsageEvents(
  association: RuntimeUsageAssociation,
  runtimeResponse: RuntimeResponse
): RecordUsageEventInput[] {
  const events: RecordUsageEventInput[] = []
  const tokens = asRecord(runtimeResponse.usage.tokens)
  const inputTokens = readUsageNumber(tokens, ["inputTokens", "promptTokens"])
  const outputTokens = readUsageNumber(tokens, ["outputTokens", "completionTokens"])
  const totalTokens = readUsageNumber(tokens, ["totalTokens", "providerTotalTokens"])
  const tokensEstimated = readUsageBoolean(tokens, "estimated")
  const provider = runtimeResponse.usage.provider

  if (inputTokens) {
    events.push({
      workspaceId: association.workspaceId,
      avatarId: association.avatarId,
      conversationId: association.conversationId,
      messageId: association.outputMessageId ?? association.inputMessageId ?? null,
      eventType: "llm.tokens.input",
      quantity: inputTokens,
      unit: "tokens",
      provider,
      metadata: {
        estimated: tokensEstimated ?? false,
        totalTokens,
        runtimeStatus: runtimeResponse.status
      },
      idempotencyKey: `llm-input:${association.outputMessageId ?? association.inputMessageId}`
    })
  }

  if (outputTokens) {
    events.push({
      workspaceId: association.workspaceId,
      avatarId: association.avatarId,
      conversationId: association.conversationId,
      messageId: association.outputMessageId ?? association.inputMessageId ?? null,
      eventType: "llm.tokens.output",
      quantity: outputTokens,
      unit: "tokens",
      provider,
      metadata: {
        estimated: tokensEstimated ?? false,
        totalTokens,
        runtimeStatus: runtimeResponse.status
      },
      idempotencyKey: `llm-output:${association.outputMessageId ?? association.inputMessageId}`
    })
  }

  if (association.inputType === "audio") {
    const transcriptionUsage = asRecord(runtimeResponse.transcription?.usage)
    const sttSeconds = readUsageNumber(transcriptionUsage, ["seconds", "durationSeconds"]) ??
      runtimeResponse.transcription?.durationSeconds ??
      association.inputDurationSeconds ??
      null
    const sttProvider = runtimeResponse.transcription?.provider ?? provider

    events.push({
      workspaceId: association.workspaceId,
      avatarId: association.avatarId,
      conversationId: association.conversationId,
      messageId: association.inputMessageId ?? null,
      eventType: "stt.requests",
      quantity: 1,
      unit: "count",
      provider: sttProvider,
      metadata: {
        estimated: !runtimeResponse.transcription,
        runtimeStatus: runtimeResponse.status
      },
      idempotencyKey: `stt-request:${association.inputMessageId ?? association.conversationId}`
    })

    if (sttSeconds && sttSeconds > 0) {
      events.push({
        workspaceId: association.workspaceId,
        avatarId: association.avatarId,
        conversationId: association.conversationId,
        messageId: association.inputMessageId ?? null,
        eventType: "stt.seconds",
        quantity: sttSeconds,
        unit: "seconds",
        provider: sttProvider,
        metadata: {
          estimated: readUsageBoolean(transcriptionUsage, "durationEstimated") ?? !runtimeResponse.transcription,
          runtimeStatus: runtimeResponse.status
        },
        idempotencyKey: `stt-seconds:${association.inputMessageId ?? association.conversationId}`
      })
    }
  }

  if (association.outputMode === "audio" || association.outputMode === "video") {
    const audioUsage = asRecord(runtimeResponse.audio?.usage)
    const ttsCharacters = readUsageNumber(audioUsage, ["characters"]) ?? runtimeResponse.answer.length
    const ttsProvider = runtimeResponse.audio?.provider ?? runtimeResponse.audioError?.provider ?? null
    const ttsWasAttempted = Boolean(runtimeResponse.audio || runtimeResponse.audioError)

    if (ttsWasAttempted) {
      events.push({
        workspaceId: association.workspaceId,
        avatarId: association.avatarId,
        conversationId: association.conversationId,
        messageId: association.outputMessageId ?? null,
        eventType: "tts.requests",
        quantity: 1,
        unit: "count",
        provider: ttsProvider,
        metadata: {
          estimated: !runtimeResponse.audio,
          audioStatus: runtimeResponse.audio ? "generated" : "failed"
        },
        idempotencyKey: `tts-request:${association.outputMessageId ?? association.inputMessageId}`
      })

      if (ttsCharacters > 0) {
        events.push({
          workspaceId: association.workspaceId,
          avatarId: association.avatarId,
          conversationId: association.conversationId,
          messageId: association.outputMessageId ?? null,
          eventType: "tts.characters",
          quantity: ttsCharacters,
          unit: "characters",
          provider: ttsProvider,
          metadata: {
            estimated: !runtimeResponse.audio,
            audioStatus: runtimeResponse.audio ? "generated" : "failed"
          },
          idempotencyKey: `tts-characters:${association.outputMessageId ?? association.inputMessageId}`
        })
      }
    }
  }

  if (association.outputMode === "video") {
    const videoUsage = asRecord(runtimeResponse.video?.usage)
    const videoProvider = runtimeResponse.video?.provider ?? runtimeResponse.videoError?.provider ?? null
    const videoWasAttempted = Boolean(runtimeResponse.video || runtimeResponse.videoError)
    const videoSeconds = readUsageNumber(videoUsage, ["seconds"]) ??
      runtimeResponse.video?.durationSeconds ??
      estimateVideoSecondsFromText(runtimeResponse.answer)

    if (videoWasAttempted) {
      events.push({
        workspaceId: association.workspaceId,
        avatarId: association.avatarId,
        conversationId: association.conversationId,
        messageId: association.outputMessageId ?? null,
        eventType: "avatar.video.requests",
        quantity: 1,
        unit: "count",
        provider: videoProvider,
        metadata: {
          estimated: !runtimeResponse.video,
          videoStatus: runtimeResponse.video?.status ?? "failed"
        },
        idempotencyKey: `avatar-video-request:${association.outputMessageId ?? association.inputMessageId}`
      })

      events.push({
        workspaceId: association.workspaceId,
        avatarId: association.avatarId,
        conversationId: association.conversationId,
        messageId: association.outputMessageId ?? null,
        eventType: "avatar.video.seconds",
        quantity: videoSeconds,
        unit: "seconds",
        provider: videoProvider,
        metadata: {
          estimated: readUsageBoolean(videoUsage, "secondsEstimated") ?? !runtimeResponse.video?.durationSeconds,
          videoStatus: runtimeResponse.video?.status ?? "failed"
        },
        idempotencyKey: `avatar-video-seconds:${association.outputMessageId ?? association.inputMessageId}`
      })
    }
  }

  return events
}

export function parseUsagePeriod(value: unknown): UsagePeriod {
  return value === "7d" || value === "30d" || value === "all" ? value : "30d"
}

function usagePeriodStart(period: UsagePeriod): Date | null {
  if (period === "all") {
    return null
  }

  const days = period === "7d" ? 7 : 30
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

function usagePeriodLabel(period: UsagePeriod): string {
  if (period === "7d") {
    return "Last 7 days"
  }

  if (period === "30d") {
    return "Last 30 days"
  }

  return "All time"
}

function applyUsageTotal(totals: UsageTotals, eventType: string, quantity: number, costEstimateCents: number): void {
  totals.estimatedCostCents += costEstimateCents

  if (eventType === "conversation.message.created") {
    totals.messages += quantity
  } else if (eventType === "widget.session.started") {
    totals.widgetSessions += quantity
  } else if (eventType === "llm.tokens.input") {
    totals.llmInputTokens += quantity
  } else if (eventType === "llm.tokens.output") {
    totals.llmOutputTokens += quantity
  } else if (eventType === "stt.seconds") {
    totals.sttSeconds += quantity
  } else if (eventType === "stt.requests") {
    totals.sttRequests += quantity
  } else if (eventType === "tts.characters") {
    totals.ttsCharacters += quantity
  } else if (eventType === "tts.requests") {
    totals.ttsRequests += quantity
  } else if (eventType === "avatar.video.seconds") {
    totals.avatarVideoSeconds += quantity
  } else if (eventType === "avatar.video.requests") {
    totals.avatarVideoRequests += quantity
  } else if (eventType === "knowledge.source.created") {
    totals.knowledgeSources += quantity
  } else if (eventType === "knowledge.chunk.created") {
    totals.knowledgeChunks += quantity
  } else if (eventType === "storage.bytes.uploaded") {
    totals.storageBytesUploaded += quantity
  }
}

function applyAvatarUsageTotal(summary: UsageAvatarSummary, eventType: string, quantity: number, costEstimateCents: number): void {
  summary.estimatedCostCents += costEstimateCents

  if (eventType === "conversation.message.created") {
    summary.messages += quantity
  } else if (eventType === "widget.session.started") {
    summary.widgetSessions += quantity
  } else if (eventType === "llm.tokens.input") {
    summary.llmInputTokens += quantity
  } else if (eventType === "llm.tokens.output") {
    summary.llmOutputTokens += quantity
  } else if (eventType === "tts.characters") {
    summary.ttsCharacters += quantity
  } else if (eventType === "stt.seconds") {
    summary.sttSeconds += quantity
  } else if (eventType === "avatar.video.seconds") {
    summary.avatarVideoSeconds += quantity
  } else if (eventType === "avatar.video.requests") {
    summary.avatarVideoRequests += quantity
  } else if (eventType === "storage.bytes.uploaded") {
    summary.storageBytesUploaded += quantity
  }
}

function buildSoftLimitWarnings(totals: UsageTotals): string[] {
  const warnings: string[] = []
  const llmTokens = totals.llmInputTokens + totals.llmOutputTokens

  if (totals.messages >= DEFAULT_SOFT_LIMITS.messages * 0.8) {
    warnings.push("Message usage is above 80% of the Phase 15 default soft limit.")
  }

  if (llmTokens >= DEFAULT_SOFT_LIMITS.llmTokens * 0.8) {
    warnings.push("LLM token usage is above 80% of the Phase 15 default soft limit.")
  }

  if (totals.ttsCharacters >= DEFAULT_SOFT_LIMITS.ttsCharacters * 0.8) {
    warnings.push("TTS character usage is above 80% of the Phase 15 default soft limit.")
  }

  if (totals.sttSeconds >= DEFAULT_SOFT_LIMITS.sttSeconds * 0.8) {
    warnings.push("STT seconds are above 80% of the Phase 15 default soft limit.")
  }

  if (totals.avatarVideoSeconds >= DEFAULT_SOFT_LIMITS.avatarVideoSeconds * 0.8) {
    warnings.push("Avatar video seconds are above 80% of the Phase 15 default soft limit.")
  }

  if (totals.storageBytesUploaded >= DEFAULT_SOFT_LIMITS.storageBytesUploaded * 0.8) {
    warnings.push("Uploaded storage bytes are above 80% of the Phase 15 default soft limit.")
  }

  return warnings
}

export function formatUsageNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value < 10 ? 2 : 0
  }).format(value)
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / (1024 ** index)
  return `${formatUsageNumber(value)} ${units[index]}`
}

export function formatEstimatedCost(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents < 100 ? 4 : 2,
    maximumFractionDigits: cents < 100 ? 4 : 2
  }).format(cents / 100)
}

export async function fetchUsageDashboardData(workspaceId: string, period: UsagePeriod): Promise<UsageDashboardData> {
  const start = usagePeriodStart(period)
  const where = {
    workspaceId,
    ...(start ? { createdAt: { gte: start } } : {})
  }

  const [eventGroups, avatarGroups, recentEvents, conversationCount, avatars] = await Promise.all([
    prisma.usageEvent.groupBy({
      by: ["eventType"],
      where,
      _sum: {
        quantity: true,
        costEstimateCents: true
      }
    }),
    prisma.usageEvent.groupBy({
      by: ["avatarId", "eventType"],
      where,
      _sum: {
        quantity: true,
        costEstimateCents: true
      }
    }),
    prisma.usageEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 24,
      include: {
        avatar: {
          select: { name: true }
        }
      }
    }),
    prisma.conversation.count({
      where: {
        workspaceId,
        ...(start ? { createdAt: { gte: start } } : {})
      }
    }),
    prisma.avatar.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true
      }
    })
  ])

  const totals = emptyTotals()
  totals.conversations = conversationCount

  for (const group of eventGroups) {
    applyUsageTotal(
      totals,
      group.eventType,
      group._sum.quantity ?? 0,
      group._sum.costEstimateCents ?? 0
    )
  }

  const avatarNameById = new Map(avatars.map(avatar => [avatar.id, avatar.name]))
  const perAvatarById = new Map<string, UsageAvatarSummary>()

  for (const group of avatarGroups) {
    if (!group.avatarId) {
      continue
    }

    const existing = perAvatarById.get(group.avatarId) ?? {
      avatarId: group.avatarId,
      avatarName: avatarNameById.get(group.avatarId) ?? "Unknown avatar",
      messages: 0,
      widgetSessions: 0,
      llmInputTokens: 0,
      llmOutputTokens: 0,
      ttsCharacters: 0,
      sttSeconds: 0,
      avatarVideoSeconds: 0,
      avatarVideoRequests: 0,
      storageBytesUploaded: 0,
      estimatedCostCents: 0
    }

    applyAvatarUsageTotal(
      existing,
      group.eventType,
      group._sum.quantity ?? 0,
      group._sum.costEstimateCents ?? 0
    )
    perAvatarById.set(group.avatarId, existing)
  }

  return {
    period,
    periodLabel: usagePeriodLabel(period),
    totals,
    perAvatar: Array.from(perAvatarById.values()).sort((a, b) => b.estimatedCostCents - a.estimatedCostCents),
    recentEvents: recentEvents.map(event => ({
      id: event.id,
      avatarName: event.avatar?.name ?? null,
      eventType: event.eventType,
      quantity: event.quantity,
      unit: event.unit,
      provider: event.provider,
      costEstimateCents: event.costEstimateCents,
      createdAt: formatWorkspaceLocalTime(event.createdAt)
    })),
    softLimitWarnings: buildSoftLimitWarnings(totals)
  }
}

export async function fetchUsageOverviewSummary(workspaceId: string): Promise<{
  currentMonthCostCents: number
  currentMonthMessages: number
  recentActivity: UsageRecentEvent[]
}> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const where = {
    workspaceId,
    createdAt: { gte: monthStart }
  }

  const [cost, messages, recent] = await Promise.all([
    prisma.usageEvent.aggregate({
      where,
      _sum: { costEstimateCents: true }
    }),
    prisma.usageEvent.aggregate({
      where: {
        ...where,
        eventType: "conversation.message.created"
      },
      _sum: { quantity: true }
    }),
    prisma.usageEvent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        avatar: {
          select: { name: true }
        }
      }
    })
  ])

  return {
    currentMonthCostCents: cost._sum.costEstimateCents ?? 0,
    currentMonthMessages: messages._sum.quantity ?? 0,
    recentActivity: recent.map(event => ({
      id: event.id,
      avatarName: event.avatar?.name ?? null,
      eventType: event.eventType,
      quantity: event.quantity,
      unit: event.unit,
      provider: event.provider,
      costEstimateCents: event.costEstimateCents,
      createdAt: formatWorkspaceLocalTime(event.createdAt)
    }))
  }
}
