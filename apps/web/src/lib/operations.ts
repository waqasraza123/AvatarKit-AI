import {
  AvatarStatus,
  ConversationChannel,
  ConversationStatus,
  RuntimeTraceStatus,
  SafetyEventStatus,
  SafetySeverity,
  WorkspaceRole
} from "@prisma/client"
import { formatWorkspaceLocalTime } from "@/lib/avatar"
import { prisma } from "@/lib/prisma"
import { hasWorkspaceRole } from "@/lib/workspace"

export const OPERATIONS_PERIODS = ["24h", "7d", "30d"] as const

export type OperationsPeriod = (typeof OPERATIONS_PERIODS)[number]

export type OperationsFilters = {
  query: string
  avatarStatus: AvatarStatus | "ALL"
  period: OperationsPeriod
}

export type OperationsMetric = {
  label: string
  value: string
  helper: string
}

export type OperationsAvatarItem = {
  id: string
  name: string
  displayName: string
  status: AvatarStatus
  updatedAt: string
  failedTraceCount: number
  openSafetyCount: number
}

export type OperationsTraceItem = {
  id: string
  eventType: string
  status: RuntimeTraceStatus
  avatarId: string | null
  avatarName: string | null
  conversationId: string | null
  durationMs: number | null
  provider: string | null
  message: string | null
  createdAt: string
}

export type OperationsSafetyItem = {
  id: string
  eventType: string
  severity: SafetySeverity
  status: SafetyEventStatus
  avatarId: string | null
  avatarName: string | null
  conversationId: string | null
  reason: string | null
  createdAt: string
}

export type OperationsUsageSpike = {
  eventType: string
  currentQuantity: number
  previousQuantity: number
  ratio: number | null
}

export type OperationsDashboardData = {
  filters: OperationsFilters
  metrics: OperationsMetric[]
  avatars: OperationsAvatarItem[]
  providerErrors: OperationsTraceItem[]
  runtimeFailures: OperationsTraceItem[]
  recentTraces: OperationsTraceItem[]
  safetyEvents: OperationsSafetyItem[]
  usageSpikes: OperationsUsageSpike[]
}

const AVATAR_STATUSES = [
  AvatarStatus.DRAFT,
  AvatarStatus.PROCESSING,
  AvatarStatus.READY,
  AvatarStatus.PUBLISHED,
  AvatarStatus.SUSPENDED,
  AvatarStatus.FAILED
] as const

function parsePeriod(value: string | undefined): OperationsPeriod {
  return OPERATIONS_PERIODS.includes(value as OperationsPeriod) ? value as OperationsPeriod : "24h"
}

function periodHours(period: OperationsPeriod): number {
  if (period === "30d") {
    return 24 * 30
  }

  if (period === "7d") {
    return 24 * 7
  }

  return 24
}

function periodStart(period: OperationsPeriod, offset = 0): Date {
  const date = new Date()
  date.setHours(date.getHours() - periodHours(period) * (offset + 1))
  return date
}

function previousPeriodStart(period: OperationsPeriod): Date {
  const date = new Date()
  date.setHours(date.getHours() - periodHours(period) * 2)
  return date
}

function normalizeQuery(value: string | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 120)
}

function parseAvatarStatus(value: string | undefined): AvatarStatus | "ALL" {
  return AVATAR_STATUSES.includes(value as AvatarStatus) ? value as AvatarStatus : "ALL"
}

function readMetadataString(metadata: unknown, keys: string[]): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null
  }

  const record = metadata as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value < 10 ? 1 : 0
  }).format(value)
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value)
}

function isProviderFailure(trace: OperationsTraceItem): boolean {
  const eventType = trace.eventType.toLowerCase()
  return Boolean(trace.provider) ||
    eventType.includes("provider") ||
    eventType.includes("llm") ||
    eventType.includes("tts") ||
    eventType.includes("stt") ||
    eventType.includes("avatar_video")
}

