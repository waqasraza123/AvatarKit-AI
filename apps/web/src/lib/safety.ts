import {
  AvatarStatus,
  SafetyAction,
  SafetyEventStatus,
  SafetyEventType,
  SafetySeverity,
  SafetySource,
  WorkspaceRole,
  type Prisma
} from "@prisma/client"
import { formatWorkspaceLocalTime } from "@/lib/avatar"
import { prisma } from "@/lib/prisma"
import { hasWorkspaceRole } from "@/lib/workspace"
import type { RuntimeSafetyResult } from "@/lib/avatar-runtime-client"

export const SAFETY_EVENT_TYPES = [
  SafetyEventType.unsafe_user_input,
  SafetyEventType.unsafe_avatar_instruction,
  SafetyEventType.unsupported_medical_request,
  SafetyEventType.unsupported_legal_request,
  SafetyEventType.unsupported_financial_request,
  SafetyEventType.impersonation_risk,
  SafetyEventType.public_figure_risk,
  SafetyEventType.fake_endorsement_risk,
  SafetyEventType.abusive_message,
  SafetyEventType.prompt_injection_attempt,
  SafetyEventType.generated_answer_blocked,
  SafetyEventType.generated_answer_rewritten,
  SafetyEventType.handoff_forced,
  SafetyEventType.lead_input_flagged,
  SafetyEventType.consent_required,
  SafetyEventType.avatar_suspended
] as const

export const SAFETY_SEVERITIES = [
  SafetySeverity.LOW,
  SafetySeverity.MEDIUM,
  SafetySeverity.HIGH,
  SafetySeverity.CRITICAL
] as const

export const SAFETY_STATUSES = [
  SafetyEventStatus.OPEN,
  SafetyEventStatus.REVIEWED,
  SafetyEventStatus.DISMISSED,
  SafetyEventStatus.RESOLVED
] as const

export const SAFETY_ACTIONS = [
  SafetyAction.ALLOW,
  SafetyAction.WARN,
  SafetyAction.REWRITE,
  SafetyAction.REFUSE,
  SafetyAction.HANDOFF,
  SafetyAction.BLOCK,
  SafetyAction.SUSPEND_AVATAR
] as const

export const SAFETY_SOURCES = [
  SafetySource.AVATAR_SETUP,
  SafetySource.DASHBOARD_PREVIEW,
  SafetySource.WIDGET_RUNTIME,
  SafetySource.LEAD_CAPTURE,
  SafetySource.SYSTEM
] as const

export type SafetyPolicyResult = {
  allowed: boolean
  severity: SafetySeverity
  action: SafetyAction
  reason: string
  fallbackAnswer?: string
  handoffRequired: boolean
  eventType: SafetyEventType
  metadata: Record<string, unknown>
}

export type RecordSafetyEventInput = {
  workspaceId: string
  avatarId?: string | null
  conversationId?: string | null
  messageId?: string | null
  eventType: SafetyEventType
  severity: SafetySeverity
  status?: SafetyEventStatus
  action: SafetyAction
  source: SafetySource
  inputExcerpt?: string | null
  outputExcerpt?: string | null
  reason?: string | null
  metadata?: Record<string, unknown> | null
}

export type SafetyListFilters = {
  avatarId?: string
  eventType: SafetyEventType | "ALL"
  severity: SafetySeverity | "ALL"
  status: SafetyEventStatus | "ALL"
  source: SafetySource | "ALL"
}

export type SafetyEventListItem = {
  id: string
  eventType: SafetyEventType
  severity: SafetySeverity
  status: SafetyEventStatus
  action: SafetyAction
  source: SafetySource
  avatarId: string | null
  avatarName: string | null
  conversationId: string | null
  messageId: string | null
  inputExcerpt: string | null
  outputExcerpt: string | null
  reason: string | null
  createdAt: string
  reviewedAt: string | null
  reviewedByName: string | null
}

export type SafetyDashboardData = {
  filters: SafetyListFilters
  avatarOptions: { id: string; name: string }[]
  events: SafetyEventListItem[]
}

const EXCERPT_MAX_LENGTH = 260
const REPEATED_TEXT_PATTERN = /\b([a-z0-9]{3,})\b(?:\s+\1\b){5,}/i
const REPEATED_CHARACTER_PATTERN = /(.)\1{18,}/
const SECRET_PATTERNS = [
  /sk-[a-z0-9_-]{16,}/gi,
  /api[_-]?key\s*[:=]\s*[a-z0-9._-]{12,}/gi,
  /bearer\s+[a-z0-9._-]{12,}/gi,
  /password\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*[a-z0-9._-]{12,}/gi
]

