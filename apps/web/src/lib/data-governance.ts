import {
  AuditLogTargetType,
  WorkspaceDeletionRequestStatus,
  WorkspaceExportStatus,
  type Prisma
} from "@prisma/client"
import { formatWorkspaceLocalTime } from "@/lib/avatar"
import { prisma } from "@/lib/prisma"

export const WORKSPACE_EXPORT_SCOPE = [
  "workspace",
  "members",
  "avatars",
  "knowledge",
  "conversations",
  "leads",
  "usage",
  "safety",
  "settings",
  "developers",
  "audit"
] as const

const deletionScheduleDays = 7
const exportRetentionDays = 7

export type DataGovernanceCounts = {
  avatars: number
  avatarAssets: number
  consentRecords: number
  knowledgeSources: number
  knowledgeChunks: number
  conversations: number
  messages: number
  leads: number
  usageEvents: number
  safetyEvents: number
  knowledgeGaps: number
  realtimeSessions: number
  apiKeys: number
  webhookEndpoints: number
  auditLogs: number
}

export type WorkspaceDataExportListItem = {
  id: string
  status: WorkspaceExportStatus
  requestedByEmail: string | null
  scope: string[]
  recordCounts: Record<string, number>
  expiresAt: string
  createdAt: string
  downloadHref: string | null
}

export type WorkspaceDeletionRequestListItem = {
  id: string
  status: WorkspaceDeletionRequestStatus
  requestedByEmail: string | null
  canceledByEmail: string | null
  reason: string | null
  scheduledDeletionAt: string
  canceledAt: string | null
  completedAt: string | null
  createdAt: string
  canCancel: boolean
}

export type DataGovernanceSummary = {
  counts: DataGovernanceCounts
  exports: WorkspaceDataExportListItem[]
  deletionRequests: WorkspaceDeletionRequestListItem[]
  activeDeletionRequest: WorkspaceDeletionRequestListItem | null
}

type JsonRecord = Record<string, unknown>

const sensitiveExportKeyPattern = /(secret|token|keyHash|password|credential|authorization|cookie|sessionToken|signingSecretHash|private|providerPayload|rawResponse|rawRequest|environment|env)/i

function expiresAt(): Date {
  return new Date(Date.now() + exportRetentionDays * 24 * 60 * 60 * 1000)
}

function scheduledDeletionAt(): Date {
  return new Date(Date.now() + deletionScheduleDays * 24 * 60 * 60 * 1000)
}

function jsonRecord(value: Prisma.JsonValue | null): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as JsonRecord
}

function countManifest(value: Prisma.JsonValue | null): Record<string, number> {
  const record = jsonRecord(value)
  const counts = record.recordCounts

  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(counts as Record<string, unknown>)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
  )
}

function dataExportHref(row: {
  id: string
  status: WorkspaceExportStatus
  expiresAt: Date
}): string | null {
  if (row.status !== WorkspaceExportStatus.COMPLETED || row.expiresAt <= new Date()) {
    return null
  }

  return `/api/dashboard/data-exports/${row.id}/download`
}

async function getWorkspaceCounts(workspaceId: string): Promise<DataGovernanceCounts> {
  const [
    avatars,
    avatarAssets,
    consentRecords,
    knowledgeSources,
    knowledgeChunks,
    conversations,
    leads,
    usageEvents,
    safetyEvents,
    knowledgeGaps,
    realtimeSessions,
    apiKeys,
    webhookEndpoints,
    auditLogs,
    messageRows
  ] = await prisma.$transaction([
    prisma.avatar.count({ where: { workspaceId } }),
    prisma.avatarAsset.count({ where: { workspaceId } }),
    prisma.consentRecord.count({ where: { workspaceId } }),
    prisma.knowledgeSource.count({ where: { workspaceId } }),
    prisma.knowledgeChunk.count({ where: { workspaceId } }),
    prisma.conversation.count({ where: { workspaceId } }),
    prisma.lead.count({ where: { workspaceId } }),
    prisma.usageEvent.count({ where: { workspaceId } }),
    prisma.safetyEvent.count({ where: { workspaceId } }),
    prisma.knowledgeGap.count({ where: { workspaceId } }),
    prisma.realtimeSession.count({ where: { workspaceId } }),
    prisma.apiKey.count({ where: { workspaceId } }),
    prisma.webhookEndpoint.count({ where: { workspaceId } }),
    prisma.auditLog.count({ where: { workspaceId } }),
    prisma.message.count({
      where: {
        conversation: { workspaceId }
      }
    })
  ])

  return {
    avatars,
    avatarAssets,
    consentRecords,
    knowledgeSources,
    knowledgeChunks,
    conversations,
    messages: messageRows,
    leads,
    usageEvents,
    safetyEvents,
    knowledgeGaps,
    realtimeSessions,
    apiKeys,
    webhookEndpoints,
    auditLogs
  }
}

