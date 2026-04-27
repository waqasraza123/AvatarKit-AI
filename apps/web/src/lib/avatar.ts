import {
  AvatarAssetType,
  AvatarAssetValidationStatus,
  AvatarEngine,
  AvatarStatus,
  WorkspaceRole
} from "@prisma/client"
import { getAvatarConsentState, type AvatarConsentRecord } from "@/lib/avatar-consent"
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
  photoAssets: AvatarPhotoAssetRecord[]
  consentRecords: AvatarConsentRecord[]
  createdAt: Date
  updatedAt: Date
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

function mapAvatarRecord(raw: {
  id: string
  workspaceId: string
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
  createdAt: Date
  updatedAt: Date
  photoAssets: unknown
  consentRecords: unknown
}): AvatarRecord {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId,
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
    photoAssets: parseAvatarPhotoAssets(raw.photoAssets),
    consentRecords: parseAvatarConsentRecords(raw.consentRecords),
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
    { key: "voice", label: "Voice selected", complete: false },
    { key: "behavior", label: "Behavior configured", complete: behaviorComplete },
    { key: "knowledge", label: "Knowledge added", complete: false },
    { key: "preview", label: "Preview tested", complete: false },
    { key: "published", label: "Published", complete: false }
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

export async function fetchAvatarsForWorkspace(workspaceId: string): Promise<AvatarRecord[]> {
  const avatars = await prisma.avatar.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      workspaceId: true,
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
  })

  return avatars.map(mapAvatarRecord)
}

export async function fetchAvatarByIdAndWorkspace(
  workspaceId: string,
  avatarId: string
): Promise<AvatarRecord | null> {
  const avatar = await prisma.avatar.findFirst({
    where: {
      id: avatarId,
      workspaceId
    },
    select: {
      id: true,
      workspaceId: true,
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
  })

  if (!avatar) {
    return null
  }

  return mapAvatarRecord(avatar)
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
