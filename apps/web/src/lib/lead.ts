import {
  AvatarStatus,
  ConversationChannel,
  LeadSource,
  LeadStatus,
  SafetyAction,
  SafetySource,
  WorkspaceRole,
  type Prisma
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  fetchAvatarByIdAndWorkspace,
  formatWorkspaceLocalTime,
  isAvatarPublicRuntimeEligible
} from "@/lib/avatar"
import { hasWorkspaceRole } from "@/lib/workspace"
import {
  KioskPublicError,
  fetchOrCreateKioskSettings
} from "@/lib/kiosk"
import {
  WidgetPublicError,
  assertWidgetDomainAllowed
} from "@/lib/widget"
import {
  assessLeadInputSafety,
  recordSafetyEvent
} from "@/lib/safety"

export const LEAD_STATUS_FILTERS = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.QUALIFIED,
  LeadStatus.CLOSED,
  LeadStatus.SPAM
] as const

export const LEAD_SOURCE_FILTERS = [
  LeadSource.WIDGET,
  LeadSource.DASHBOARD_PREVIEW,
  LeadSource.KIOSK,
  LeadSource.API
] as const

export const LEAD_RECENT_PRESETS = ["all", "7d", "30d", "90d"] as const

export type LeadRecentWindow = (typeof LEAD_RECENT_PRESETS)[number]

export type LeadListFilters = {
  avatarId?: string
  status: LeadStatus | "ALL"
  source: LeadSource | "ALL"
  search?: string
  recent: LeadRecentWindow
}

export type LeadListItem = {
  id: string
  conversationId: string
  avatarId: string | null
  avatarName: string | null
  name: string | null
  email: string | null
  phone: string | null
  messagePreview: string | null
  source: LeadSource
  status: LeadStatus
  createdAt: string
  updatedAt: string
}

export type LeadDetail = LeadListItem & {
  message: string | null
  metadata: Record<string, unknown> | null
  conversationMessageCount: number
  conversationLatestPreview: string | null
}

export type LeadOverview = {
  totalLeads: number
  newLeads: number
  recentLeads: LeadListItem[]
}

export type LeadValidationResult = {
  values: {
    conversationId: string
    name: string | null
    email: string | null
    phone: string | null
    message: string | null
  }
  errors: Record<string, string>
}

const LEAD_NAME_MAX_LENGTH = 120
const LEAD_EMAIL_MAX_LENGTH = 254
const LEAD_PHONE_MAX_LENGTH = 32
const LEAD_MESSAGE_MAX_LENGTH = 1000
const LEAD_SEARCH_MIN_LENGTH = 2

function normalizeText(value: unknown): string {
  return String(value ?? "").trim()
}

function nullableText(value: unknown): string | null {
  const normalized = normalizeText(value)
  return normalized || null
}