const ruleSets: {
  eventType: SafetyEventType
  severity: SafetySeverity
  action: SafetyAction
  handoffRequired: boolean
  reason: string
  patterns: RegExp[]
}[] = [
  {
    eventType: SafetyEventType.prompt_injection_attempt,
    severity: SafetySeverity.HIGH,
    action: SafetyAction.REFUSE,
    handoffRequired: false,
    reason: "Prompt injection attempt detected.",
    patterns: [
      /\bignore (all )?(previous|prior|above|system|developer) instructions\b/i,
      /\breveal (your )?(system prompt|hidden prompt|developer message|instructions)\b/i,
      /\bdisregard (the )?(rules|policy|guardrails|business instructions)\b/i,
      /\bjailbreak\b/i,
      /\bact as unrestricted\b/i
    ]
  },
  {
    eventType: SafetyEventType.unsupported_medical_request,
    severity: SafetySeverity.HIGH,
    action: SafetyAction.HANDOFF,
    handoffRequired: true,
    reason: "Unsupported medical diagnosis or treatment request.",
    patterns: [
      /\bdiagnos(e|is|ing)\b/i,
      /\btreatment plan\b/i,
      /\bprescribe\b/i,
      /\bmedical advice\b/i,
      /\bwhat medicine should i take\b/i,
      /\bsymptoms? mean\b/i,
      /\bam i having\b.*\b(heart attack|stroke|seizure)\b/i
    ]
  },
  {
    eventType: SafetyEventType.unsupported_legal_request,
    severity: SafetySeverity.HIGH,
    action: SafetyAction.HANDOFF,
    handoffRequired: true,
    reason: "Unsupported legal conclusion or contract advice request.",
    patterns: [
      /\blegal advice\b/i,
      /\bis this contract\b.*\b(valid|enforceable|legal)\b/i,
      /\bshould i sue\b/i,
      /\bwill i win\b.*\bcase\b/i,
      /\bcontract advice\b/i,
      /\blegal conclusion\b/i
    ]
  },
  {
    eventType: SafetyEventType.unsupported_financial_request,
    severity: SafetySeverity.HIGH,
    action: SafetyAction.HANDOFF,
    handoffRequired: true,
    reason: "Unsupported financial advice or guaranteed return request.",
    patterns: [
      /\bguarantee(d)? returns?\b/i,
      /\bwhat stock should i buy\b/i,
      /\binvestment advice\b/i,
      /\bfinancial advice\b/i,
      /\bmake me rich\b/i,
      /\brisk[- ]?free profit\b/i,
      /\bdouble my money\b/i
    ]
  },
  {
    eventType: SafetyEventType.fake_endorsement_risk,
    severity: SafetySeverity.HIGH,
    action: SafetyAction.REFUSE,
    handoffRequired: false,
    reason: "Fake endorsement or testimonial request detected.",
    patterns: [
      /\b(fake|invent|fabricate|make up)\b.*\b(testimonial|review|endorsement)\b/i,
      /\bclaim\b.*\b(celebrity|famous|influencer)\b.*\b(endorses|recommends|uses)\b/i,
      /\bsay\b.*\bendorses this business\b/i
    ]
  },
  {
    eventType: SafetyEventType.public_figure_risk,
    severity: SafetySeverity.HIGH,
    action: SafetyAction.REFUSE,
    handoffRequired: false,
    reason: "Public figure identity risk detected.",
    patterns: [
      /\bpretend (to be|you are)\b.*\b(celebrity|public figure|president|prime minister|actor|singer|athlete)\b/i,
      /\bact as\b.*\b(elon musk|taylor swift|cristiano ronaldo|lionel messi|donald trump|joe biden)\b/i,
      /\buse\b.*\b(celebrity|public figure)\b.*\bidentity\b/i
    ]
  },
  {
    eventType: SafetyEventType.impersonation_risk,
    severity: SafetySeverity.HIGH,
    action: SafetyAction.REFUSE,
    handoffRequired: false,
    reason: "Impersonation or deceptive identity request detected.",
    patterns: [
      /\bpretend (to be|you are)\b.*\b(real human|real person|staff member|doctor|lawyer|advisor)\b/i,
      /\bsay you are (a )?(real human|person|employee|staff)\b/i,
      /\bhide that you are (an )?ai\b/i,
      /\bdo not disclose (you are|that you are) (an )?ai\b/i,
      /\bimpersonate\b/i
    ]
  },
  {
    eventType: SafetyEventType.abusive_message,
    severity: SafetySeverity.CRITICAL,
    action: SafetyAction.BLOCK,
    handoffRequired: true,
    reason: "Threatening, abusive, or harmful language detected.",
    patterns: [
      /\bi will (kill|hurt|attack|destroy)\b/i,
      /\bkill yourself\b/i,
      /\bmake a bomb\b/i,
      /\bhow to (hack|steal|phish|defraud)\b/i,
      /\bcredit card fraud\b/i
    ]
  }
]

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "[redacted]"),
    value
  )
}

