import { prisma } from "@/lib/prisma"

export const BILLING_PLAN_KEYS = [
  "FREE",
  "STARTER",
  "GROWTH",
  "AGENCY",
  "ENTERPRISE"
] as const

export const BILLING_LIMIT_KEYS = [
  "avatars",
  "monthlyConversations",
  "monthlyVideoMinutes",
  "monthlyVoiceMinutes",
  "knowledgeSources",
  "teamMembers",
  "widgetDomains",
  "apiKeys"
] as const

export type BillingPlanKey = (typeof BILLING_PLAN_KEYS)[number]
export type BillingLimitKey = (typeof BILLING_LIMIT_KEYS)[number]
export type BillingLimitValue = number | null

export type BillingPlanDefinition = {
  key: BillingPlanKey
  label: string
  description: string
  monthlyPriceLabel: string
  limits: Record<BillingLimitKey, BillingLimitValue>
  features: string[]
}

export type BillingLimitUsage = {
  key: BillingLimitKey
  label: string
  usage: number
  limit: BillingLimitValue
  unit: "count" | "minutes"
  percentUsed: number | null
  status: "ok" | "near_limit" | "over_limit" | "unlimited"
}

export type BillingDashboardData = {
  plan: BillingPlanDefinition
  status: string
  billingEmail: string | null
  periodStart: Date
  periodEnd: Date
  cancelAtPeriodEnd: boolean
  limitRows: BillingLimitUsage[]
  warnings: string[]
  availablePlans: BillingPlanDefinition[]
  billingHistory: BillingHistoryItem[]
}

export type BillingHistoryItem = {
  id: string
  date: string
  description: string
  amount: string
  status: string
}

const LIMIT_LABELS: Record<BillingLimitKey, string> = {
  avatars: "Avatars",
  monthlyConversations: "Monthly conversations",
  monthlyVideoMinutes: "Monthly video minutes",
  monthlyVoiceMinutes: "Monthly voice minutes",
  knowledgeSources: "Knowledge sources",
  teamMembers: "Team members",
  widgetDomains: "Widget domains",
  apiKeys: "API keys"
}

export const BILLING_PLANS: Record<BillingPlanKey, BillingPlanDefinition> = {
  FREE: {
    key: "FREE",
    label: "Free",
    description: "Evaluation workspace for one avatar and light testing.",
    monthlyPriceLabel: "$0",
    limits: {
      avatars: 1,
      monthlyConversations: 100,
      monthlyVideoMinutes: 5,
      monthlyVoiceMinutes: 30,
      knowledgeSources: 5,
      teamMembers: 1,
      widgetDomains: 1,
      apiKeys: 1
    },
    features: ["Published widget testing", "Basic knowledge base", "Public API evaluation"]
  },
  STARTER: {
    key: "STARTER",
    label: "Starter",
    description: "Small business workspace with production widget capacity.",
    monthlyPriceLabel: "TBD",
    limits: {
      avatars: 3,
      monthlyConversations: 1000,
      monthlyVideoMinutes: 30,
      monthlyVoiceMinutes: 300,
      knowledgeSources: 25,
      teamMembers: 3,
      widgetDomains: 3,
      apiKeys: 3
    },
    features: ["Production widget usage", "Expanded knowledge base", "Multiple API keys"]
  },
  GROWTH: {
    key: "GROWTH",
    label: "Growth",
    description: "Higher-volume workspace for teams using avatars across channels.",
    monthlyPriceLabel: "TBD",
    limits: {
      avatars: 10,
      monthlyConversations: 10000,
      monthlyVideoMinutes: 180,
      monthlyVoiceMinutes: 2000,
      knowledgeSources: 100,
      teamMembers: 10,
      widgetDomains: 10,
      apiKeys: 10
    },
    features: ["Growth usage limits", "Larger team access", "More deployment domains"]
  },
  AGENCY: {
    key: "AGENCY",
    label: "Agency",
    description: "Multi-client operations with larger avatar and domain capacity.",
    monthlyPriceLabel: "TBD",
    limits: {
      avatars: 50,
      monthlyConversations: 50000,
      monthlyVideoMinutes: 1000,
      monthlyVoiceMinutes: 10000,
      knowledgeSources: 500,
      teamMembers: 50,
      widgetDomains: 50,
      apiKeys: 50
    },
    features: ["Agency-scale limits", "Client workspace operations", "Higher integration capacity"]
  },
  ENTERPRISE: {
    key: "ENTERPRISE",
    label: "Enterprise",
    description: "Custom limits, contracts, security review, and dedicated support.",
    monthlyPriceLabel: "Custom",
    limits: {
      avatars: null,
      monthlyConversations: null,
      monthlyVideoMinutes: null,
      monthlyVoiceMinutes: null,
      knowledgeSources: null,
      teamMembers: null,
      widgetDomains: null,
      apiKeys: null
    },
    features: ["Custom usage limits", "Contract billing", "Security and procurement support"]
  }
}

function normalizeBillingPlan(value: string | null | undefined): BillingPlanKey {
  const plan = value as BillingPlanKey
  return BILLING_PLAN_KEYS.includes(plan) ? plan : "FREE"
}

