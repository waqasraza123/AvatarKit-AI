import {
  KnowledgeGapReason,
  KnowledgeGapSource,
  KnowledgeGapStatus,
  MessageRole,
  Prisma,
  SafetyEventType,
  WorkspaceRole
} from "@prisma/client"
import { formatWorkspaceLocalTime, isTextLengthSafe } from "@/lib/avatar"
import { prisma } from "@/lib/prisma"
import { recordUsageEvent } from "@/lib/usage"
import { hasWorkspaceRole } from "@/lib/workspace"
import type { RuntimeResponse } from "@/lib/avatar-runtime-client"

export const KNOWLEDGE_GAP_STATUSES = [
  KnowledgeGapStatus.NEW,
  KnowledgeGapStatus.IN_REVIEW,
  KnowledgeGapStatus.RESOLVED,
  KnowledgeGapStatus.IGNORED
] as const

export const KNOWLEDGE_GAP_REASONS = [
  KnowledgeGapReason.LOW_RETRIEVAL_CONFIDENCE,
  KnowledgeGapReason.NO_RELEVANT_KNOWLEDGE,
  KnowledgeGapReason.FALLBACK_USED,
  KnowledgeGapReason.USER_REPEATED_QUESTION,
  KnowledgeGapReason.SAFETY_HANDOFF,
  KnowledgeGapReason.OPERATOR_MARKED_POOR,
  KnowledgeGapReason.UNKNOWN
] as const

export const KNOWLEDGE_GAP_SOURCES = [
  KnowledgeGapSource.DASHBOARD_PREVIEW,
  KnowledgeGapSource.WIDGET_RUNTIME,
  KnowledgeGapSource.SYSTEM
] as const

export const KNOWLEDGE_GAP_RECENT_PRESETS = ["all", "7d", "30d", "90d"] as const

export type KnowledgeGapRecentWindow = (typeof KNOWLEDGE_GAP_RECENT_PRESETS)[number]

export type KnowledgeGapFilters = {
  status: KnowledgeGapStatus | "ALL"
  reason: KnowledgeGapReason | "ALL"
  source: KnowledgeGapSource | "ALL"
  avatarId?: string
  recent: KnowledgeGapRecentWindow
}

export type KnowledgeGapListItem = {
  id: string
  question: string
  normalizedQuestion: string | null
  reason: KnowledgeGapReason
  status: KnowledgeGapStatus
  source: KnowledgeGapSource
  frequency: number
  lastAskedAt: string
  suggestedAnswer: string | null
  avatarId: string | null
  avatarName: string | null
  conversationId: string | null
  messageId: string | null
}

export type KnowledgeGapDetail = KnowledgeGapListItem & {
  workspaceId: string
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  resolvedByName: string | null
  linkedMessage: {
    id: string
    role: MessageRole
    content: string
    createdAt: string
  } | null
}

export type KnowledgeGapSummary = {
  unresolvedCount: number
  newCount: number
  inReviewCount: number
  topUnresolved: KnowledgeGapListItem[]
}

export type RecordKnowledgeGapInput = {
  workspaceId: string
  avatarId?: string | null
  conversationId?: string | null
  messageId?: string | null
  question: string
  reason: KnowledgeGapReason
  source: KnowledgeGapSource
  suggestedAnswer?: string | null
  metadata?: Record<string, unknown> | null
}

const QUESTION_MAX_LENGTH = 1000
const SUGGESTED_ANSWER_MAX_LENGTH = 5000
const unresolvedStatuses = [KnowledgeGapStatus.NEW, KnowledgeGapStatus.IN_REVIEW]
const unsafeKnowledgeEventTypes = new Set<SafetyEventType>([
  SafetyEventType.abusive_message,
  SafetyEventType.prompt_injection_attempt,
  SafetyEventType.impersonation_risk,
  SafetyEventType.public_figure_risk,
  SafetyEventType.fake_endorsement_risk,
  SafetyEventType.unsupported_medical_request,
  SafetyEventType.unsupported_legal_request,
  SafetyEventType.unsupported_financial_request
])

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }

  return trimmed.slice(0, maxLength - 1).trim()
}

function sanitizeJson(metadata: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (!metadata) {
    return undefined
  }

  return JSON.parse(JSON.stringify(metadata, (_key, value) => {
    if (typeof value === "string") {
      return truncate(value, 500)
    }

    return value
  })) as Prisma.InputJsonValue
}