export async function getDataGovernanceSummary(workspaceId: string): Promise<DataGovernanceSummary> {
  const [counts, exports, deletionRequests] = await Promise.all([
    getWorkspaceCounts(workspaceId),
    prisma.workspaceDataExport.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        requestedByUser: {
          select: { email: true }
        }
      }
    }),
    prisma.workspaceDeletionRequest.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        requestedByUser: {
          select: { email: true }
        },
        canceledByUser: {
          select: { email: true }
        }
      }
    })
  ])

  const deletionRows = deletionRequests.map(row => ({
    id: row.id,
    status: row.status,
    requestedByEmail: row.requestedByUser?.email ?? null,
    canceledByEmail: row.canceledByUser?.email ?? null,
    reason: row.reason,
    scheduledDeletionAt: formatWorkspaceLocalTime(row.scheduledDeletionAt),
    canceledAt: row.canceledAt ? formatWorkspaceLocalTime(row.canceledAt) : null,
    completedAt: row.completedAt ? formatWorkspaceLocalTime(row.completedAt) : null,
    createdAt: formatWorkspaceLocalTime(row.createdAt),
    canCancel: row.status === WorkspaceDeletionRequestStatus.PENDING
  }))

  return {
    counts,
    exports: exports.map(row => ({
      id: row.id,
      status: row.status,
      requestedByEmail: row.requestedByUser?.email ?? null,
      scope: row.scope,
      recordCounts: countManifest(row.manifest),
      expiresAt: formatWorkspaceLocalTime(row.expiresAt),
      createdAt: formatWorkspaceLocalTime(row.createdAt),
      downloadHref: dataExportHref(row)
    })),
    deletionRequests: deletionRows,
    activeDeletionRequest: deletionRows.find(row => row.status === WorkspaceDeletionRequestStatus.PENDING) ?? null
  }
}

export async function createWorkspaceDataExport(input: {
  workspaceId: string
  requestedByUserId: string
}): Promise<string> {
  const counts = await getWorkspaceCounts(input.workspaceId)
  const now = new Date()
  const row = await prisma.workspaceDataExport.create({
    data: {
      workspaceId: input.workspaceId,
      requestedByUserId: input.requestedByUserId,
      status: WorkspaceExportStatus.COMPLETED,
      scope: [...WORKSPACE_EXPORT_SCOPE],
      manifest: {
        generatedAt: now.toISOString(),
        retentionDays: exportRetentionDays,
        recordCounts: counts,
        redactions: [
          "user.passwordHash",
          "session.token",
          "apiKey.keyHash",
          "webhookEndpoint.signingSecretHash",
          "private provider secrets",
          "raw environment values"
        ]
      },
      completedAt: now,
      expiresAt: expiresAt()
    },
    select: { id: true }
  })

  return row.id
}

export async function createWorkspaceDeletionRequest(input: {
  workspaceId: string
  requestedByUserId: string
  reason: string | null
}): Promise<string> {
  const existing = await prisma.workspaceDeletionRequest.findFirst({
    where: {
      workspaceId: input.workspaceId,
      status: WorkspaceDeletionRequestStatus.PENDING
    },
    select: { id: true }
  })

  if (existing) {
    return existing.id
  }

  const row = await prisma.workspaceDeletionRequest.create({
    data: {
      workspaceId: input.workspaceId,
      requestedByUserId: input.requestedByUserId,
      status: WorkspaceDeletionRequestStatus.PENDING,
      reason: input.reason,
      scheduledDeletionAt: scheduledDeletionAt(),
      metadata: {
        scheduleDays: deletionScheduleDays,
        deletionExecution: "manual_or_future_worker",
        auditTargetType: AuditLogTargetType.DELETION_REQUEST
      }
    },
    select: { id: true }
  })

  return row.id
}

export async function cancelWorkspaceDeletionRequest(input: {
  workspaceId: string
  deletionRequestId: string
  canceledByUserId: string
}): Promise<boolean> {
  const updated = await prisma.workspaceDeletionRequest.updateMany({
    where: {
      id: input.deletionRequestId,
      workspaceId: input.workspaceId,
      status: WorkspaceDeletionRequestStatus.PENDING
    },
    data: {
      status: WorkspaceDeletionRequestStatus.CANCELED,
      canceledAt: new Date(),
      canceledByUserId: input.canceledByUserId
    }
  })

  return updated.count > 0
}

function serializeRecord(value: unknown): unknown {
  return sanitizeExportValue("", value)
}

function sanitizeExportString(value: string): string {
  return value.length > 4000 ? `${value.slice(0, 3999)}...` : value
}

