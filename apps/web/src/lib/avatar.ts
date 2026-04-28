import {
  AvatarAssetType,
  AvatarAssetValidationStatus,
  AvatarEngine,
  AvatarStatus,
  ConversationChannel,
  ConversationStatus,
  MessageRole,
  WorkspaceRole
} from "@prisma/client"
import { getAvatarConsentState, type AvatarConsentRecord } from "@/lib/avatar-consent"
import type { AvatarVoiceRecord } from "@/lib/avatar-voice-shared"
import { fetchKnowledgeSummaryForWorkspace } from "@/lib/knowledge"
import { prisma } from "@/lib/prisma"
import { hasWorkspaceRole } from "@/lib/workspace"

export const AVATAR_TONE_OPTIONS = [
  "warm and professional",
  "friendly and casual",
  "formal",
  "luxury/premium",
  "energetic",
  "calm and supportive"
] as const

export const AVATAR_ANSWER_STYLE_OPTIONS = [
  "short and direct",
  "balanced",
  "detailed",
  "step-by-step"
] as const

export const AVATAR_LEAD_CAPTURE_PREFERENCE_OPTIONS = [
  "never automatically ask",
  "ask when visitor shows buying intent",
  "ask when avatar cannot answer",
  "ask after a few messages"
] as const

export const AVATAR_HANDOFF_PREFERENCE_OPTIONS = [
  "offer handoff when unsure",
  "offer handoff on request only",
  "offer handoff for sensitive topics",
  "never offer automatically"
] as const

export const AVATAR_STUDIO_STEPS = [
  "basics",
  "photo",
  "consent",
  "voice",
  "behavior",
  "knowledge",
  "preview",
  "publish"
] as const

export const SAFE_DEFAULT_ENGINE = AvatarEngine.MOCK

export type AvatarTone = (typeof AVATAR_TONE_OPTIONS)[number]
export type AvatarAnswerStyle = (typeof AVATAR_ANSWER_STYLE_OPTIONS)[number]
export type AvatarLeadCapturePreference = (typeof AVATAR_LEAD_CAPTURE_PREFERENCE_OPTIONS)[number]
export type AvatarHandoffPreference = (typeof AVATAR_HANDOFF_PREFERENCE_OPTIONS)[number]
export type AvatarStudioStep = (typeof AVATAR_STUDIO_STEPS)[number]

export type AvatarPhotoAssetRecord = {
  id: string
  storageKey: string
  displayUrl: string
  originalFileName: string
  mimeType: string
  sizeBytes: number
  width: number
  height: number
  validationStatus: AvatarAssetValidationStatus
  validationIssues: string[]
}

export type AvatarFieldErrors = Partial<
  Record<
    | "name"
    | "displayName"
    | "role"
    | "useCase"
    | "language"
    | "avatarId"
    | "tone"
    | "answerStyle"
    | "greeting"
    | "businessInstructions"
    | "fallbackMessage"
    | "leadCapturePreference"
    | "handoffPreference",
    string
  >
>

export type AvatarRecord = {
  id: string
  workspaceId: string
  voiceId: string | null
  name: string
  displayName: string
  role: string
  useCase: string
  language: string
  greeting: string
  tone: string
  answerStyle: string
  businessInstructions: string
  fallbackMessage: string
  leadCapturePreference: string
  handoffPreference: string
  status: AvatarStatus
  engine: AvatarEngine
  publishedAt: Date | null
  voice: AvatarVoiceRecord | null
  photoAssets: AvatarPhotoAssetRecord[]
  consentRecords: AvatarConsentRecord[]
  readyKnowledgeSourceCount: number
  previewResponseCount: number
  createdAt: Date
  updatedAt: Date
}

export type AvatarPreviewMessage = {
  id: string
  role: MessageRole
  content: string
  audioUrl: string | null
  videoUrl: string | null
  createdAt: string
  metadata?: Record<string, unknown> | null
}

