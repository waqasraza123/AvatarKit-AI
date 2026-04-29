import {
  AuditLogActorType,
  AuditLogTargetType,
  RuntimeTraceStatus,
  type Prisma
} from "@prisma/client"
import { formatWorkspaceLocalTime } from "@/lib/avatar"
import { prisma } from "@/lib/prisma"

type AuditMetadata = Record<string, unknown> | null | undefined

export type AuditLogInput = {
  workspaceId?: string | null
  actorUserId?: string | null
  actorType: AuditLogActorType
  action: string
  targetType: AuditLogTargetType
  targetId?: string | null
  metadata?: AuditMetadata
  ip?: string | null
  userAgent?: string | null
  required?: boolean
}

export type AuditLogListFilters = {
  workspaceId?: string | null
  action?: string
  actorType?: string
  targetType?: string
  recent?: "24h" | "7d" | "30d" | "all"
}

export type AuditLogListItem = {
  id: string
  workspaceId: string | null
  workspaceName: string | null
  actorUserId: string | null
  actorEmail: string | null
  actorType: AuditLogActorType
  action: string
  targetType: AuditLogTargetType
  targetId: string | null
  metadataSummary: string
  ip: string | null
  userAgent: string | null
  createdAt: string
}

const sensitiveKeyPattern = /(secret|token|key|hash|password|credential|authorization|cookie|session|prompt|private|signature)/i
const secretValuePatterns = [
  /sk-[a-z0-9_-]{16,}/gi,
  /avk_(?:live|test)_[a-z0-9]{12}_[a-zA-Z0-9_-]{16,}/gi,
  /whsec_[a-z0-9]{10}_[a-zA-Z0-9_-]{16,}/gi,
  /bearer\s+[a-z0-9._-]{12,}/gi,
  /token\s*[:=]\s*[a-z0-9._-]{12,}/gi,
  /password\s*[:=]\s*\S+/gi
]

function auditEnabled(): boolean {
  return String(process.env.AUDIT_LOG_ENABLED ?? "true").trim().toLowerCase() !== "false"
}

function metadataMaxLength(): number {
  const parsed = Number.parseInt(process.env.AUDIT_LOG_METADATA_MAX_LENGTH ?? "", 10)
  return Number.isFinite(parsed) && parsed > 200 ? parsed : 4000
}

function sanitizeString(value: string): string {
  const redacted = secretValuePatterns.reduce(
    (current, pattern) => current.replace(pattern, "[redacted]"),
    value
  )

  return redacted.length > 260 ? `${redacted.slice(0, 259)}...` : redacted
}

function sanitizeValue(key: string, value: unknown, depth: number): unknown {
  if (sensitiveKeyPattern.test(key)) {
    return "[redacted]"
  }

  if (typeof value === "string") {
    return sanitizeString(value)
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    if (depth >= 3) {
      return `[array:${value.length}]`
    }

    return value.slice(0, 20).map(item => sanitizeValue(key, item, depth + 1))
  }

  if (value && typeof value === "object") {
    if (depth >= 3) {
      return "[object]"
    }

    return sanitizeAuditMetadata(value as Record<string, unknown>, depth + 1)
  }

  return null
}

export function sanitizeAuditMetadata(metadata: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const sanitized = Object.fromEntries(
    Object.entries(metadata)
      .slice(0, 40)
      .map(([key, value]) => [key, sanitizeValue(key, value, depth)])
  )
  const serialized = JSON.stringify(sanitized)
  const maxLength = metadataMaxLength()

  if (serialized.length <= maxLength) {
    return sanitized
  }

  return {
    truncated: true,
    summary: sanitizeString(serialized.slice(0, maxLength))
  }
}

function toJsonValue(metadata: AuditMetadata): Prisma.InputJsonValue | undefined {
  if (!metadata) {
    return undefined
  }

  return JSON.parse(JSON.stringify(sanitizeAuditMetadata(metadata))) as Prisma.InputJsonValue
}

function targetTypeForAction(action: string): AuditLogTargetType {
  if (action.startsWith("api_key.")) {
    return AuditLogTargetType.API_KEY
  }

  if (action.startsWith("avatar.") || action.startsWith("avatar_") || action.startsWith("avatar.")) {
    return AuditLogTargetType.AVATAR
  }

  if (action.startsWith("workspace_branding.") || action.startsWith("widget_settings.")) {
    return AuditLogTargetType.BRANDING
  }

  if (action.startsWith("workspace_client_profile.")) {
    return AuditLogTargetType.WORKSPACE
  }

  if (action.startsWith("kiosk_settings.")) {
    return AuditLogTargetType.KIOSK_SETTINGS
  }

  if (action.startsWith("widget_domain.")) {
    return AuditLogTargetType.DOMAIN_ALLOWLIST
  }

  if (action.startsWith("webhook.")) {
    return AuditLogTargetType.WEBHOOK
  }

  if (action.startsWith("safety_event.")) {
    return AuditLogTargetType.SAFETY_EVENT
  }

  if (action.startsWith("billing.")) {
    return AuditLogTargetType.BILLING_SUBSCRIPTION
  }

  if (action.startsWith("lead.")) {
    return AuditLogTargetType.LEAD
  }

  return AuditLogTargetType.SYSTEM
}