function parseMetadata(raw: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null
  }

  return raw as Record<string, unknown>
}

function parseRecentCutoff(recent: KnowledgeGapRecentWindow): Date | null {
  if (recent === "all") {
    return null
  }

  const now = new Date()
  if (recent === "7d") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  }

  if (recent === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }

  return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
}

function mapGapListItem(raw: {
  id: string
  question: string
  normalizedQuestion: string | null
  reason: KnowledgeGapReason
  status: KnowledgeGapStatus
  source: KnowledgeGapSource
  frequency: number
  lastAskedAt: Date
  suggestedAnswer: string | null
  avatarId: string | null
  conversationId: string | null
  messageId: string | null
  avatar?: { name: string } | null
}): KnowledgeGapListItem {
  return {
    id: raw.id,
    question: raw.question,
    normalizedQuestion: raw.normalizedQuestion,
    reason: raw.reason,
    status: raw.status,
    source: raw.source,
    frequency: raw.frequency,
    lastAskedAt: formatWorkspaceLocalTime(raw.lastAskedAt),
    suggestedAnswer: raw.suggestedAnswer,
    avatarId: raw.avatarId,
    avatarName: raw.avatar?.name ?? null,
    conversationId: raw.conversationId,
    messageId: raw.messageId
  }
}

export function canManageKnowledgeGaps(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

export function normalizeKnowledgeGapQuestion(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function knowledgeGapLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase())
}

export function parseKnowledgeGapFilters(raw: {
  status?: string
  reason?: string
  source?: string
  avatarId?: string
  recent?: string
}): KnowledgeGapFilters {
  return {
    status: KNOWLEDGE_GAP_STATUSES.includes(raw.status as KnowledgeGapStatus)
      ? raw.status as KnowledgeGapStatus
      : "ALL",
    reason: KNOWLEDGE_GAP_REASONS.includes(raw.reason as KnowledgeGapReason)
      ? raw.reason as KnowledgeGapReason
      : "ALL",
    source: KNOWLEDGE_GAP_SOURCES.includes(raw.source as KnowledgeGapSource)
      ? raw.source as KnowledgeGapSource
      : "ALL",
    avatarId: raw.avatarId?.trim() || undefined,
    recent: raw.recent === "7d" || raw.recent === "30d" || raw.recent === "90d" ? raw.recent : "all"
  }
}

export function shouldSkipKnowledgeGapForRuntime(runtimeResponse: RuntimeResponse): boolean {
  return (runtimeResponse.safetyEvents ?? []).some(event => unsafeKnowledgeEventTypes.has(event.eventType))
}

export function resolveRuntimeKnowledgeGapReason(runtimeResponse: RuntimeResponse): KnowledgeGapReason | null {
  if (runtimeResponse.status === "error") {
    return null
  }

  if (shouldSkipKnowledgeGapForRuntime(runtimeResponse)) {
    return null
  }

  if (runtimeResponse.gapReason && KNOWLEDGE_GAP_REASONS.includes(runtimeResponse.gapReason as KnowledgeGapReason)) {
    return runtimeResponse.gapReason as KnowledgeGapReason
  }

  if (runtimeResponse.missingKnowledge || runtimeResponse.usage.reason === "missing_knowledge") {
    return KnowledgeGapReason.NO_RELEVANT_KNOWLEDGE
  }

  if (runtimeResponse.fallbackUsed || runtimeResponse.status === "fallback") {
    return KnowledgeGapReason.FALLBACK_USED
  }

  if (typeof runtimeResponse.retrievalConfidence === "number" && runtimeResponse.retrievalConfidence < 0.32) {
    return KnowledgeGapReason.LOW_RETRIEVAL_CONFIDENCE
  }

  if (runtimeResponse.handoffRequired && runtimeResponse.handoffDecision === "request") {
    return KnowledgeGapReason.SAFETY_HANDOFF
  }

  return null
}

