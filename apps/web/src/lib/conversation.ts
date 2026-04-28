import {
  ConversationChannel,
  ConversationStatus,
  LeadSource,
  LeadStatus,
  MessageRole,
  Prisma,
  RuntimeTraceStatus,
  WorkspaceRole
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { hasWorkspaceRole } from "@/lib/workspace"
import { formatWorkspaceLocalTime } from "@/lib/avatar"

export const CONVERSATION_STATUS_FILTERS = [
  ConversationStatus.ACTIVE,
  ConversationStatus.ENDED,
  ConversationStatus.HANDOFF_REQUESTED,
  ConversationStatus.FAILED
] as const

export const CONVERSATION_CHANNEL_FILTERS = [
  ConversationChannel.DASHBOARD_PREVIEW,
  ConversationChannel.WIDGET,
  ConversationChannel.KIOSK,
  ConversationChannel.API
] as const

export const CONVERSATION_RECENT_PRESETS = ["all", "7d", "30d", "90d"] as const

export type ConversationRecentWindow = (typeof CONVERSATION_RECENT_PRESETS)[number]

type FilterStringValue = string

export type ConversationListFilters = {
  avatarId?: string
  channel: ConversationChannel | "ALL"
  status: ConversationStatus | "ALL"
  messageSearch?: string
  recent: ConversationRecentWindow
}

export type ConversationListItem = {
  id: string
  sessionLabel: string
  avatarId: string
  avatarName: string
  channel: ConversationChannel
  status: ConversationStatus
  createdAt: string
  updatedAt: string
  endedAt: string | null
  messageCount: number
  latestMessagePreview: string | null
  latestMessageAt: string | null
  hasHandoffRequestFlag: boolean
  hasFailureFlag: boolean
  lead: {
    id: string
    status: LeadStatus
  } | null
}

export type AvatarFilterOption = {
  id: string
  name: string
}

export type ConversationMessageMetadata = Record<string, unknown>

export type MessageMetadataBadge = {
  label: string
  value: string
  tone: "normal" | "warn" | "success"
}

export type ConversationMessage = {
  id: string
  role: MessageRole
  content: string
  createdAt: string
  audioUrl: string | null
  videoUrl: string | null
  metadata: ConversationMessageMetadata | null
  metadataBadges: MessageMetadataBadge[]
}

export type ConversationTrace = {
  id: string
  eventType: string
  status: RuntimeTraceStatus
  durationMs: number | null
  createdAt: string
  metadata: ConversationMessageMetadata | null
  errorMetadata: string[]
}

export type ConversationDetail = {
  id: string
  avatarId: string
  avatarName: string
  channel: ConversationChannel
  status: ConversationStatus
  createdAt: string
  updatedAt: string
  endedAt: string | null
  messages: ConversationMessage[]
  runtimeTraces: ConversationTrace[]
  hasEndedConversation: boolean
  lead: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    message: string | null
    status: LeadStatus
    source: LeadSource
    createdAt: string
  } | null
}

export type ConversationOverviewRecentItem = {
  id: string
  avatarId: string
  avatarName: string
  channel: ConversationChannel
  status: ConversationStatus
  updatedAt: string
  messageCount: number
  latestMessagePreview: string | null
}

export type ConversationOverview = {
  totalConversations: number
  dashboardPreviewConversations: number
  failedConversations: number
  totalLeads: number
  newLeads: number
  recentConversations: ConversationOverviewRecentItem[]
}

function parseJsonObject(raw: Prisma.JsonValue | null): ConversationMessageMetadata | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null
  }

  return raw as ConversationMessageMetadata
}

function parseStringValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null
  }

  if (typeof value === "number") {
    return String(value)
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }

  return null
}

function parseObjectValue(value: unknown): ConversationMessageMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as ConversationMessageMetadata
}

function conversationMessagePreview(content: string, maxLength = 180): string {
  const trimmed = content.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }

  return `${trimmed.slice(0, maxLength - 1)}…`
}