export type AvatarPreviewConversation = {
  conversationId: string
  status: ConversationStatus
  updatedAt: string
  endedAt: string | null
  messages: AvatarPreviewMessage[]
}

export type AvatarSetupChecklistItem = {
  key: AvatarStudioStep | "published"
  label: string
  complete: boolean
}

export type AvatarSetupCompletion = {
  checklist: AvatarSetupChecklistItem[]
  completedCount: number
  totalCount: number
  percentComplete: number
  summary: string
}

export type AvatarPublishRequirementKey =
  | "basics"
  | "photo"
  | "consent"
  | "voice"
  | "behavior"
  | "knowledge"
  | "preview"
  | "avatarStatus"
  | "workspace"

export type AvatarPublishRequirement = {
  key: AvatarPublishRequirementKey
  label: string
  complete: boolean
  detail: string
}

export type AvatarPublishReadiness = {
  isReady: boolean
  completedRequirements: AvatarPublishRequirement[]
  missingRequirements: AvatarPublishRequirement[]
  blockingIssues: string[]
  warnings: string[]
}

export function hasText(value: string): boolean {
  return value.trim().length > 0
}

export function canEditAvatars(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

function normalize(value: string): string {
  return value.trim()
}

function isAllowedValue<T extends string>(value: string, options: readonly T[]): value is T {
  return (options as readonly string[]).includes(value)
}

export function isAvatarTone(value: string): value is AvatarTone {
  return isAllowedValue(value, AVATAR_TONE_OPTIONS)
}

export function isAvatarAnswerStyle(value: string): value is AvatarAnswerStyle {
  return isAllowedValue(value, AVATAR_ANSWER_STYLE_OPTIONS)
}

export function isAvatarLeadCapturePreference(value: string): value is AvatarLeadCapturePreference {
  return isAllowedValue(value, AVATAR_LEAD_CAPTURE_PREFERENCE_OPTIONS)
}

export function isAvatarHandoffPreference(value: string): value is AvatarHandoffPreference {
  return isAllowedValue(value, AVATAR_HANDOFF_PREFERENCE_OPTIONS)
}

function parseAvatarPhotoAssets(raw: unknown): AvatarPhotoAssetRecord[] {
  if (!raw || !Array.isArray(raw)) {
    return []
  }

  return raw.map(item => {
    if (!item || typeof item !== "object") {
      return null
    }

    const candidate = item as {
      id: string
      storageKey: string
      displayUrl: string
      originalFileName: string
      mimeType: string
      sizeBytes: number
      width: number
      height: number
      validationStatus: AvatarAssetValidationStatus
      validationIssues: unknown
    }

    return {
      id: String(candidate.id ?? ""),
      storageKey: String(candidate.storageKey ?? ""),
      displayUrl: String(candidate.displayUrl ?? ""),
      originalFileName: String(candidate.originalFileName ?? ""),
      mimeType: String(candidate.mimeType ?? ""),
      sizeBytes: Number(candidate.sizeBytes ?? 0),
      width: Number(candidate.width ?? 0),
      height: Number(candidate.height ?? 0),
      validationStatus: candidate.validationStatus,
      validationIssues: Array.isArray(candidate.validationIssues)
        ? candidate.validationIssues.map(item => String(item))
        : []
    }
  }).filter((item): item is AvatarPhotoAssetRecord => Boolean(item))
}

function parseAvatarConsentRecords(raw: unknown): AvatarConsentRecord[] {
  if (!raw || !Array.isArray(raw)) {
    return []
  }

  return raw.map(item => {
    if (!item || typeof item !== "object") {
      return null
    }

    const candidate = item as AvatarConsentRecord

    return {
      id: String(candidate.id ?? ""),
      avatarAssetId: String(candidate.avatarAssetId ?? ""),
      acceptedByUserId: String(candidate.acceptedByUserId ?? ""),
      consentType: candidate.consentType,
      permissionBasis: candidate.permissionBasis,
      termsVersion: String(candidate.termsVersion ?? ""),
      acceptedAt: candidate.acceptedAt,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt
    }
  }).filter((item): item is AvatarConsentRecord => Boolean(item))
}

function parseAvatarVoiceRecord(raw: unknown): AvatarVoiceRecord | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const candidate = raw as AvatarVoiceRecord

  return {
    id: String(candidate.id ?? ""),
    provider: candidate.provider,
    providerVoiceId: String(candidate.providerVoiceId ?? ""),
    name: String(candidate.name ?? ""),
    language: String(candidate.language ?? ""),
    style: String(candidate.style ?? ""),
    presentationStyle: String(candidate.presentationStyle ?? ""),
    previewUrl: candidate.previewUrl ? String(candidate.previewUrl) : null,
    status: candidate.status,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt
  }
}

