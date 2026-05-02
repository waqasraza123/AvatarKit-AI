import {
  ConversationChannel,
  ConversationStatus,
  LeadStatus,
  MessageRole,
  Prisma
} from "@prisma/client"
import { formatWorkspaceLocalTime } from "@/lib/avatar"
import { prisma } from "@/lib/prisma"

export const CONVERSATION_INTELLIGENCE_PERIODS = ["7d", "30d", "90d", "all"] as const

export type ConversationIntelligencePeriod = (typeof CONVERSATION_INTELLIGENCE_PERIODS)[number]

export type ConversationIntent =
  | "pricing"
  | "booking"
  | "availability"
  | "location"
  | "support"
  | "sales"
  | "contact"
  | "policy"
  | "product"
  | "knowledge_gap"
  | "general"

export type ConversationOutcome =
  | "lead_captured"
  | "handoff_requested"
  | "knowledge_gap"
  | "safety_review"
  | "failed"
  | "resolved"
  | "active"

export type ConversationIntelligenceMetric = {
  label: string
  value: string
  helper: string
}

export type ConversationIntentBreakdown = {
  intent: ConversationIntent
  label: string
  count: number
  percentage: number
}

export type ConversationOutcomeBreakdown = {
  outcome: ConversationOutcome
  label: string
  count: number
  percentage: number
}

export type ConversationChannelBreakdown = {
  channel: ConversationChannel
  label: string
  count: number
  leadCount: number
  percentage: number
}

export type ConversationTopQuestion = {
  question: string
  normalizedQuestion: string
  count: number
  lastAskedAt: string
  avatarName: string
  intent: ConversationIntent
  intentLabel: string
}

export type ConversationAvatarIntelligence = {
  avatarId: string
  avatarName: string
  conversationCount: number
  leadCount: number
  handoffCount: number
  failedCount: number
  topIntent: string
}

export type ConversationIntelligenceRecentItem = {
  id: string
  avatarId: string
  avatarName: string
  channel: ConversationChannel
  channelLabel: string
  status: ConversationStatus
  outcome: ConversationOutcome
  outcomeLabel: string
  primaryIntent: ConversationIntent
  primaryIntentLabel: string
  summary: string
  updatedAt: string
  messageCount: number
  leadStatus: LeadStatus | null
}

export type ConversationIntelligenceDashboard = {
  period: ConversationIntelligencePeriod
  isCapped: boolean
  metrics: ConversationIntelligenceMetric[]
  intentBreakdown: ConversationIntentBreakdown[]
  outcomeBreakdown: ConversationOutcomeBreakdown[]
  channelBreakdown: ConversationChannelBreakdown[]
  topQuestions: ConversationTopQuestion[]
  avatarBreakdown: ConversationAvatarIntelligence[]
  recentConversations: ConversationIntelligenceRecentItem[]
}

export type ConversationIntelligenceDetail = {
  summary: string
  primaryIntent: ConversationIntent
  primaryIntentLabel: string
  outcome: ConversationOutcome
  outcomeLabel: string
  visitorMessageCount: number
  assistantMessageCount: number
  leadCaptured: boolean
  safetyEventCount: number
  knowledgeGapCount: number
  highlights: string[]
}

type ConversationMessageRow = {
  role: MessageRole
  content: string
  createdAt: Date
  metadata: Prisma.JsonValue | null
}

type ConversationIntelligenceRow = {
  id: string
  avatarId: string
  channel: ConversationChannel
  status: ConversationStatus
  summary: string | null
  updatedAt: Date
  avatar: {
    name: string
  }
  messages: ConversationMessageRow[]
  lead: {
    id: string
    status: LeadStatus
  } | null
  _count: {
    messages: number
    safetyEvents: number
    knowledgeGaps: number
  }
}

const MAX_ANALYTICS_CONVERSATIONS = 500

const numberFormatter = new Intl.NumberFormat("en-US")