function previewText(value: string | null, maxLength = 160): string | null {
  if (!value) {
    return null
  }

  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 1)}…`
}

function parseMetadata(raw: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null
  }

  return raw as Record<string, unknown>
}

function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function validatePhone(value: string): boolean {
  const compact = value.replace(/[\s().-]/g, "")
  return compact.length >= 7 && compact.length <= 20 && /^\+?[0-9]+$/.test(compact)
}

export function canManageLead(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

export function leadStatusLabel(status: LeadStatus): string {
  return status.replace(/_/g, " ")
}

export function leadSourceLabel(source: LeadSource): string {
  if (source === LeadSource.DASHBOARD_PREVIEW) {
    return "Dashboard preview"
  }

  return source
}

function parseLeadStatusFilter(value: string | undefined): LeadStatus | "ALL" {
  if (LEAD_STATUS_FILTERS.includes(value as LeadStatus)) {
    return value as LeadStatus
  }

  return "ALL"
}

function parseLeadSourceFilter(value: string | undefined): LeadSource | "ALL" {
  if (LEAD_SOURCE_FILTERS.includes(value as LeadSource)) {
    return value as LeadSource
  }

  return "ALL"
}

function parseRecentFilter(value: string | undefined): LeadRecentWindow {
  if (value === "7d" || value === "30d" || value === "90d") {
    return value
  }

  return "all"
}

function parseRecentCutoff(recent: LeadRecentWindow): Date | null {
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

export function parseLeadListSearchFilters(raw: {
  avatarId?: string
  status?: string
  source?: string
  q?: string
  recent?: string
}): LeadListFilters {
  const search = normalizeText(raw.q)

  return {
    avatarId: normalizeText(raw.avatarId) || undefined,
    status: parseLeadStatusFilter(raw.status),
    source: parseLeadSourceFilter(raw.source),
    search: search.length >= LEAD_SEARCH_MIN_LENGTH ? search : undefined,
    recent: parseRecentFilter(raw.recent)
  }
}

export function validateLeadPayload(body: unknown): LeadValidationResult {
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const conversationId = normalizeText(payload.conversationId)
  const name = nullableText(payload.name)
  const email = nullableText(payload.email)?.toLowerCase() ?? null
  const phone = nullableText(payload.phone)
  const message = nullableText(payload.message)
  const errors: Record<string, string> = {}

  if (!conversationId) {
    errors.conversationId = "Conversation is required."
  }

  if (name && name.length > LEAD_NAME_MAX_LENGTH) {
    errors.name = `Name must be ${LEAD_NAME_MAX_LENGTH} characters or fewer.`
  }

  if (email && (email.length > LEAD_EMAIL_MAX_LENGTH || !validateEmail(email))) {
    errors.email = "Enter a valid email address."
  }

  if (phone && (phone.length > LEAD_PHONE_MAX_LENGTH || !validatePhone(phone))) {
    errors.phone = "Enter a valid phone number."
  }

  if (message && message.length > LEAD_MESSAGE_MAX_LENGTH) {
    errors.message = `Message must be ${LEAD_MESSAGE_MAX_LENGTH} characters or fewer.`
  }

  if (!name && !email && !phone && !message) {
    errors.form = "Enter at least one contact detail or message."
  }

  return {
    values: {
      conversationId,
      name,
      email,
      phone,
      message
    },
    errors
  }
}

function mapLeadListItem(row: {
  id: string
  conversationId: string
  avatarId: string | null
  name: string | null
  email: string | null
  phone: string | null
  message: string | null
  source: LeadSource
  status: LeadStatus
  createdAt: Date
  updatedAt: Date
  avatar: { name: string } | null
}): LeadListItem {
  return {
    id: row.id,
    conversationId: row.conversationId,
    avatarId: row.avatarId,
    avatarName: row.avatar?.name ?? null,
    name: row.name,
    email: row.email,
    phone: row.phone,
    messagePreview: previewText(row.message),
    source: row.source,
    status: row.status,
    createdAt: formatWorkspaceLocalTime(row.createdAt),
    updatedAt: formatWorkspaceLocalTime(row.updatedAt)
  }
}

function buildLeadWhere(workspaceId: string, filters: LeadListFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { workspaceId }

  if (filters.avatarId) {
    where.avatarId = filters.avatarId
  }

  if (filters.status !== "ALL") {
    where.status = filters.status
  }

  if (filters.source !== "ALL") {
    where.source = filters.source
  }

  const recentCutoff = parseRecentCutoff(filters.recent)
  if (recentCutoff) {
    where.createdAt = { gte: recentCutoff }
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
      { phone: { contains: filters.search, mode: "insensitive" } },
      { message: { contains: filters.search, mode: "insensitive" } }
    ]
  }

  return where
}

export async function fetchLeadAvatarFilters(workspaceId: string): Promise<{ id: string; name: string }[]> {
  return prisma.avatar.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  })
}

export async function fetchLeadList(workspaceId: string, filters: LeadListFilters): Promise<LeadListItem[]> {
  const rows = await prisma.lead.findMany({
    where: buildLeadWhere(workspaceId, filters),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      conversationId: true,
      avatarId: true,
      name: true,
      email: true,
      phone: true,
      message: true,
      source: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      avatar: {
        select: { name: true }
      }
    }
  })

  return rows.map(mapLeadListItem)
}

export async function fetchLeadOverview(workspaceId: string): Promise<LeadOverview> {
  const [totalLeads, newLeads, recentRows] = await Promise.all([
    prisma.lead.count({ where: { workspaceId } }),
    prisma.lead.count({ where: { workspaceId, status: LeadStatus.NEW } }),
    prisma.lead.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        conversationId: true,
        avatarId: true,
        name: true,
        email: true,
        phone: true,
        message: true,
        source: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        avatar: {
          select: { name: true }
        }
      }
    })
  ])

  return {
    totalLeads,
    newLeads,
    recentLeads: recentRows.map(mapLeadListItem)
  }
}

export async function fetchLeadDetail(workspaceId: string, leadId: string): Promise<LeadDetail | null> {
  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      workspaceId
    },
    select: {
      id: true,
      conversationId: true,
      avatarId: true,
      name: true,
      email: true,
      phone: true,
      message: true,
      source: true,
      status: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      avatar: {
        select: { name: true }
      },
      conversation: {
        select: {
          _count: {
            select: { messages: true }
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true }
          }
        }
      }
    }
  })

  if (!lead) {
    return null
  }

  return {
    ...mapLeadListItem(lead),
    message: lead.message,
    metadata: parseMetadata(lead.metadata),
    conversationMessageCount: lead.conversation._count.messages,
    conversationLatestPreview: previewText(lead.conversation.messages[0]?.content ?? null)
  }
}

export async function submitWidgetLead(avatarId: string, request: Request, body: unknown): Promise<{ leadId: string; status: LeadStatus; duplicateBehavior: "created" | "updated" }> {
  const avatarRow = await prisma.avatar.findUnique({
    where: { id: avatarId },
    select: { workspaceId: true }
  })

  if (!avatarRow) {
    throw new WidgetPublicError(404, "avatar_not_found", "Avatar was not found.")
  }

  const domainAccess = await assertWidgetDomainAllowed(avatarRow.workspaceId, request)
  const avatar = await fetchAvatarByIdAndWorkspace(avatarRow.workspaceId, avatarId)

  if (!avatar || !isAvatarPublicRuntimeEligible(avatar) || avatar.status !== AvatarStatus.PUBLISHED) {
    throw new WidgetPublicError(404, "avatar_unavailable", "Avatar is not available for public widget use.")
  }

  const parsed = validateLeadPayload(body)
  if (Object.keys(parsed.errors).length > 0) {
    throw new WidgetPublicError(400, "invalid_lead", Object.values(parsed.errors)[0] ?? "Lead details are invalid.")
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: parsed.values.conversationId,
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      channel: ConversationChannel.WIDGET
    },
    select: {
      id: true,
      lead: {
        select: { id: true }
      }
    }
  })

  if (!conversation) {
    throw new WidgetPublicError(404, "conversation_not_found", "Conversation was not found for this widget session.")
  }

  const leadSafety = assessLeadInputSafety(parsed.values)
  if (leadSafety) {
    await recordSafetyEvent({
      workspaceId: avatar.workspaceId,
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
        domain: domainAccess.domain
      }
    })

    if (leadSafety.action === SafetyAction.BLOCK) {
      throw new WidgetPublicError(400, "lead_safety_blocked", "Lead details could not be accepted because the message appears unsafe.")
    }
  }

  const duplicateBehavior = conversation.lead ? "updated" : "created"
  const lead = await prisma.lead.upsert({
    where: { conversationId: conversation.id },
    create: {
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      conversationId: conversation.id,
      source: LeadSource.WIDGET,
      status: LeadStatus.NEW,
      name: parsed.values.name,
      email: parsed.values.email,
      phone: parsed.values.phone,
      message: parsed.values.message,
      metadata: {
        domain: domainAccess.domain,
        userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
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
        domain: domainAccess.domain,
        userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
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

  return {
    leadId: lead.id,
    status: lead.status,
    duplicateBehavior
  }
}

export async function submitKioskLead(avatarId: string, request: Request, body: unknown): Promise<{ leadId: string; status: LeadStatus; duplicateBehavior: "created" | "updated" }> {
  const avatarRow = await prisma.avatar.findUnique({
    where: { id: avatarId },
    select: { workspaceId: true }
  })

  if (!avatarRow) {
    throw new KioskPublicError(404, "avatar_not_found", "Avatar was not found.")
  }

  const avatar = await fetchAvatarByIdAndWorkspace(avatarRow.workspaceId, avatarId)

  if (!avatar || !isAvatarPublicRuntimeEligible(avatar) || avatar.status !== AvatarStatus.PUBLISHED) {
    throw new KioskPublicError(404, "avatar_unavailable", "Avatar is not available for kiosk use.")
  }

  const settings = await fetchOrCreateKioskSettings(avatar)
  if (!settings.enabled || !settings.leadCaptureEnabled) {
    throw new KioskPublicError(403, "lead_capture_disabled", "Lead capture is not enabled for this kiosk.")
  }

  const parsed = validateLeadPayload(body)
  if (Object.keys(parsed.errors).length > 0) {
    throw new KioskPublicError(400, "invalid_lead", Object.values(parsed.errors)[0] ?? "Lead details are invalid.")
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: parsed.values.conversationId,
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      channel: ConversationChannel.KIOSK
    },
    select: {
      id: true,
      lead: {
        select: { id: true }
      }
    }
  })

  if (!conversation) {
    throw new KioskPublicError(404, "conversation_not_found", "Conversation was not found for this kiosk session.")
  }

  const leadSafety = assessLeadInputSafety(parsed.values)
  if (leadSafety) {
    await recordSafetyEvent({
      workspaceId: avatar.workspaceId,
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
        surface: "kiosk"
      }
    })

    if (leadSafety.action === SafetyAction.BLOCK) {
      throw new KioskPublicError(400, "lead_safety_blocked", "Lead details could not be accepted because the message appears unsafe.")
    }
  }

  const duplicateBehavior = conversation.lead ? "updated" : "created"
  const lead = await prisma.lead.upsert({
    where: { conversationId: conversation.id },
    create: {
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      conversationId: conversation.id,
      source: LeadSource.KIOSK,
      status: LeadStatus.NEW,
      name: parsed.values.name,
      email: parsed.values.email,
      phone: parsed.values.phone,
      message: parsed.values.message,
      metadata: {
        surface: "kiosk",
        userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
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
        surface: "kiosk",
        userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
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

  return {
    leadId: lead.id,
    status: lead.status,
    duplicateBehavior
  }
}