export function buildSafeExcerpt(value: unknown): string | null {
  const normalized = redactSecrets(normalizeText(value))
  if (!normalized) {
    return null
  }

  if (normalized.length <= EXCERPT_MAX_LENGTH) {
    return normalized
  }

  return `${normalized.slice(0, EXCERPT_MAX_LENGTH - 1)}…`
}

function sanitizeMetadata(metadata: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (!metadata) {
    return undefined
  }

  const redacted = JSON.parse(JSON.stringify(metadata, (_key, value) => {
    if (typeof value === "string") {
      return buildSafeExcerpt(value)
    }

    return value
  })) as Prisma.InputJsonValue

  return redacted
}

export function assessTextSafety(text: string, metadata: Record<string, unknown> = {}): SafetyPolicyResult | null {
  const normalized = normalizeText(text)
  if (!normalized) {
    return null
  }

  if (REPEATED_CHARACTER_PATTERN.test(normalized) || REPEATED_TEXT_PATTERN.test(normalized)) {
    return {
      allowed: true,
      severity: SafetySeverity.LOW,
      action: SafetyAction.WARN,
      reason: "Repeated or low-information text was flagged for review.",
      handoffRequired: false,
      eventType: SafetyEventType.lead_input_flagged,
      metadata: { ...metadata, rule: "repeated_text" }
    }
  }

  for (const rule of ruleSets) {
    if (rule.patterns.some(pattern => pattern.test(normalized))) {
      return {
        allowed: rule.action !== SafetyAction.BLOCK && rule.action !== SafetyAction.REFUSE,
        severity: rule.severity,
        action: rule.action,
        reason: rule.reason,
        fallbackAnswer: rule.handoffRequired
          ? "I can’t handle that safely here. A human team member should review this request."
          : "I can’t help with that request, but I can answer questions within the approved business information.",
        handoffRequired: rule.handoffRequired,
        eventType: rule.eventType,
        metadata: { ...metadata, rule: rule.eventType }
      }
    }
  }

  return null
}

export function validateAvatarBehaviorSafety(input: {
  greeting: string
  businessInstructions: string
  fallbackMessage: string
  handoffPreference: string
}): SafetyPolicyResult | null {
  const combined = [
    input.greeting,
    input.businessInstructions,
    input.fallbackMessage,
    input.handoffPreference
  ].join(" ")

  const result = assessTextSafety(combined, { policySurface: "avatar_behavior" })
  if (!result) {
    return null
  }

  return {
    ...result,
    allowed: false,
    action: SafetyAction.BLOCK,
    eventType: SafetyEventType.unsafe_avatar_instruction,
    reason: result.eventType === SafetyEventType.unsafe_avatar_instruction
      ? result.reason
      : `Avatar behavior contains unsafe instruction: ${result.reason}`
  }
}

export function assessLeadInputSafety(input: {
  name: string | null
  email: string | null
  phone: string | null
  message: string | null
}): SafetyPolicyResult | null {
  const combined = [
    input.name,
    input.email,
    input.phone,
    input.message
  ].filter(Boolean).join(" ")

  const result = assessTextSafety(combined, { policySurface: "lead_capture" })
  if (!result) {
    return null
  }

  if (result.severity === SafetySeverity.LOW) {
    return result
  }

  return {
    ...result,
    eventType: result.eventType === SafetyEventType.abusive_message
      ? SafetyEventType.abusive_message
      : SafetyEventType.lead_input_flagged,
    action: result.severity === SafetySeverity.CRITICAL ? SafetyAction.BLOCK : SafetyAction.WARN,
    allowed: result.severity !== SafetySeverity.CRITICAL,
    reason: result.reason
  }
}