const intentLabels: Record<ConversationIntent, string> = {
  pricing: "Pricing",
  booking: "Booking",
  availability: "Availability",
  location: "Location",
  support: "Support",
  sales: "Sales",
  contact: "Contact",
  policy: "Policy",
  product: "Product",
  knowledge_gap: "Knowledge gap",
  general: "General"
}

const outcomeLabels: Record<ConversationOutcome, string> = {
  lead_captured: "Lead captured",
  handoff_requested: "Handoff requested",
  knowledge_gap: "Knowledge gap",
  safety_review: "Safety review",
  failed: "Failed",
  resolved: "Resolved",
  active: "Active"
}

const channelLabels: Record<ConversationChannel, string> = {
  DASHBOARD_PREVIEW: "Dashboard preview",
  WIDGET: "Website widget",
  KIOSK: "Kiosk",
  API: "Public API"
}

const intentOrder: ConversationIntent[] = [
  "sales",
  "pricing",
  "booking",
  "availability",
  "support",
  "product",
  "location",
  "contact",
  "policy",
  "knowledge_gap",
  "general"
]

const outcomeOrder: ConversationOutcome[] = [
  "lead_captured",
  "handoff_requested",
  "knowledge_gap",
  "safety_review",
  "failed",
  "resolved",
  "active"
]

function parseMetadataObject(raw: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null
  }

  return raw as Record<string, unknown>
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeQuestion(value: string): string {
  return normalizeSearchText(value).slice(0, 180)
}

function sentencePreview(value: string, maxLength = 180): string {
  const compact = value.replace(/\s+/g, " ").trim()
  if (compact.length <= maxLength) {
    return compact
  }

  return `${compact.slice(0, maxLength - 1)}...`
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword))
}

export function conversationIntentLabel(intent: ConversationIntent): string {
  return intentLabels[intent]
}

export function conversationOutcomeLabel(outcome: ConversationOutcome): string {
  return outcomeLabels[outcome]
}

export function conversationIntelligenceChannelLabel(channel: ConversationChannel): string {
  return channelLabels[channel]
}

export function parseConversationIntelligencePeriod(raw: string | undefined): ConversationIntelligencePeriod {
  if (CONVERSATION_INTELLIGENCE_PERIODS.includes(raw as ConversationIntelligencePeriod)) {
    return raw as ConversationIntelligencePeriod
  }

  return "30d"
}

function periodStart(period: ConversationIntelligencePeriod): Date | null {
  if (period === "all") {
    return null
  }

  const days = Number(period.replace("d", ""))
  const start = new Date()
  start.setDate(start.getDate() - days)
  return start
}

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function formatPercent(part: number, total: number): number {
  if (total <= 0) {
    return 0
  }

  return Math.round((part / total) * 100)
}

function classifyTextIntent(text: string): ConversationIntent {
  const normalized = normalizeSearchText(text)

  if (!normalized) {
    return "general"
  }

  if (includesAny(normalized, ["price", "pricing", "cost", "fee", "rate", "plan", "quote", "budget"])) {
    return "pricing"
  }

  if (includesAny(normalized, ["book", "booking", "appointment", "schedule", "meeting", "call", "tour", "demo"])) {
    return "booking"
  }

  if (includesAny(normalized, ["available", "availability", "open", "slot", "hours", "today", "tomorrow", "date"])) {
    return "availability"
  }

  if (includesAny(normalized, ["where", "location", "address", "near", "directions", "area", "city"])) {
    return "location"
  }

  if (includesAny(normalized, ["problem", "issue", "broken", "help", "support", "error", "not working"])) {
    return "support"
  }

  if (includesAny(normalized, ["buy", "sell", "hire", "service", "offer", "package", "proposal", "interested"])) {
    return "sales"
  }

  if (includesAny(normalized, ["email", "phone", "contact", "reach", "message", "whatsapp"])) {
    return "contact"
  }

  if (includesAny(normalized, ["refund", "privacy", "terms", "policy", "contract", "cancel", "guarantee"])) {
    return "policy"
  }

  if (includesAny(normalized, ["feature", "product", "listing", "property", "course", "program", "details"])) {
    return "product"
  }

  return "general"
}