async function hasRepeatedQuestionInConversation(input: {
  conversationId: string
  messageId: string
  question: string
}): Promise<boolean> {
  const normalizedQuestion = normalizeKnowledgeGapQuestion(input.question)
  if (!normalizedQuestion) {
    return false
  }

  const recentVisitorMessages = await prisma.message.findMany({
    where: {
      conversationId: input.conversationId,
      role: MessageRole.VISITOR,
      id: { not: input.messageId }
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { content: true }
  })

  return recentVisitorMessages.some(message => normalizeKnowledgeGapQuestion(message.content) === normalizedQuestion)
}

export async function recordKnowledgeGap(input: RecordKnowledgeGapInput): Promise<{ id: string; created: boolean } | null> {
  const question = truncate(input.question, QUESTION_MAX_LENGTH)
  if (!input.workspaceId || question.length < 2) {
    return null
  }

  const normalizedQuestion = normalizeKnowledgeGapQuestion(question)
  if (!normalizedQuestion || !isTextLengthSafe(normalizedQuestion, QUESTION_MAX_LENGTH)) {
    return null
  }

  const existing = await prisma.knowledgeGap.findFirst({
    where: {
      workspaceId: input.workspaceId,
      avatarId: input.avatarId ?? null,
      normalizedQuestion,
      status: { in: unresolvedStatuses }
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      frequency: true,
      conversationId: true,
      messageId: true,
      suggestedAnswer: true
    }
  })

  const now = new Date()
  const suggestedAnswer = input.suggestedAnswer
    ? truncate(input.suggestedAnswer, SUGGESTED_ANSWER_MAX_LENGTH)
    : null

  if (existing) {
    await prisma.knowledgeGap.update({
      where: { id: existing.id },
      data: {
        frequency: { increment: 1 },
        lastAskedAt: now,
        reason: input.reason,
        conversationId: existing.conversationId ?? input.conversationId ?? null,
        messageId: existing.messageId ?? input.messageId ?? null,
        suggestedAnswer: existing.suggestedAnswer ?? suggestedAnswer,
        metadata: sanitizeJson(input.metadata)
      }
    })

    return { id: existing.id, created: false }
  }

  const created = await prisma.knowledgeGap.create({
    data: {
      workspaceId: input.workspaceId,
      avatarId: input.avatarId ?? null,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      question,
      normalizedQuestion,
      reason: input.reason,
      status: KnowledgeGapStatus.NEW,
      frequency: 1,
      lastAskedAt: now,
      suggestedAnswer,
      source: input.source,
      metadata: sanitizeJson(input.metadata)
    },
    select: { id: true }
  })

  await recordUsageEvent({
    workspaceId: input.workspaceId,
    avatarId: input.avatarId ?? null,
    conversationId: input.conversationId ?? null,
    messageId: input.messageId ?? null,
    eventType: "knowledge.gap.created",
    quantity: 1,
    unit: "count",
    metadata: {
      gapId: created.id,
      reason: input.reason,
      source: input.source
    },
    idempotencyKey: `knowledge-gap-created:${created.id}`
  })

  return { id: created.id, created: true }
}

export async function recordRuntimeKnowledgeGap(input: {
  workspaceId: string
  avatarId: string
  conversationId: string
  messageId: string
  question: string
  source: KnowledgeGapSource
  runtimeResponse: RuntimeResponse
}): Promise<void> {
  const question = input.runtimeResponse.originalQuestion || input.question
  let reason = resolveRuntimeKnowledgeGapReason(input.runtimeResponse)

  if (!reason && !shouldSkipKnowledgeGapForRuntime(input.runtimeResponse)) {
    const repeatedQuestion = await hasRepeatedQuestionInConversation({
      conversationId: input.conversationId,
      messageId: input.messageId,
      question
    })

    if (repeatedQuestion) {
      reason = KnowledgeGapReason.USER_REPEATED_QUESTION
    }
  }

  if (!reason) {
    return
  }

  await recordKnowledgeGap({
    workspaceId: input.workspaceId,
    avatarId: input.avatarId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    question,
    reason,
    source: input.source,
    suggestedAnswer: input.runtimeResponse.status === "fallback" ? null : input.runtimeResponse.answer,
    metadata: {
      runtimeStatus: input.runtimeResponse.status,
      confidence: input.runtimeResponse.confidence ?? null,
      retrievalConfidence: input.runtimeResponse.retrievalConfidence ?? null,
      fallbackUsed: input.runtimeResponse.fallbackUsed ?? input.runtimeResponse.status === "fallback",
      missingKnowledge: input.runtimeResponse.missingKnowledge ?? false,
      handoffRequired: input.runtimeResponse.handoffRequired ?? input.runtimeResponse.handoffDecision === "request",
      sourceReferenceCount: input.runtimeResponse.sourceReferences.length,
      usageReason: input.runtimeResponse.usage.reason ?? null
    }
  })
}

export async function fetchKnowledgeGapAvatarFilters(workspaceId: string): Promise<{ id: string; name: string }[]> {
  return prisma.avatar.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  })
}