function isRuntimeErrorStatus(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false
  }

  const candidate = metadata as { runtimeStatus?: unknown }
  return candidate.runtimeStatus === "error"
}

function parseMessageMetadata(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null
  }

  return raw as Record<string, unknown>
}

async function fetchDashboardPreviewResponseCountsForAvatars(
  workspaceId: string,
  avatarIds: string[]
): Promise<Record<string, number>> {
  if (avatarIds.length === 0) {
    return {}
  }

  const previewResponses = await prisma.message.findMany({
    where: {
      role: MessageRole.AVATAR,
      conversation: {
        workspaceId,
        channel: ConversationChannel.DASHBOARD_PREVIEW,
        avatarId: { in: avatarIds }
      }
    },
    select: {
      metadata: true,
      conversation: {
        select: {
          avatarId: true
        }
      }
    }
  })

  const counts: Record<string, number> = {}
  for (const response of previewResponses) {
    if (isRuntimeErrorStatus(response.metadata)) {
      continue
    }

    const avatarId = response.conversation.avatarId
    counts[avatarId] = (counts[avatarId] ?? 0) + 1
  }

  return counts
}

function mapAvatarRecord(raw: {
  id: string
  workspaceId: string
  voiceId: string | null
  name: string
  displayName: string
  role: string
  useCase: string
  language: string
  greeting: string
  tone: string
  answerStyle: string
  businessInstructions: string
  fallbackMessage: string
  leadCapturePreference: string
  handoffPreference: string
  status: AvatarStatus
  engine: AvatarEngine
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  voice: unknown
  photoAssets: unknown
  consentRecords: unknown
}, readyKnowledgeSourceCount: number, previewResponseCount: number): AvatarRecord {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId,
    voiceId: raw.voiceId,
    name: raw.name,
    displayName: raw.displayName,
    role: raw.role,
    useCase: raw.useCase,
    language: raw.language,
    greeting: raw.greeting,
    tone: raw.tone,
    answerStyle: raw.answerStyle,
    businessInstructions: raw.businessInstructions,
    fallbackMessage: raw.fallbackMessage,
    leadCapturePreference: raw.leadCapturePreference,
    handoffPreference: raw.handoffPreference,
    status: raw.status,
    engine: raw.engine,
    publishedAt: raw.publishedAt,
    voice: parseAvatarVoiceRecord(raw.voice),
    photoAssets: parseAvatarPhotoAssets(raw.photoAssets),
    consentRecords: parseAvatarConsentRecords(raw.consentRecords),
    readyKnowledgeSourceCount,
    previewResponseCount,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt
  }
}

export function getCurrentSourcePhoto(avatar: { photoAssets: AvatarPhotoAssetRecord[] }): AvatarPhotoAssetRecord | null {
  return avatar.photoAssets[0] ?? null
}

export function hasCurrentPhotoConsent(avatar: AvatarRecord): boolean {
  const currentPhoto = getCurrentSourcePhoto(avatar)
  return getAvatarConsentState({
    currentSourcePhotoId: currentPhoto?.id ?? null,
    consentRecords: avatar.consentRecords
  }).isCurrentConsentValid
}