function classifyConversationIntent(row: ConversationIntelligenceRow): ConversationIntent {
  if (row._count.knowledgeGaps > 0) {
    return "knowledge_gap"
  }

  const visitorMessages = row.messages.filter(message => message.role === MessageRole.VISITOR)
  const visitorIntentCounts = new Map<ConversationIntent, number>()

  for (const message of visitorMessages) {
    const intent = classifyTextIntent(message.content)
    visitorIntentCounts.set(intent, (visitorIntentCounts.get(intent) ?? 0) + 1)
  }

  let bestIntent: ConversationIntent = "general"
  let bestCount = 0
  for (const intent of intentOrder) {
    const count = visitorIntentCounts.get(intent) ?? 0
    if (count > bestCount) {
      bestIntent = intent
      bestCount = count
    }
  }

  return bestIntent
}

function classifyConversationOutcome(row: ConversationIntelligenceRow): ConversationOutcome {
  if (row.lead) {
    return "lead_captured"
  }

  if (row.status === ConversationStatus.HANDOFF_REQUESTED) {
    return "handoff_requested"
  }

  if (row._count.knowledgeGaps > 0) {
    return "knowledge_gap"
  }

  if (row._count.safetyEvents > 0) {
    return "safety_review"
  }

  if (row.status === ConversationStatus.FAILED) {
    return "failed"
  }

  if (row.status === ConversationStatus.ENDED) {
    return "resolved"
  }

  return "active"
}

function buildHighlights(row: ConversationIntelligenceRow, primaryIntent: ConversationIntent, outcome: ConversationOutcome): string[] {
  const visitorMessages = row.messages.filter(message => message.role === MessageRole.VISITOR)
  const assistantMessages = row.messages.filter(message => message.role === MessageRole.AVATAR)
  const highlights = [
    `${formatNumber(visitorMessages.length)} visitor message(s) and ${formatNumber(assistantMessages.length)} avatar response(s).`,
    `Primary intent is ${conversationIntentLabel(primaryIntent).toLowerCase()}; outcome is ${conversationOutcomeLabel(outcome).toLowerCase()}.`
  ]

  const firstVisitorMessage = visitorMessages[0]
  if (firstVisitorMessage) {
    highlights.push(`Opening question: ${sentencePreview(firstVisitorMessage.content, 140)}`)
  }

  const latestVisitorMessage = visitorMessages[visitorMessages.length - 1]
  if (latestVisitorMessage && latestVisitorMessage !== firstVisitorMessage) {
    highlights.push(`Latest visitor message: ${sentencePreview(latestVisitorMessage.content, 140)}`)
  }

  if (row.lead) {
    highlights.push(`Lead captured with ${row.lead.status.toLowerCase()} status.`)
  }

  if (row._count.knowledgeGaps > 0) {
    highlights.push(`${formatNumber(row._count.knowledgeGaps)} knowledge gap(s) linked for review.`)
  }

  if (row._count.safetyEvents > 0) {
    highlights.push(`${formatNumber(row._count.safetyEvents)} safety event(s) linked for review.`)
  }

  return highlights.slice(0, 6)
}

function buildDeterministicSummary(row: ConversationIntelligenceRow, primaryIntent: ConversationIntent, outcome: ConversationOutcome): string {
  if (row.summary?.trim()) {
    return row.summary.trim()
  }

  const visitorMessages = row.messages.filter(message => message.role === MessageRole.VISITOR)
  const assistantMessages = row.messages.filter(message => message.role === MessageRole.AVATAR)
  const firstVisitorMessage = visitorMessages[0]
  const latestAssistantMessage = assistantMessages[assistantMessages.length - 1]

  if (!firstVisitorMessage && !latestAssistantMessage) {
    return `No transcript content is available yet. Current outcome is ${conversationOutcomeLabel(outcome).toLowerCase()}.`
  }

  const parts = [
    `Visitor intent: ${conversationIntentLabel(primaryIntent).toLowerCase()}.`,
    `Outcome: ${conversationOutcomeLabel(outcome).toLowerCase()}.`
  ]

  if (firstVisitorMessage) {
    parts.push(`Asked: ${sentencePreview(firstVisitorMessage.content, 120)}`)
  }

  if (latestAssistantMessage) {
    parts.push(`Latest answer: ${sentencePreview(latestAssistantMessage.content, 140)}`)
  }

  return parts.join(" ")
}