function metadataString(metadata: AuditMetadata, key: string): string | null {
  if (!metadata) {
    return null
  }

  const value = metadata[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function targetIdForAction(input: {
  avatarId?: string | null
  conversationId?: string | null
  metadata?: AuditMetadata
}): string | null {
  return input.avatarId ??
    input.conversationId ??
    metadataString(input.metadata, "apiKeyId") ??
    metadataString(input.metadata, "webhookEndpointId") ??
    metadataString(input.metadata, "domainId") ??
    metadataString(input.metadata, "leadId") ??
    metadataString(input.metadata, "safetyEventId") ??
    metadataString(input.metadata, "workspaceId")
}

async function recordRuntimeTraceContinuity(input: {
  workspaceId?: string | null
  actorUserId?: string | null
  avatarId?: string | null
  conversationId?: string | null
  action: string
  metadata?: AuditMetadata
}): Promise<void> {
  if (!input.workspaceId) {
    return
  }

  await prisma.runtimeTrace.create({
    data: {
      workspaceId: input.workspaceId,
      avatarId: input.avatarId ?? null,
      conversationId: input.conversationId ?? null,
      eventType: `audit.${input.action}`,
      status: RuntimeTraceStatus.SUCCESS,
      metadata: toJsonValue({
        actorUserId: input.actorUserId ?? null,
        ...(input.metadata ?? {})
      })
    }
  }).catch(() => undefined)
}

export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  if (!auditEnabled()) {
    return
  }

  const write = prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: toJsonValue(input.metadata),
      ip: input.ip ?? null,
      userAgent: input.userAgent ? sanitizeString(input.userAgent) : null
    }
  })

  if (input.required) {
    await write
    return
  }

  await write.catch(() => undefined)
}

export async function recordUserAuditLog(input: Omit<AuditLogInput, "actorType">): Promise<void> {
  await recordAuditLog({
    ...input,
    actorType: AuditLogActorType.USER
  })
}

export async function recordPlatformAdminAuditLog(input: Omit<AuditLogInput, "actorType">): Promise<void> {
  await recordAuditLog({
    ...input,
    actorType: AuditLogActorType.PLATFORM_ADMIN,
    required: input.required ?? true
  })
}

export async function recordApiKeyAuditLog(input: Omit<AuditLogInput, "actorType">): Promise<void> {
  await recordAuditLog({
    ...input,
    actorType: AuditLogActorType.API_KEY
  })
}

export async function recordMutationAuditEvent(input: {
  workspaceId: string
  actorUserId?: string | null
  avatarId?: string | null
  conversationId?: string | null
  eventType: string
  metadata?: AuditMetadata
}): Promise<void> {
  if (!input.workspaceId || !input.eventType) {
    return
  }

  await Promise.all([
    recordUserAuditLog({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      action: input.eventType,
      targetType: targetTypeForAction(input.eventType),
      targetId: targetIdForAction(input),
      metadata: input.metadata
    }),
    recordRuntimeTraceContinuity({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      avatarId: input.avatarId,
      conversationId: input.conversationId,
      action: input.eventType,
      metadata: input.metadata
    })
  ])
}

function recentStart(recent: AuditLogListFilters["recent"]): Date | undefined {
  if (recent === "24h") {
    return new Date(Date.now() - 24 * 60 * 60 * 1000)
  }

  if (recent === "7d") {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  }

  if (recent === "30d") {
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  }

  return undefined
}

function safeEnumValue<T extends string>(value: string | undefined, values: readonly T[]): T | undefined {
  return values.includes(value as T) ? value as T : undefined
}

function summarizeMetadata(metadata: Prisma.JsonValue | null): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "No metadata"
  }

  const entries = Object.entries(metadata as Record<string, unknown>)
    .slice(0, 6)
    .map(([key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return `${key}: ${String(value)}`
      }

      if (value === null) {
        return `${key}: null`
      }

      return `${key}: ${Array.isArray(value) ? "list" : "object"}`
    })

  return entries.length > 0 ? entries.join("; ") : "No metadata"
}

export async function listAuditLogs(filters: AuditLogListFilters): Promise<AuditLogListItem[]> {
  const start = recentStart(filters.recent ?? "7d")
  const actorType = safeEnumValue(filters.actorType, Object.values(AuditLogActorType))
  const targetType = safeEnumValue(filters.targetType, Object.values(AuditLogTargetType))

  const rows = await prisma.auditLog.findMany({
    where: {
      workspaceId: filters.workspaceId === null ? undefined : filters.workspaceId || undefined,
      action: filters.action ? { contains: filters.action, mode: "insensitive" } : undefined,
      actorType,
      targetType,
      createdAt: start ? { gte: start } : undefined
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      actorUser: {
        select: { email: true }
      },
      workspace: {
        select: { name: true }
      }
    }
  })

  return rows.map(row => ({
    id: row.id,
    workspaceId: row.workspaceId,
    workspaceName: row.workspace?.name ?? null,
    actorUserId: row.actorUserId,
    actorEmail: row.actorUser?.email ?? null,
    actorType: row.actorType,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadataSummary: summarizeMetadata(row.metadata),
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: formatWorkspaceLocalTime(row.createdAt)
  }))
}