export function hasActiveSelectedVoice(avatar: Pick<AvatarRecord, "voice">): boolean {
  return avatar.voice?.status === "ACTIVE"
}

export function defaultGreeting(): string {
  return "Hi, how can I help?"
}

export function defaultBusinessInstructions(role: string, useCase: string): string {
  const normalizedRole = normalize(role)
  const normalizedUseCase = normalize(useCase)
  return `Answer as ${normalizedRole || "a knowledgeable teammate"} for ${normalizedUseCase || "the configured use case"} with concise business guidance.`
}

export function defaultFallbackMessage(): string {
  return "I’m still learning this part. Please share your contact details and we can route this to a team member."
}

export function defaultLeadCapturePreference(): AvatarLeadCapturePreference {
  return AVATAR_LEAD_CAPTURE_PREFERENCE_OPTIONS[0]
}

export function defaultHandoffPreference(): AvatarHandoffPreference {
  return AVATAR_HANDOFF_PREFERENCE_OPTIONS[0]
}

export function buildSetupChecklist(avatar: AvatarRecord): AvatarSetupCompletion {
  const basicsComplete = [
    avatar.name,
    avatar.displayName,
    avatar.role,
    avatar.useCase,
    avatar.language
  ].every(hasText)

  const behaviorComplete = [
    avatar.greeting,
    avatar.tone,
    avatar.answerStyle,
    avatar.businessInstructions,
    avatar.fallbackMessage,
    avatar.leadCapturePreference,
    avatar.handoffPreference
  ].every(hasText)

  const checklist: AvatarSetupChecklistItem[] = [
    { key: "basics", label: "Basics configured", complete: basicsComplete },
    { key: "photo", label: "Photo uploaded", complete: Boolean(getCurrentSourcePhoto(avatar)) },
    { key: "consent", label: "Consent accepted", complete: hasCurrentPhotoConsent(avatar) },
    { key: "voice", label: "Voice selected", complete: hasActiveSelectedVoice(avatar) },
    { key: "behavior", label: "Behavior configured", complete: behaviorComplete },
    { key: "knowledge", label: "Knowledge added", complete: avatar.readyKnowledgeSourceCount > 0 },
    { key: "preview", label: "Preview tested", complete: avatar.previewResponseCount > 0 },
    { key: "published", label: "Published", complete: avatar.status === AvatarStatus.PUBLISHED }
  ]

  const completedCount = checklist.filter(item => item.complete).length
  const totalCount = checklist.length
  const percentComplete = Math.round((completedCount / totalCount) * 100)
  const summary = `${completedCount}/${totalCount} checklist items complete`

  return {
    checklist,
    completedCount,
    totalCount,
    percentComplete,
    summary
  }
}

function areAvatarBasicsComplete(avatar: AvatarRecord): boolean {
  return [
    avatar.name,
    avatar.displayName,
    avatar.role,
    avatar.useCase,
    avatar.language
  ].every(hasText)
}

function isAvatarBehaviorComplete(avatar: AvatarRecord): boolean {
  return [
    avatar.greeting,
    avatar.tone,
    avatar.answerStyle,
    avatar.businessInstructions,
    avatar.fallbackMessage,
    avatar.leadCapturePreference,
    avatar.handoffPreference
  ].every(hasText)
}