function buildDetailFromRow(row: ConversationIntelligenceRow): ConversationIntelligenceDetail {
  const primaryIntent = classifyConversationIntent(row)
  const outcome = classifyConversationOutcome(row)
  const visitorMessageCount = row.messages.filter(message => message.role === MessageRole.VISITOR).length
  const assistantMessageCount = row.messages.filter(message => message.role === MessageRole.AVATAR).length

  return {
    summary: buildDeterministicSummary(row, primaryIntent, outcome),
    primaryIntent,
    primaryIntentLabel: conversationIntentLabel(primaryIntent),
    outcome,
    outcomeLabel: conversationOutcomeLabel(outcome),
    visitorMessageCount,
    assistantMessageCount,
    leadCaptured: Boolean(row.lead),
    safetyEventCount: row._count.safetyEvents,
    knowledgeGapCount: row._count.knowledgeGaps,
    highlights: buildHighlights(row, primaryIntent, outcome)
  }
}

function incrementRecord<T extends string>(record: Record<T, number>, key: T): void {
  record[key] += 1
}

function buildInitialRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return keys.reduce<Record<T, number>>((record, key) => {
    record[key] = 0
    return record
  }, {} as Record<T, number>)
}

function buildTopQuestions(rows: ConversationIntelligenceRow[]): ConversationTopQuestion[] {
  const questions = new Map<string, {
    question: string
    normalizedQuestion: string
    count: number
    lastAskedAt: Date
    avatarName: string
    intent: ConversationIntent
  }>()

  for (const row of rows) {
    for (const message of row.messages) {
      if (message.role !== MessageRole.VISITOR) {
        continue
      }

      const normalizedQuestion = normalizeQuestion(message.content)
      if (!normalizedQuestion || normalizedQuestion.length < 4) {
        continue
      }

      const intent = classifyTextIntent(message.content)
      const existing = questions.get(normalizedQuestion)
      if (existing) {
        existing.count += 1
        if (message.createdAt > existing.lastAskedAt) {
          existing.lastAskedAt = message.createdAt
          existing.question = sentencePreview(message.content, 150)
          existing.avatarName = row.avatar.name
        }
        continue
      }

      questions.set(normalizedQuestion, {
        question: sentencePreview(message.content, 150),
        normalizedQuestion,
        count: 1,
        lastAskedAt: message.createdAt,
        avatarName: row.avatar.name,
        intent
      })
    }
  }

  return Array.from(questions.values())
    .sort((left, right) => right.count - left.count || right.lastAskedAt.getTime() - left.lastAskedAt.getTime())
    .slice(0, 10)
    .map(question => ({
      ...question,
      lastAskedAt: formatWorkspaceLocalTime(question.lastAskedAt),
      intentLabel: conversationIntentLabel(question.intent)
    }))
}