function traceItem(row: {
  id: string
  eventType: string
  status: RuntimeTraceStatus
  avatarId: string | null
  avatar?: { name: string } | null
  conversationId: string | null
  durationMs: number | null
  metadata: unknown
  createdAt: Date
}): OperationsTraceItem {
  return {
    id: row.id,
    eventType: row.eventType,
    status: row.status,
    avatarId: row.avatarId,
    avatarName: row.avatar?.name ?? null,
    conversationId: row.conversationId,
    durationMs: row.durationMs,
    provider: readMetadataString(row.metadata, ["provider", "sttProvider", "ttsProvider", "videoProvider"]),
    message: readMetadataString(row.metadata, ["message", "error", "reason", "code"]),
    createdAt: formatWorkspaceLocalTime(row.createdAt)
  }
}

function usageSpike(currentQuantity: number, previousQuantity: number): { ratio: number | null; include: boolean } {
  if (currentQuantity < 10 && previousQuantity < 10) {
    return { ratio: null, include: false }
  }

  if (previousQuantity === 0) {
    return { ratio: null, include: currentQuantity >= 10 }
  }

  const ratio = currentQuantity / previousQuantity
  return { ratio, include: ratio >= 2 }
}

export function canAccessOperations(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

export function canManageOperations(role: WorkspaceRole): boolean {
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN
}

export function parseOperationsFilters(searchParams: {
  q?: string
  avatarStatus?: string
  period?: string
}): OperationsFilters {
  return {
    query: normalizeQuery(searchParams.q),
    avatarStatus: parseAvatarStatus(searchParams.avatarStatus),
    period: parsePeriod(searchParams.period)
  }
}

export async function fetchOperationsDashboardData(workspaceId: string, filters: OperationsFilters): Promise<OperationsDashboardData> {
  const start = periodStart(filters.period)
  const previousStart = previousPeriodStart(filters.period)
  const avatarWhere = {
    workspaceId,
    ...(filters.avatarStatus === "ALL" ? {} : { status: filters.avatarStatus }),
    ...(filters.query ? {
      OR: [
        { name: { contains: filters.query, mode: "insensitive" as const } },
        { displayName: { contains: filters.query, mode: "insensitive" as const } },
        { role: { contains: filters.query, mode: "insensitive" as const } },
        { useCase: { contains: filters.query, mode: "insensitive" as const } }
      ]
    } : {})
  }

  const [
    avatars,
    failedTraceCount,
    failureTraceRows,
    recentTraceRows,
    openSafetyCount,
    criticalSafetyCount,
    safetyRows,
    usageCurrent,
    usagePrevious,
    widgetConversations,
    widgetFailures
  ] = await Promise.all([
    prisma.avatar.findMany({
      where: avatarWhere,
      orderBy: { updatedAt: "desc" },
      take: 24,
      select: {
        id: true,
        name: true,
        displayName: true,
        status: true,
        updatedAt: true,
        _count: {
          select: {
            runtimeTraces: {
              where: {
                status: RuntimeTraceStatus.FAILURE,
                createdAt: { gte: start }
              }
            },
            safetyEvents: {
              where: {
                status: SafetyEventStatus.OPEN
              }
            }
          }
        }
      }
    }),
    prisma.runtimeTrace.count({
      where: {
        workspaceId,
        status: RuntimeTraceStatus.FAILURE,
        createdAt: { gte: start }
      }
    }),
    prisma.runtimeTrace.findMany({
      where: {
        workspaceId,
        status: RuntimeTraceStatus.FAILURE,
        createdAt: { gte: start }
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        avatar: { select: { name: true } }
      }
    }),
    prisma.runtimeTrace.findMany({
      where: {
        workspaceId,
        createdAt: { gte: start }
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        avatar: { select: { name: true } }
      }
    }),
    prisma.safetyEvent.count({
      where: {
        workspaceId,
        status: SafetyEventStatus.OPEN,
        createdAt: { gte: start }
      }
    }),
    prisma.safetyEvent.count({
      where: {
        workspaceId,
        status: SafetyEventStatus.OPEN,
        severity: { in: [SafetySeverity.HIGH, SafetySeverity.CRITICAL] },
        createdAt: { gte: start }
      }
    }),
    prisma.safetyEvent.findMany({
      where: {
        workspaceId,
        createdAt: { gte: start }
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        avatar: { select: { name: true } }
      }
    }),
    prisma.usageEvent.groupBy({
      by: ["eventType"],
      where: {
        workspaceId,
        createdAt: { gte: start }
      },
      _sum: { quantity: true }
    }),
    prisma.usageEvent.groupBy({
      by: ["eventType"],
      where: {
        workspaceId,
        createdAt: {
          gte: previousStart,
          lt: start
        }
      },
      _sum: { quantity: true }
    }),
    prisma.conversation.count({
      where: {
        workspaceId,
        channel: ConversationChannel.WIDGET,
        createdAt: { gte: start }
      }
    }),
    prisma.conversation.count({
      where: {
        workspaceId,
        channel: ConversationChannel.WIDGET,
        status: ConversationStatus.FAILED,
        createdAt: { gte: start }
      }
    })
  ])

  const runtimeFailures = failureTraceRows.map(traceItem)
  const recentTraces = recentTraceRows.map(traceItem)
  const providerErrors = runtimeFailures.filter(isProviderFailure).slice(0, 20)
  const durations = recentTraceRows
    .map(row => row.durationMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  const averageDuration = durations.length > 0
    ? durations.reduce((total, value) => total + value, 0) / durations.length
    : null
  const widgetErrorRate = widgetConversations > 0 ? widgetFailures / widgetConversations : 0
  const previousUsageByType = new Map(usagePrevious.map(row => [row.eventType, row._sum.quantity ?? 0]))
  const usageSpikes = usageCurrent.flatMap(row => {
    const currentQuantity = row._sum.quantity ?? 0
    const previousQuantity = previousUsageByType.get(row.eventType) ?? 0
    const spike = usageSpike(currentQuantity, previousQuantity)
    if (!spike.include) {
      return []
    }

    return [{
      eventType: row.eventType,
      currentQuantity,
      previousQuantity,
      ratio: spike.ratio
    }]
  }).sort((left, right) => right.currentQuantity - left.currentQuantity)

  return {
    filters,
    metrics: [
      {
        label: "Runtime failures",
        value: formatNumber(failedTraceCount),
        helper: `Observed in ${filters.period}`
      },
      {
        label: "Provider failures",
        value: formatNumber(providerErrors.length),
        helper: "Failure traces with provider context"
      },
      {
        label: "Average trace latency",
        value: averageDuration === null ? "N/A" : `${formatNumber(averageDuration)}ms`,
        helper: "Only traces with duration"
      },
      {
        label: "Open safety events",
        value: formatNumber(openSafetyCount),
        helper: `${formatNumber(criticalSafetyCount)} high or critical`
      },
      {
        label: "Widget error rate",
        value: formatPercent(widgetErrorRate),
        helper: `${formatNumber(widgetFailures)} failed widget conversations`
      },
      {
        label: "Usage spikes",
        value: formatNumber(usageSpikes.length),
        helper: "Compared to previous period"
      }
    ],
    avatars: avatars.map(avatar => ({
      id: avatar.id,
      name: avatar.name,
      displayName: avatar.displayName,
      status: avatar.status,
      updatedAt: formatWorkspaceLocalTime(avatar.updatedAt),
      failedTraceCount: avatar._count.runtimeTraces,
      openSafetyCount: avatar._count.safetyEvents
    })),
    providerErrors,
    runtimeFailures: runtimeFailures.slice(0, 20),
    recentTraces,
    safetyEvents: safetyRows.map(row => ({
      id: row.id,
      eventType: row.eventType,
      severity: row.severity,
      status: row.status,
      avatarId: row.avatarId,
      avatarName: row.avatar?.name ?? null,
      conversationId: row.conversationId,
      reason: row.reason,
      createdAt: formatWorkspaceLocalTime(row.createdAt)
    })),
    usageSpikes
  }
}