function buildMetadataBadges(metadata: ConversationMessageMetadata | null): MessageMetadataBadge[] {
  if (!metadata) {
    return []
  }

  const badges: MessageMetadataBadge[] = []
  const runtimeStatus = parseStringValue(metadata.runtimeStatus)
  const inputType = parseStringValue(metadata.inputType)
  if (inputType) {
    badges.push({
      label: "Input",
      value: inputType,
      tone: inputType === "audio" ? "success" : "normal"
    })
  }

  if (runtimeStatus) {
    badges.push({
      label: "Runtime",
      value: runtimeStatus,
      tone: runtimeStatus === "error" ? "warn" : "normal"
    })
  }

  const intent = parseStringValue(metadata.intent)
  if (intent) {
    badges.push({
      label: "Intent",
      value: intent,
      tone: "normal"
    })
  }

  const confidence = metadata.confidence
  if (typeof confidence === "number") {
    badges.push({
      label: "Confidence",
      value: `${Math.round(confidence * 100)}%`,
      tone: "normal"
    })
  }

  const handoffDecision = parseStringValue(metadata.handoffDecision)
  if (handoffDecision) {
    badges.push({
      label: "Handoff",
      value: handoffDecision,
      tone: handoffDecision === "request" ? "warn" : "normal"
    })
  }

  const leadCaptureDecision = parseStringValue(metadata.leadCaptureDecision)
  if (leadCaptureDecision) {
    badges.push({
      label: "Lead capture",
      value: leadCaptureDecision,
      tone: "normal"
    })
  }

  const safetyReason = parseStringValue(metadata.safetyReason)
  if (safetyReason) {
    badges.push({
      label: "Safety",
      value: safetyReason,
      tone: "warn"
    })
  }

  const usage = parseObjectValue(metadata.usage)
  const usageProvider = parseStringValue(usage?.provider)
  if (usageProvider) {
    const usageModel = parseStringValue(usage?.model)
    const value = usageModel ? `${usageProvider} · ${usageModel}` : usageProvider
    badges.push({
      label: "Model",
      value,
      tone: "success"
    })
  }

  const sourceReferenceCount = metadata.sourceReferenceCount
  if (typeof sourceReferenceCount === "number") {
    badges.push({
      label: "Sources",
      value: String(sourceReferenceCount),
      tone: "normal"
    })
  }

  const audioStatus = parseStringValue(metadata.audioStatus)
  if (audioStatus && audioStatus !== "none") {
    badges.push({
      label: "Audio",
      value: audioStatus,
      tone: audioStatus === "failed" ? "warn" : "success"
    })
  }

  const videoStatus = parseStringValue(metadata.videoStatus)
  if (videoStatus && videoStatus !== "none") {
    badges.push({
      label: "Video",
      value: videoStatus,
      tone: videoStatus === "failed" ? "warn" : "success"
    })
  }

  const ttsUsage = parseObjectValue(metadata.ttsUsage)
  const ttsCharacters = ttsUsage?.characters
  if (typeof ttsCharacters === "number") {
    badges.push({
      label: "TTS chars",
      value: String(ttsCharacters),
      tone: "normal"
    })
  }

  const sttConfidence = metadata.sttConfidence
  if (typeof sttConfidence === "number") {
    badges.push({
      label: "STT confidence",
      value: `${Math.round(sttConfidence * 100)}%`,
      tone: "normal"
    })
  }

  const videoUsage = parseObjectValue(metadata.videoUsage)
  const videoSeconds = videoUsage?.seconds
  if (typeof videoSeconds === "number") {
    badges.push({
      label: "Video seconds",
      value: String(Math.round(videoSeconds * 10) / 10),
      tone: "normal"
    })
  }

  return badges
}

function buildTraceErrorSummary(metadata: ConversationMessageMetadata | null): string[] {
  if (!metadata) {
    return []
  }

  const values: string[] = []
  const errorValue = parseStringValue(metadata.error)
  const reasonValue = parseStringValue(metadata.reason)
  const safetyReason = parseStringValue(metadata.safetyReason)
  const messageValue = parseStringValue(metadata.message)

  if (errorValue) {
    values.push(errorValue)
  }

  if (reasonValue) {
    values.push(reasonValue)
  }

  if (safetyReason) {
    values.push(safetyReason)
  }

  if (messageValue) {
    values.push(messageValue)
  }

  return values
}

const DEFAULT_MESSAGE_FILTER_LENGTH = 2
const PREVIEW_MESSAGE_LENGTH = 180

const statusTransitionMap: Record<ConversationStatus, ConversationStatus[]> = {
  [ConversationStatus.ACTIVE]: [ConversationStatus.ENDED, ConversationStatus.FAILED],
  [ConversationStatus.ENDED]: [ConversationStatus.ACTIVE],
  [ConversationStatus.HANDOFF_REQUESTED]: [ConversationStatus.ACTIVE, ConversationStatus.ENDED, ConversationStatus.FAILED],
  [ConversationStatus.FAILED]: [ConversationStatus.ACTIVE]
}

function parseConversationRecentFilter(value: FilterStringValue | undefined): ConversationRecentWindow {
  if (value === "7d" || value === "30d" || value === "90d") {
    return value
  }

  return "all"
}