function buildAvatarBreakdown(rows: ConversationIntelligenceRow[]): ConversationAvatarIntelligence[] {
  const avatars = new Map<string, {
    avatarId: string
    avatarName: string
    conversationCount: number
    leadCount: number
    handoffCount: number
    failedCount: number
    intents: Record<ConversationIntent, number>
  }>()

  for (const row of rows) {
    const existing = avatars.get(row.avatarId) ?? {
      avatarId: row.avatarId,
      avatarName: row.avatar.name,
      conversationCount: 0,
      leadCount: 0,
      handoffCount: 0,
      failedCount: 0,
      intents: buildInitialRecord(intentOrder)
    }

    existing.conversationCount += 1
    if (row.lead) {
      existing.leadCount += 1
    }
    if (row.status === ConversationStatus.HANDOFF_REQUESTED) {
      existing.handoffCount += 1
    }
    if (row.status === ConversationStatus.FAILED) {
      existing.failedCount += 1
    }
    incrementRecord(existing.intents, classifyConversationIntent(row))
    avatars.set(row.avatarId, existing)
  }

  return Array.from(avatars.values())
    .map(avatar => {
      const topIntent = intentOrder.reduce<ConversationIntent>((best, intent) => (
        avatar.intents[intent] > avatar.intents[best] ? intent : best
      ), "general")

      return {
        avatarId: avatar.avatarId,
        avatarName: avatar.avatarName,
        conversationCount: avatar.conversationCount,
        leadCount: avatar.leadCount,
        handoffCount: avatar.handoffCount,
        failedCount: avatar.failedCount,
        topIntent: conversationIntentLabel(topIntent)
      }
    })
    .sort((left, right) => right.conversationCount - left.conversationCount)
}