function currentCalendarPeriod(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start, end }
}

function usageStatus(usage: number, limit: BillingLimitValue): BillingLimitUsage["status"] {
  if (limit === null) {
    return "unlimited"
  }

  if (usage > limit) {
    return "over_limit"
  }

  if (limit > 0 && usage >= limit * 0.8) {
    return "near_limit"
  }

  return "ok"
}

function percentUsed(usage: number, limit: BillingLimitValue): number | null {
  if (limit === null || limit <= 0) {
    return null
  }

  return Math.min(100, Math.round((usage / limit) * 100))
}

function limitRow(key: BillingLimitKey, usage: number, limit: BillingLimitValue, unit: BillingLimitUsage["unit"]): BillingLimitUsage {
  return {
    key,
    label: LIMIT_LABELS[key],
    usage,
    limit,
    unit,
    percentUsed: percentUsed(usage, limit),
    status: usageStatus(usage, limit)
  }
}

function buildWarnings(rows: BillingLimitUsage[]): string[] {
  return rows
    .filter(row => row.status === "near_limit" || row.status === "over_limit")
    .map(row => {
      if (row.status === "over_limit") {
        return `${row.label} is above the current plan limit.`
      }

      return `${row.label} is at or above 80% of the current plan limit.`
    })
}

export function formatBillingValue(value: number, unit: BillingLimitUsage["unit"]): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: unit === "minutes" && value < 10 ? 1 : 0
  }).format(value)
}

export function formatBillingLimit(value: BillingLimitValue, unit: BillingLimitUsage["unit"]): string {
  if (value === null) {
    return "Custom"
  }

  return formatBillingValue(value, unit)
}

export function formatBillingPeriod(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date)
}

export function billingStatusLabel(status: string): string {
  return status
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase())
}

export async function fetchBillingDashboardData(workspaceId: string): Promise<BillingDashboardData> {
  const billingAccount = await prisma.billingAccount.findUnique({
    where: { workspaceId }
  })
  const calendarPeriod = currentCalendarPeriod()
  const start = billingAccount?.currentPeriodStart ?? calendarPeriod.start
  const end = billingAccount?.currentPeriodEnd ?? calendarPeriod.end
  const [
    avatarCount,
    conversationCount,
    videoUsage,
    voiceUsage,
    knowledgeSourceCount,
    teamMemberCount,
    widgetDomainCount,
    apiKeyCount
  ] = await Promise.all([
    prisma.avatar.count({
      where: { workspaceId }
    }),
    prisma.conversation.count({
      where: {
        workspaceId,
        createdAt: {
          gte: start,
          lt: end
        }
      }
    }),
    prisma.usageEvent.aggregate({
      where: {
        workspaceId,
        eventType: "avatar.video.seconds",
        createdAt: {
          gte: start,
          lt: end
        }
      },
      _sum: { quantity: true }
    }),
    prisma.usageEvent.aggregate({
      where: {
        workspaceId,
        eventType: "stt.seconds",
        createdAt: {
          gte: start,
          lt: end
        }
      },
      _sum: { quantity: true }
    }),
    prisma.knowledgeSource.count({
      where: {
        workspaceId,
        archivedAt: null
      }
    }),
    prisma.workspaceMember.count({
      where: { workspaceId }
    }),
    prisma.allowedDomain.count({
      where: { workspaceId }
    }),
    prisma.apiKey.count({
      where: {
        workspaceId,
        revokedAt: null
      }
    })
  ])

  const plan = BILLING_PLANS[normalizeBillingPlan(billingAccount?.plan)]
  const videoMinutes = (videoUsage._sum.quantity ?? 0) / 60
  const voiceMinutes = (voiceUsage._sum.quantity ?? 0) / 60
  const limitRows = [
    limitRow("avatars", avatarCount, plan.limits.avatars, "count"),
    limitRow("monthlyConversations", conversationCount, plan.limits.monthlyConversations, "count"),
    limitRow("monthlyVideoMinutes", videoMinutes, plan.limits.monthlyVideoMinutes, "minutes"),
    limitRow("monthlyVoiceMinutes", voiceMinutes, plan.limits.monthlyVoiceMinutes, "minutes"),
    limitRow("knowledgeSources", knowledgeSourceCount, plan.limits.knowledgeSources, "count"),
    limitRow("teamMembers", teamMemberCount, plan.limits.teamMembers, "count"),
    limitRow("widgetDomains", widgetDomainCount, plan.limits.widgetDomains, "count"),
    limitRow("apiKeys", apiKeyCount, plan.limits.apiKeys, "count")
  ]

  return {
    plan,
    status: billingAccount?.status ?? "ACTIVE",
    billingEmail: billingAccount?.billingEmail ?? null,
    periodStart: billingAccount?.currentPeriodStart ?? start,
    periodEnd: billingAccount?.currentPeriodEnd ?? end,
    cancelAtPeriodEnd: billingAccount?.cancelAtPeriodEnd ?? false,
    limitRows,
    warnings: buildWarnings(limitRows),
    availablePlans: BILLING_PLAN_KEYS.map(key => BILLING_PLANS[key]),
    billingHistory: []
  }
}