function parseConversationStatusFilter(value: FilterStringValue | undefined): ConversationStatus | "ALL" {
  if (
    value === ConversationStatus.ACTIVE ||
    value === ConversationStatus.ENDED ||
    value === ConversationStatus.HANDOFF_REQUESTED ||
    value === ConversationStatus.FAILED
  ) {
    return value
  }

  return "ALL"
}

function parseConversationChannelFilter(value: FilterStringValue | undefined): ConversationChannel | "ALL" {
  if (
    value === ConversationChannel.DASHBOARD_PREVIEW ||
    value === ConversationChannel.WIDGET ||
    value === ConversationChannel.KIOSK ||
    value === ConversationChannel.API
  ) {
    return value
  }

  return "ALL"
}

function parseRecentCutoff(recent: ConversationRecentWindow): Date | null {
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

export function canManageConversation(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

export function conversationStatusLabel(status: ConversationStatus): string {
  return status.replace(/_/g, " ")
}

export function conversationChannelLabel(channel: ConversationChannel): string {
  if (channel === ConversationChannel.DASHBOARD_PREVIEW) {
    return "Dashboard preview"
  }

  if (channel === ConversationChannel.WIDGET) {
    return "Widget"
  }

  return channel
}

export function messageRoleLabel(role: MessageRole): string {
  if (role === MessageRole.VISITOR) {
    return "Visitor"
  }

  if (role === MessageRole.AVATAR) {
    return "Avatar"
  }

  if (role === MessageRole.SYSTEM) {
    return "System"
  }

  return "Operator"
}

export function parseConversationListSearchFilters(raw: {
  avatarId?: string
  channel?: string
  status?: string
  q?: string
  recent?: string
}): ConversationListFilters {
  const messageSearch = typeof raw.q === "string" ? raw.q.trim() : ""

  return {
    avatarId: raw.avatarId?.trim() || undefined,
    channel: parseConversationChannelFilter(raw.channel),
    status: parseConversationStatusFilter(raw.status),
    messageSearch: messageSearch.length < DEFAULT_MESSAGE_FILTER_LENGTH ? undefined : messageSearch,
    recent: parseConversationRecentFilter(raw.recent)
  }
}

export function getConversationStatusTransitionTargets(status: ConversationStatus): ConversationStatus[] {
  return statusTransitionMap[status] ?? []
}

export function isConversationStatusTransitionAllowed(
  currentStatus: ConversationStatus,
  nextStatus: ConversationStatus
): boolean {
  return statusTransitionMap[currentStatus]?.includes(nextStatus) ?? false
}

export async function fetchConversationAvatarFilters(workspaceId: string): Promise<AvatarFilterOption[]> {
  const avatars = await prisma.avatar.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  })

  return avatars
}

export async function fetchConversationList(
  workspaceId: string,
  rawFilters: ConversationListFilters
): Promise<ConversationListItem[]> {
  const where: Prisma.ConversationWhereInput = {
    workspaceId
  }

  if (rawFilters.avatarId) {
    where.avatarId = rawFilters.avatarId
  }

  if (rawFilters.channel !== "ALL") {
    where.channel = rawFilters.channel
  }

  if (rawFilters.status !== "ALL") {
    where.status = rawFilters.status
  }

  const recentCutoff = parseRecentCutoff(rawFilters.recent)
  if (recentCutoff) {
    where.updatedAt = { gte: recentCutoff }
  }

  if (rawFilters.messageSearch) {
    where.messages = {
      some: {
        content: {
          contains: rawFilters.messageSearch,
          mode: "insensitive"
        }
      }
    }
  }

  const rows = await prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      avatarId: true,
      channel: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      endedAt: true,
      _count: {
        select: { messages: true }
      },
      avatar: {
        select: { name: true }
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          content: true,
          createdAt: true
        }
      },
      lead: {
        select: {
          id: true,
          status: true
        }
      }
    }
  })

  return rows.map(row => ({
    id: row.id,
    sessionLabel: `Session ${row.id.slice(0, 8)}`,
    avatarId: row.avatarId,
    avatarName: row.avatar.name,
    channel: row.channel,
    status: row.status,
    createdAt: formatWorkspaceLocalTime(row.createdAt),
    updatedAt: formatWorkspaceLocalTime(row.updatedAt),
    endedAt: row.endedAt ? formatWorkspaceLocalTime(row.endedAt) : null,
    messageCount: row._count.messages,
    latestMessagePreview: row.messages[0]?.content ? conversationMessagePreview(row.messages[0].content) : null,
    latestMessageAt: row.messages[0]?.createdAt ? formatWorkspaceLocalTime(row.messages[0].createdAt) : null,
    hasHandoffRequestFlag: row.status === ConversationStatus.HANDOFF_REQUESTED,
    hasFailureFlag: row.status === ConversationStatus.FAILED,
    lead: row.lead
  }))
}