export async function fetchConversationIntelligenceDashboard(
  workspaceId: string,
  period: ConversationIntelligencePeriod
): Promise<ConversationIntelligenceDashboard> {
  const where: Prisma.ConversationWhereInput = { workspaceId }
  const start = periodStart(period)
  if (start) {
    where.updatedAt = { gte: start }
  }

  const rows = await prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: MAX_ANALYTICS_CONVERSATIONS + 1,
    select: {
      id: true,
      avatarId: true,
      channel: true,
      status: true,
      summary: true,
      updatedAt: true,
      avatar: {
        select: { name: true }
      },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          content: true,
          createdAt: true,
          metadata: true
        }
      },
      lead: {
        select: {
          id: true,
          status: true
        }
      },
      _count: {
        select: {
          messages: true,
          safetyEvents: true,
          knowledgeGaps: true
        }
      }
    }
  })

  const isCapped = rows.length > MAX_ANALYTICS_CONVERSATIONS
  const scopedRows = rows.slice(0, MAX_ANALYTICS_CONVERSATIONS) as ConversationIntelligenceRow[]
  const totalConversations = scopedRows.length
  const totalVisitorMessages = scopedRows.reduce((total, row) => (
    total + row.messages.filter(message => message.role === MessageRole.VISITOR).length
  ), 0)
  const totalLeads = scopedRows.filter(row => row.lead).length
  const totalHandoffs = scopedRows.filter(row => row.status === ConversationStatus.HANDOFF_REQUESTED).length
  const totalFailures = scopedRows.filter(row => row.status === ConversationStatus.FAILED).length
  const totalSafetyEvents = scopedRows.reduce((total, row) => total + row._count.safetyEvents, 0)
  const totalKnowledgeGaps = scopedRows.reduce((total, row) => total + row._count.knowledgeGaps, 0)
  const conversionRate = formatPercent(totalLeads, totalConversations)
  const intentCounts = buildInitialRecord(intentOrder)
  const outcomeCounts = buildInitialRecord(outcomeOrder)
  const channelCounts = buildInitialRecord(Object.values(ConversationChannel))
  const channelLeadCounts = buildInitialRecord(Object.values(ConversationChannel))

  for (const row of scopedRows) {
    const primaryIntent = classifyConversationIntent(row)
    const outcome = classifyConversationOutcome(row)
    incrementRecord(intentCounts, primaryIntent)
    incrementRecord(outcomeCounts, outcome)
    incrementRecord(channelCounts, row.channel)
    if (row.lead) {
      incrementRecord(channelLeadCounts, row.channel)
    }
  }

  return {
    period,
    isCapped,
    metrics: [
      {
        label: "Conversations",
        value: formatNumber(totalConversations),
        helper: isCapped ? `Showing latest ${formatNumber(MAX_ANALYTICS_CONVERSATIONS)}` : "Within selected period"
      },
      {
        label: "Visitor messages",
        value: formatNumber(totalVisitorMessages),
        helper: "Questions and replies from visitors"
      },
      {
        label: "Lead conversion",
        value: `${conversionRate}%`,
        helper: `${formatNumber(totalLeads)} lead(s) captured`
      },
      {
        label: "Handoffs",
        value: formatNumber(totalHandoffs),
        helper: "Sessions requiring human follow-up"
      },
      {
        label: "Failures",
        value: formatNumber(totalFailures),
        helper: "Failed conversation status"
      },
      {
        label: "Review signals",
        value: formatNumber(totalSafetyEvents + totalKnowledgeGaps),
        helper: `${formatNumber(totalSafetyEvents)} safety, ${formatNumber(totalKnowledgeGaps)} knowledge`
      }
    ],
    intentBreakdown: intentOrder
      .map(intent => ({
        intent,
        label: conversationIntentLabel(intent),
        count: intentCounts[intent],
        percentage: formatPercent(intentCounts[intent], totalConversations)
      }))
      .filter(item => item.count > 0),
    outcomeBreakdown: outcomeOrder
      .map(outcome => ({
        outcome,
        label: conversationOutcomeLabel(outcome),
        count: outcomeCounts[outcome],
        percentage: formatPercent(outcomeCounts[outcome], totalConversations)
      }))
      .filter(item => item.count > 0),
    channelBreakdown: Object.values(ConversationChannel)
      .map(channel => ({
        channel,
        label: conversationIntelligenceChannelLabel(channel),
        count: channelCounts[channel],
        leadCount: channelLeadCounts[channel],
        percentage: formatPercent(channelCounts[channel], totalConversations)
      }))
      .filter(item => item.count > 0),
    topQuestions: buildTopQuestions(scopedRows),
    avatarBreakdown: buildAvatarBreakdown(scopedRows),
    recentConversations: scopedRows.slice(0, 8).map(row => {
      const primaryIntent = classifyConversationIntent(row)
      const outcome = classifyConversationOutcome(row)
      return {
        id: row.id,
        avatarId: row.avatarId,
        avatarName: row.avatar.name,
        channel: row.channel,
        channelLabel: conversationIntelligenceChannelLabel(row.channel),
        status: row.status,
        outcome,
        outcomeLabel: conversationOutcomeLabel(outcome),
        primaryIntent,
        primaryIntentLabel: conversationIntentLabel(primaryIntent),
        summary: buildDeterministicSummary(row, primaryIntent, outcome),
        updatedAt: formatWorkspaceLocalTime(row.updatedAt),
        messageCount: row._count.messages,
        leadStatus: row.lead?.status ?? null
      }
    })
  }
}

export async function fetchConversationIntelligenceDetail(
  workspaceId: string,
  conversationId: string
): Promise<ConversationIntelligenceDetail | null> {
  const row = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId
    },
    select: {
      id: true,
      avatarId: true,
      channel: true,
      status: true,
      summary: true,
      updatedAt: true,
      avatar: {
        select: { name: true }
      },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          content: true,
          createdAt: true,
          metadata: true
        }
      },
      lead: {
        select: {
          id: true,
          status: true
        }
      },
      _count: {
        select: {
          messages: true,
          safetyEvents: true,
          knowledgeGaps: true
        }
      }
    }
  })

  if (!row) {
    return null
  }

  const metadataIntents = row.messages
    .map(message => parseMetadataObject(message.metadata)?.intent)
    .filter((intent): intent is string => typeof intent === "string" && intent.trim().length > 0)

  const detail = buildDetailFromRow(row as ConversationIntelligenceRow)
  if (metadataIntents.length === 0) {
    return detail
  }

  return {
    ...detail,
    highlights: [
      ...detail.highlights,
      `Runtime metadata included ${formatNumber(new Set(metadataIntents).size)} explicit intent signal(s).`
    ].slice(0, 6)
  }
}