function sanitizeExportValue(key: string, value: unknown): unknown {
  if (sensitiveExportKeyPattern.test(key)) {
    return "[redacted]"
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeExportValue(key, item))
  }

  if (typeof value === "string") {
    return sanitizeExportString(value)
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([recordKey, recordValue]) => [recordKey, sanitizeExportValue(recordKey, recordValue)])
    )
  }

  return value
}

export async function buildWorkspaceExportPayload(exportId: string) {
  const exportRecord = await prisma.workspaceDataExport.findUnique({
    where: { id: exportId },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      scope: true,
      manifest: true,
      completedAt: true,
      expiresAt: true,
      createdAt: true
    }
  })

  if (!exportRecord || exportRecord.status !== WorkspaceExportStatus.COMPLETED || exportRecord.expiresAt <= new Date()) {
    return null
  }

  const workspaceId = exportRecord.workspaceId
  const [
    workspace,
    members,
    avatars,
    knowledgeSources,
    conversations,
    leads,
    usageEvents,
    safetyEvents,
    knowledgeGaps,
    realtimeSessions,
    widgetSettings,
    kioskSettings,
    allowedDomains,
    branding,
    clientProfile,
    billingAccount,
    apiKeys,
    webhookEndpoints,
    auditLogs
  ] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, slug: true, createdAt: true, updatedAt: true }
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: { id: true, email: true, displayName: true, createdAt: true }
        }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.avatar.findMany({
      where: { workspaceId },
      include: {
        voice: {
          select: {
            id: true,
            provider: true,
            providerVoiceId: true,
            name: true,
            language: true,
            style: true,
            presentationStyle: true,
            previewUrl: true,
            status: true
          }
        },
        photoAssets: {
          select: {
            id: true,
            type: true,
            displayUrl: true,
            originalFileName: true,
            mimeType: true,
            sizeBytes: true,
            width: true,
            height: true,
            validationStatus: true,
            validationIssues: true,
            createdAt: true,
            updatedAt: true
          }
        },
        consentRecords: {
          select: {
            id: true,
            avatarAssetId: true,
            acceptedByUserId: true,
            consentType: true,
            permissionBasis: true,
            termsVersion: true,
            acceptedAt: true,
            createdAt: true,
            updatedAt: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.knowledgeSource.findMany({
      where: { workspaceId },
      include: {
        chunks: {
          select: {
            id: true,
            content: true,
            position: true,
            metadata: true,
            createdAt: true
          },
          orderBy: { position: "asc" }
        }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.conversation.findMany({
      where: { workspaceId },
      include: {
        messages: {
          select: {
            id: true,
            role: true,
            content: true,
            audioUrl: true,
            videoUrl: true,
            metadata: true,
            createdAt: true
          },
          orderBy: { createdAt: "asc" }
        },
        runtimeTraces: {
          select: {
            id: true,
            avatarId: true,
            eventType: true,
            durationMs: true,
            status: true,
            metadata: true,
            createdAt: true
          },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.lead.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.usageEvent.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.safetyEvent.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.knowledgeGap.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.realtimeSession.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.widgetSettings.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.kioskSettings.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.allowedDomain.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.workspaceBranding.findUnique({ where: { workspaceId } }),
    prisma.workspaceClientProfile.findUnique({ where: { workspaceId } }),
    prisma.billingAccount.findUnique({ where: { workspaceId } }),
    prisma.apiKey.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        createdByUserId: true,
        revokedByUserId: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.webhookEndpoint.findMany({
      where: { workspaceId },
      select: {
        id: true,
        url: true,
        description: true,
        events: true,
        signingSecretPrefix: true,
        createdByUserId: true,
        revokedByUserId: true,
        lastDeliveryAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.auditLog.findMany({
      where: { workspaceId },
      select: {
        id: true,
        actorUserId: true,
        actorType: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true
      },
      orderBy: { createdAt: "asc" }
    })
  ])

  if (!workspace) {
    return null
  }

  return serializeRecord({
    export: {
      id: exportRecord.id,
      workspaceId,
      scope: exportRecord.scope,
      manifest: exportRecord.manifest,
      completedAt: exportRecord.completedAt,
      expiresAt: exportRecord.expiresAt,
      createdAt: exportRecord.createdAt
    },
    workspace,
    members,
    avatars,
    knowledgeSources,
    conversations,
    leads,
    usageEvents,
    safetyEvents,
    knowledgeGaps,
    realtimeSessions,
    settings: {
      widgetSettings,
      kioskSettings,
      allowedDomains,
      branding,
      clientProfile,
      billingAccount
    },
    developers: {
      apiKeys,
      webhookEndpoints
    },
    auditLogs
  })
}