export function buildAvatarPublishReadiness(
  avatar: AvatarRecord,
  options: { workspaceIsActive?: boolean } = {}
): AvatarPublishReadiness {
  const workspaceIsActive = options.workspaceIsActive ?? true
  const currentPhoto = getCurrentSourcePhoto(avatar)

  const requirements: AvatarPublishRequirement[] = [
    {
      key: "basics",
      label: "Basics configured",
      complete: areAvatarBasicsComplete(avatar),
      detail: "Name, display identity, role, use case, and language are required."
    },
    {
      key: "photo",
      label: "Photo uploaded and valid",
      complete: Boolean(currentPhoto),
      detail: "Upload a valid source photo before publishing."
    },
    {
      key: "consent",
      label: "Consent accepted for current photo",
      complete: hasCurrentPhotoConsent(avatar),
      detail: "Consent must match the latest valid source photo."
    },
    {
      key: "voice",
      label: "Active voice selected",
      complete: hasActiveSelectedVoice(avatar),
      detail: "Select an active voice from the voice library."
    },
    {
      key: "behavior",
      label: "Behavior configured",
      complete: isAvatarBehaviorComplete(avatar),
      detail: "Greeting, tone, answer style, instructions, fallback, lead, and handoff preferences are required."
    },
    {
      key: "knowledge",
      label: "READY knowledge source available",
      complete: avatar.readyKnowledgeSourceCount > 0,
      detail: "At least one workspace knowledge source must be READY."
    },
    {
      key: "preview",
      label: "Successful preview tested",
      complete: avatar.previewResponseCount > 0,
      detail: "Send at least one dashboard preview message that returns a successful avatar response."
    },
    {
      key: "avatarStatus",
      label: "Avatar is not suspended",
      complete: avatar.status !== AvatarStatus.SUSPENDED,
      detail: "Suspended avatars cannot be published."
    },
    {
      key: "workspace",
      label: "Workspace is active",
      complete: workspaceIsActive,
      detail: "Publishing requires a valid active workspace membership."
    }
  ]

  const missingRequirements = requirements.filter(requirement => !requirement.complete)
  const blockingIssues = missingRequirements.map(requirement => requirement.detail)
  const warnings = [
    "Publishing makes this avatar eligible for Phase 12 website embed.",
    "Widget access still requires allowed domain configuration from the Embed dashboard."
  ]

  return {
    isReady: missingRequirements.length === 0,
    completedRequirements: requirements.filter(requirement => requirement.complete),
    missingRequirements,
    blockingIssues,
    warnings
  }
}

export function getAvatarStatusAfterUnpublish(avatar: AvatarRecord): AvatarStatus.READY | AvatarStatus.DRAFT {
  return buildAvatarPublishReadiness(avatar).isReady ? AvatarStatus.READY : AvatarStatus.DRAFT
}

export function isAvatarPublicRuntimeEligible(avatar: AvatarRecord): boolean {
  return avatar.status === AvatarStatus.PUBLISHED && buildAvatarPublishReadiness(avatar).isReady
}

export function isAvatarTextPreviewReady(avatar: AvatarRecord): {
  ready: boolean
  missingRequirements: string[]
} {
  const missingRequirements: string[] = []
  if (![
    avatar.name,
    avatar.displayName,
    avatar.role,
    avatar.useCase,
    avatar.language,
    avatar.greeting,
    avatar.tone,
    avatar.answerStyle,
    avatar.businessInstructions,
    avatar.fallbackMessage
  ].every(hasText)) {
    missingRequirements.push("Basics and behavior are incomplete.")
  }

  if (avatar.readyKnowledgeSourceCount <= 0) {
    missingRequirements.push("Add at least one READY knowledge source.")
  }

  return {
    ready: missingRequirements.length === 0,
    missingRequirements
  }
}

export async function fetchDashboardPreviewConversation(
  workspaceId: string,
  avatarId: string
): Promise<AvatarPreviewConversation | null> {
  const conversation = await prisma.conversation.findFirst({
    where: {
      workspaceId,
      avatarId,
      channel: ConversationChannel.DASHBOARD_PREVIEW,
      status: ConversationStatus.ACTIVE
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      endedAt: true,
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
      }
    }
  })

  if (!conversation) {
    return null
  }

  return {
    conversationId: conversation.id,
    status: conversation.status,
    updatedAt: conversation.updatedAt.toISOString(),
    endedAt: conversation.endedAt ? conversation.endedAt.toISOString() : null,
    messages: conversation.messages.map(message => ({
      id: message.id,
      role: message.role,
      content: message.content,
      audioUrl: message.audioUrl,
      videoUrl: message.videoUrl,
      createdAt: message.createdAt.toISOString(),
      metadata: parseMessageMetadata(message.metadata)
    }))
  }
}