export async function recordSafetyEvent(input: RecordSafetyEventInput): Promise<boolean> {
  if (!input.workspaceId) {
    return false
  }

  try {
    await prisma.safetyEvent.create({
      data: {
        workspaceId: input.workspaceId,
        avatarId: input.avatarId ?? null,
        conversationId: input.conversationId ?? null,
        messageId: input.messageId ?? null,
        eventType: input.eventType,
        severity: input.severity,
        status: input.status ?? SafetyEventStatus.OPEN,
        action: input.action,
        source: input.source,
        inputExcerpt: buildSafeExcerpt(input.inputExcerpt),
        outputExcerpt: buildSafeExcerpt(input.outputExcerpt),
        reason: buildSafeExcerpt(input.reason),
        metadata: sanitizeMetadata(input.metadata)
      }
    })
    return true
  } catch (error) {
    console.error("Safety event recording failed", {
      eventType: input.eventType,
      workspaceId: input.workspaceId,
      avatarId: input.avatarId ?? null,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      error
    })
    return false
  }
}

export async function recordRuntimeSafetyEvents(params: {
  workspaceId: string
  avatarId: string
  conversationId: string
  inputMessageId: string
  outputMessageId?: string | null
  source: SafetySource
  inputText?: string | null
  outputText?: string | null
  safetyEvents?: RuntimeSafetyResult[] | null
}): Promise<number> {
  const events = params.safetyEvents ?? []
  if (events.length === 0) {
    return 0
  }

  let created = 0
  for (const event of events) {
    const recorded = await recordSafetyEvent({
      workspaceId: params.workspaceId,
      avatarId: params.avatarId,
      conversationId: params.conversationId,
      messageId: event.eventType === SafetyEventType.unsafe_user_input
        || event.eventType === SafetyEventType.unsupported_medical_request
        || event.eventType === SafetyEventType.unsupported_legal_request
        || event.eventType === SafetyEventType.unsupported_financial_request
        || event.eventType === SafetyEventType.prompt_injection_attempt
        || event.eventType === SafetyEventType.impersonation_risk
        || event.eventType === SafetyEventType.public_figure_risk
        || event.eventType === SafetyEventType.fake_endorsement_risk
        || event.eventType === SafetyEventType.abusive_message
          ? params.inputMessageId
          : params.outputMessageId ?? params.inputMessageId,
      eventType: event.eventType,
      severity: event.severity,
      action: event.action,
      source: params.source,
      inputExcerpt: params.inputText,
      outputExcerpt: event.fallbackAnswer ?? params.outputText,
      reason: event.reason,
      metadata: event.metadata ?? null
    })
    if (recorded) {
      created += 1
    }
  }

  return created
}

function parseEventTypeFilter(value: string | undefined): SafetyEventType | "ALL" {
  if (SAFETY_EVENT_TYPES.includes(value as SafetyEventType)) {
    return value as SafetyEventType
  }

  return "ALL"
}

function parseSeverityFilter(value: string | undefined): SafetySeverity | "ALL" {
  if (SAFETY_SEVERITIES.includes(value as SafetySeverity)) {
    return value as SafetySeverity
  }

  return "ALL"
}

function parseStatusFilter(value: string | undefined): SafetyEventStatus | "ALL" {
  if (SAFETY_STATUSES.includes(value as SafetyEventStatus)) {
    return value as SafetyEventStatus
  }

  return "ALL"
}

function parseSourceFilter(value: string | undefined): SafetySource | "ALL" {
  if (SAFETY_SOURCES.includes(value as SafetySource)) {
    return value as SafetySource
  }

  return "ALL"
}

export function parseSafetyFilters(raw: {
  avatarId?: string
  eventType?: string
  severity?: string
  status?: string
  source?: string
}): SafetyListFilters {
  return {
    avatarId: normalizeText(raw.avatarId) || undefined,
    eventType: parseEventTypeFilter(raw.eventType),
    severity: parseSeverityFilter(raw.severity),
    status: parseStatusFilter(raw.status),
    source: parseSourceFilter(raw.source)
  }
}

function buildSafetyWhere(workspaceId: string, filters: SafetyListFilters): Prisma.SafetyEventWhereInput {
  const where: Prisma.SafetyEventWhereInput = { workspaceId }

  if (filters.avatarId) {
    where.avatarId = filters.avatarId
  }

  if (filters.eventType !== "ALL") {
    where.eventType = filters.eventType
  }

  if (filters.severity !== "ALL") {
    where.severity = filters.severity
  }

  if (filters.status !== "ALL") {
    where.status = filters.status
  }

  if (filters.source !== "ALL") {
    where.source = filters.source
  }

  return where
}