export async function fetchConversationOverview(workspaceId: string): Promise<ConversationOverview> {
  const [totalConversations, dashboardPreviewConversations, failedConversations, totalLeads, newLeads, recentRows] = await Promise.all([
    prisma.conversation.count({ where: { workspaceId } }),
    prisma.conversation.count({
      where: {
        workspaceId,
        channel: ConversationChannel.DASHBOARD_PREVIEW
      }
    }),
    prisma.conversation.count({
      where: {
        workspaceId,
        status: ConversationStatus.FAILED
      }
    }),
    prisma.lead.count({ where: { workspaceId } }),
    prisma.lead.count({ where: { workspaceId, status: LeadStatus.NEW } }),
    prisma.conversation.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        avatarId: true,
        channel: true,
        status: true,
        updatedAt: true,
        avatar: {
          select: { name: true }
        },
        _count: {
          select: { messages: true }
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true }
        }
      }
    })
  ])

  return {
    totalConversations,
    dashboardPreviewConversations,
    failedConversations,
    totalLeads,
    newLeads,
    recentConversations: recentRows.map(row => ({
      id: row.id,
      avatarId: row.avatarId,
      avatarName: row.avatar.name,
      channel: row.channel,
      status: row.status,
      updatedAt: formatWorkspaceLocalTime(row.updatedAt),
      messageCount: row._count.messages,
      latestMessagePreview: row.messages[0]?.content
        ? conversationMessagePreview(row.messages[0].content)
        : "No messages yet"
    }))
  }
}

export async function fetchConversationDetail(
  workspaceId: string,
  conversationId: string
): Promise<ConversationDetail | null> {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId
    },
    select: {
      id: true,
      avatarId: true,
      channel: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      endedAt: true,
      avatar: {
        select: { name: true }
      },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          audioUrl: true,
          videoUrl: true,
          metadata: true,
          createdAt: true
        }
      },
      runtimeTraces: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          eventType: true,
          status: true,
          durationMs: true,
          metadata: true,
          createdAt: true
        }
      },
      lead: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          message: true,
          status: true,
          source: true,
          createdAt: true
        }
      }
    }
  })

  if (!conversation) {
    return null
  }

  return {
    id: conversation.id,
    avatarId: conversation.avatarId,
    avatarName: conversation.avatar.name,
    channel: conversation.channel,
    status: conversation.status,
    createdAt: formatWorkspaceLocalTime(conversation.createdAt),
    updatedAt: formatWorkspaceLocalTime(conversation.updatedAt),
    endedAt: conversation.endedAt ? formatWorkspaceLocalTime(conversation.endedAt) : null,
    hasEndedConversation: conversation.status !== ConversationStatus.ACTIVE,
    lead: conversation.lead
      ? {
        id: conversation.lead.id,
        name: conversation.lead.name,
        email: conversation.lead.email,
        phone: conversation.lead.phone,
        message: conversation.lead.message,
        status: conversation.lead.status,
        source: conversation.lead.source,
        createdAt: formatWorkspaceLocalTime(conversation.lead.createdAt)
      }
      : null,
    messages: conversation.messages.map(message => {
      const parsedMetadata = parseJsonObject(message.metadata)
      return {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: formatWorkspaceLocalTime(message.createdAt),
        audioUrl: message.audioUrl,
        videoUrl: message.videoUrl,
        metadata: parsedMetadata,
        metadataBadges: buildMetadataBadges(parsedMetadata)
      }
    }),
    runtimeTraces: conversation.runtimeTraces.map(trace => {
      const parsedMetadata = parseJsonObject(trace.metadata)
      return {
        id: trace.id,
        eventType: trace.eventType,
        status: trace.status,
        durationMs: trace.durationMs,
        createdAt: formatWorkspaceLocalTime(trace.createdAt),
        metadata: parsedMetadata,
        errorMetadata: buildTraceErrorSummary(parsedMetadata)
      }
    })
  }
}

export function conversationActionLabel(nextStatus: ConversationStatus): string {
  if (nextStatus === ConversationStatus.ACTIVE) {
    return "Mark active"
  }

  if (nextStatus === ConversationStatus.ENDED) {
    return "Mark ended"
  }

  return "Mark failed"
}