export async function fetchAvatarsForWorkspace(workspaceId: string): Promise<AvatarRecord[]> {
  const [avatars, knowledgeSummary] = await Promise.all([
    prisma.avatar.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        workspaceId: true,
        voiceId: true,
        name: true,
        displayName: true,
        role: true,
        useCase: true,
        language: true,
        greeting: true,
        tone: true,
        answerStyle: true,
        businessInstructions: true,
        fallbackMessage: true,
        leadCapturePreference: true,
        handoffPreference: true,
        status: true,
        engine: true,
        publishedAt: true,
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
            status: true,
            createdAt: true,
            updatedAt: true
          }
        },
        photoAssets: {
          where: {
            type: AvatarAssetType.SOURCE_PHOTO,
            validationStatus: AvatarAssetValidationStatus.VALID
          },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            id: true,
            storageKey: true,
            displayUrl: true,
            originalFileName: true,
            mimeType: true,
            sizeBytes: true,
            width: true,
            height: true,
            validationStatus: true,
            validationIssues: true
          }
        },
        consentRecords: {
          orderBy: { acceptedAt: "desc" },
          take: 5,
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
        },
        createdAt: true,
        updatedAt: true
      }
    }),
    fetchKnowledgeSummaryForWorkspace(workspaceId)
  ])

  const previewResponseCounts = await fetchDashboardPreviewResponseCountsForAvatars(
    workspaceId,
    avatars.map(avatar => avatar.id)
  )

  return avatars.map(avatar => mapAvatarRecord(
    avatar,
    knowledgeSummary.readySourceCount,
    previewResponseCounts[avatar.id] ?? 0
  ))
}

export async function fetchAvatarByIdAndWorkspace(
  workspaceId: string,
  avatarId: string
): Promise<AvatarRecord | null> {
  const [avatar, knowledgeSummary] = await Promise.all([
    prisma.avatar.findFirst({
      where: {
        id: avatarId,
        workspaceId
      },
      select: {
        id: true,
        workspaceId: true,
        voiceId: true,
        name: true,
        displayName: true,
        role: true,
        useCase: true,
        language: true,
        greeting: true,
        tone: true,
        answerStyle: true,
        businessInstructions: true,
        fallbackMessage: true,
        leadCapturePreference: true,
        handoffPreference: true,
        status: true,
        engine: true,
        publishedAt: true,
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
            status: true,
            createdAt: true,
            updatedAt: true
          }
        },
        photoAssets: {
          where: {
            type: AvatarAssetType.SOURCE_PHOTO,
            validationStatus: AvatarAssetValidationStatus.VALID
          },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            id: true,
            storageKey: true,
            displayUrl: true,
            originalFileName: true,
            mimeType: true,
            sizeBytes: true,
            width: true,
            height: true,
            validationStatus: true,
            validationIssues: true
          }
        },
        consentRecords: {
          orderBy: { acceptedAt: "desc" },
          take: 5,
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
        },
        createdAt: true,
        updatedAt: true
      }
    }),
    fetchKnowledgeSummaryForWorkspace(workspaceId)
  ])

  if (!avatar) {
    return null
  }

  const previewResponseCountRows = await fetchDashboardPreviewResponseCountsForAvatars(
    workspaceId,
    [avatar.id]
  )

  return mapAvatarRecord(
    avatar,
    knowledgeSummary.readySourceCount,
    previewResponseCountRows[avatar.id] ?? 0
  )
}

export function formatWorkspaceLocalTime(date: Date, locale = "en-US"): string {
  return date.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  })
}

export function normalizeAvatarInput(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim()
}

export function isTextLengthSafe(value: string, maxLength: number): boolean {
  return value.length <= maxLength
}