export async function fetchSafetyDashboardData(
  workspaceId: string,
  filters: SafetyListFilters
): Promise<SafetyDashboardData> {
  const [avatarOptions, rows] = await Promise.all([
    prisma.avatar.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    }),
    prisma.safetyEvent.findMany({
      where: buildSafetyWhere(workspaceId, filters),
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        eventType: true,
        severity: true,
        status: true,
        action: true,
        source: true,
        avatarId: true,
        conversationId: true,
        messageId: true,
        inputExcerpt: true,
        outputExcerpt: true,
        reason: true,
        createdAt: true,
        reviewedAt: true,
        avatar: {
          select: { name: true }
        },
        reviewedByUser: {
          select: { displayName: true, email: true }
        }
      }
    })
  ])

  return {
    filters,
    avatarOptions,
    events: rows.map(row => ({
      id: row.id,
      eventType: row.eventType,
      severity: row.severity,
      status: row.status,
      action: row.action,
      source: row.source,
      avatarId: row.avatarId,
      avatarName: row.avatar?.name ?? null,
      conversationId: row.conversationId,
      messageId: row.messageId,
      inputExcerpt: row.inputExcerpt,
      outputExcerpt: row.outputExcerpt,
      reason: row.reason,
      createdAt: formatWorkspaceLocalTime(row.createdAt),
      reviewedAt: row.reviewedAt ? formatWorkspaceLocalTime(row.reviewedAt) : null,
      reviewedByName: row.reviewedByUser?.displayName ?? row.reviewedByUser?.email ?? null
    }))
  }
}

export async function fetchConversationSafetyEvents(
  workspaceId: string,
  conversationId: string
): Promise<SafetyEventListItem[]> {
  const rows = await prisma.safetyEvent.findMany({
    where: {
      workspaceId,
      conversationId
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      eventType: true,
      severity: true,
      status: true,
      action: true,
      source: true,
      avatarId: true,
      conversationId: true,
      messageId: true,
      inputExcerpt: true,
      outputExcerpt: true,
      reason: true,
      createdAt: true,
      reviewedAt: true,
      avatar: {
        select: { name: true }
      },
      reviewedByUser: {
        select: { displayName: true, email: true }
      }
    }
  })

  return rows.map(row => ({
    id: row.id,
    eventType: row.eventType,
    severity: row.severity,
    status: row.status,
    action: row.action,
    source: row.source,
    avatarId: row.avatarId,
    avatarName: row.avatar?.name ?? null,
    conversationId: row.conversationId,
    messageId: row.messageId,
    inputExcerpt: row.inputExcerpt,
    outputExcerpt: row.outputExcerpt,
    reason: row.reason,
    createdAt: formatWorkspaceLocalTime(row.createdAt),
    reviewedAt: row.reviewedAt ? formatWorkspaceLocalTime(row.reviewedAt) : null,
    reviewedByName: row.reviewedByUser?.displayName ?? row.reviewedByUser?.email ?? null
  }))
}

export function safetyLabel(value: string): string {
  return value.replace(/_/g, " ")
}

export function canReviewSafetyEvents(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

export function canSuspendAvatarFromSafety(role: WorkspaceRole): boolean {
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN
}

export function parseReviewStatus(value: string): SafetyEventStatus | null {
  if (
    value === SafetyEventStatus.REVIEWED ||
    value === SafetyEventStatus.DISMISSED ||
    value === SafetyEventStatus.RESOLVED
  ) {
    return value
  }

  return null
}

export async function suspendAvatarForSafety(params: {
  workspaceId: string
  avatarId: string
  userId: string
  reason: string
}): Promise<boolean> {
  const avatar = await prisma.avatar.findFirst({
    where: {
      id: params.avatarId,
      workspaceId: params.workspaceId
    },
    select: {
      id: true,
      status: true
    }
  })

  if (!avatar || avatar.status === AvatarStatus.SUSPENDED) {
    return false
  }

  await prisma.avatar.update({
    where: { id: avatar.id },
    data: { status: AvatarStatus.SUSPENDED }
  })

  await recordSafetyEvent({
    workspaceId: params.workspaceId,
    avatarId: avatar.id,
    eventType: SafetyEventType.avatar_suspended,
    severity: SafetySeverity.HIGH,
    action: SafetyAction.SUSPEND_AVATAR,
    source: SafetySource.SYSTEM,
    reason: params.reason,
    metadata: {
      reviewedByUserId: params.userId,
      previousStatus: avatar.status
    }
  })

  return true
}