export async function fetchKnowledgeGaps(
  workspaceId: string,
  filters: KnowledgeGapFilters
): Promise<KnowledgeGapListItem[]> {
  const where: Prisma.KnowledgeGapWhereInput = { workspaceId }

  if (filters.status !== "ALL") {
    where.status = filters.status
  }

  if (filters.reason !== "ALL") {
    where.reason = filters.reason
  }

  if (filters.source !== "ALL") {
    where.source = filters.source
  }

  if (filters.avatarId) {
    where.avatarId = filters.avatarId
  }

  const recentCutoff = parseRecentCutoff(filters.recent)
  if (recentCutoff) {
    where.lastAskedAt = { gte: recentCutoff }
  }

  const gaps = await prisma.knowledgeGap.findMany({
    where,
    orderBy: [{ status: "asc" }, { frequency: "desc" }, { lastAskedAt: "desc" }],
    select: {
      id: true,
      question: true,
      normalizedQuestion: true,
      reason: true,
      status: true,
      source: true,
      frequency: true,
      lastAskedAt: true,
      suggestedAnswer: true,
      avatarId: true,
      conversationId: true,
      messageId: true,
      avatar: {
        select: { name: true }
      }
    }
  })

  return gaps.map(mapGapListItem)
}

export async function fetchKnowledgeGapSummary(
  workspaceId: string,
  avatarId?: string | null
): Promise<KnowledgeGapSummary> {
  const where: Prisma.KnowledgeGapWhereInput = {
    workspaceId,
    status: { in: unresolvedStatuses }
  }

  if (avatarId) {
    where.avatarId = avatarId
  }

  const [unresolvedCount, newCount, inReviewCount, topRows] = await Promise.all([
    prisma.knowledgeGap.count({ where }),
    prisma.knowledgeGap.count({ where: { ...where, status: KnowledgeGapStatus.NEW } }),
    prisma.knowledgeGap.count({ where: { ...where, status: KnowledgeGapStatus.IN_REVIEW } }),
    prisma.knowledgeGap.findMany({
      where,
      orderBy: [{ frequency: "desc" }, { lastAskedAt: "desc" }],
      take: 5,
      select: {
        id: true,
        question: true,
        normalizedQuestion: true,
        reason: true,
        status: true,
        source: true,
        frequency: true,
        lastAskedAt: true,
        suggestedAnswer: true,
        avatarId: true,
        conversationId: true,
        messageId: true,
        avatar: {
          select: { name: true }
        }
      }
    })
  ])

  return {
    unresolvedCount,
    newCount,
    inReviewCount,
    topUnresolved: topRows.map(mapGapListItem)
  }
}

export async function fetchKnowledgeGapDetail(
  workspaceId: string,
  gapId: string
): Promise<KnowledgeGapDetail | null> {
  const gap = await prisma.knowledgeGap.findFirst({
    where: { id: gapId, workspaceId },
    select: {
      id: true,
      workspaceId: true,
      question: true,
      normalizedQuestion: true,
      reason: true,
      status: true,
      source: true,
      frequency: true,
      lastAskedAt: true,
      suggestedAnswer: true,
      avatarId: true,
      conversationId: true,
      messageId: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      avatar: {
        select: { name: true }
      },
      resolvedByUser: {
        select: { displayName: true, email: true }
      },
      message: {
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true
        }
      }
    }
  })

  if (!gap) {
    return null
  }

  return {
    ...mapGapListItem(gap),
    workspaceId: gap.workspaceId,
    metadata: parseMetadata(gap.metadata),
    createdAt: formatWorkspaceLocalTime(gap.createdAt),
    updatedAt: formatWorkspaceLocalTime(gap.updatedAt),
    resolvedAt: gap.resolvedAt ? formatWorkspaceLocalTime(gap.resolvedAt) : null,
    resolvedByName: gap.resolvedByUser?.displayName ?? gap.resolvedByUser?.email ?? null,
    linkedMessage: gap.message
      ? {
        id: gap.message.id,
        role: gap.message.role,
        content: gap.message.content,
        createdAt: formatWorkspaceLocalTime(gap.message.createdAt)
      }
      : null
  }
}
