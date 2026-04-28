"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { randomUUID } from "node:crypto"
import {
  AvatarAssetType,
  AvatarAssetValidationStatus,
  AvatarStatus,
  ConversationChannel,
  ConversationStatus,
  MessageRole,
  RuntimeTraceStatus,
  WorkspaceRole
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"
import {
  buildAvatarPhotoDisplayUrl,
  buildAvatarPhotoStorageKey,
  buildAvatarAudioDisplayUrl,
  buildAvatarAudioStorageKey,
  buildAvatarVoiceInputDisplayUrl,
  buildAvatarVoiceInputStorageKey,
  buildAvatarVideoDisplayUrl,
  buildAvatarVideoStorageKey,
  deleteAvatarAssetFromDisk,
  writeAvatarAssetToDisk
} from "@/lib/avatar-asset-storage"
import {
  AVATAR_ANSWER_STYLE_OPTIONS,
  AVATAR_HANDOFF_PREFERENCE_OPTIONS,
  AVATAR_LEAD_CAPTURE_PREFERENCE_OPTIONS,
  AVATAR_TONE_OPTIONS,
  AvatarFieldErrors,
  AvatarPreviewConversation,
  buildAvatarPublishReadiness,
  fetchAvatarByIdAndWorkspace,
  isAvatarTextPreviewReady,
  isAvatarAnswerStyle,
  isAvatarHandoffPreference,
  isAvatarLeadCapturePreference,
  isAvatarTone,
  fetchDashboardPreviewConversation,
  getAvatarStatusAfterUnpublish,
  isTextLengthSafe,
  normalizeAvatarInput
} from "@/lib/avatar"
import {
  ensurePersistedVoice,
  isVoiceLanguageCompatible,
  resolveSelectableVoice,
  type AvatarVoiceFieldErrors
} from "@/lib/avatar-voice"
import {
  getAvatarPhotoFileMetadata,
  validateAvatarPhotoFile
} from "@/lib/avatar-photo-validation"
import {
  fetchReadyKnowledgeChunksForRuntime,
  fetchRelevantKnowledgeChunksForPreview
} from "@/lib/avatar-runtime-retrieval"
import { sendRuntimeTextMessage, type RuntimeResponse } from "@/lib/avatar-runtime-client"
import {
  parseVoiceInputDurationSeconds,
  validateAvatarVoiceInputFile
} from "@/lib/avatar-audio-input"
import {
  AVATAR_CONSENT_TERMS_VERSION,
  hasAvatarConsentFieldErrors,
  parseAvatarConsentInput,
  type AvatarConsentFieldErrors
} from "@/lib/avatar-consent"
import { fetchKnowledgeSummaryForWorkspace } from "@/lib/knowledge"

const NAME_MAX_LENGTH = 120
const DISPLAY_NAME_MAX_LENGTH = 140
const ROLE_MAX_LENGTH = 140
const USE_CASE_MAX_LENGTH = 220
const LANGUAGE_MAX_LENGTH = 80
const GREETING_MAX_LENGTH = 500
const BUSINESS_INSTRUCTIONS_MAX_LENGTH = 2000
const FALLBACK_MESSAGE_MAX_LENGTH = 500
const PREVIEW_MESSAGE_MIN_LENGTH = 2
const PREVIEW_MESSAGE_MAX_LENGTH = 800

type AvatarActionState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: AvatarFieldErrors
}

type AvatarPhotoActionState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: {
    avatarId?: string
    photoFile?: string
  }
}

type AvatarConsentActionState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: AvatarConsentFieldErrors
}

type AvatarVoiceActionState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: AvatarVoiceFieldErrors
}

type AvatarPreviewActionState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: {
    avatarId?: string
    inputText?: string
    outputMode?: string
    audioFile?: string
  }
  conversation?: AvatarPreviewConversation
}

type AvatarPublishActionState = {
  status: "idle" | "error" | "success"
  message?: string
}

function hasFieldErrors(errors: AvatarFieldErrors): boolean {
  return Object.values(errors).some(Boolean)
}

function validationError(message: string, fieldErrors?: AvatarFieldErrors): AvatarActionState {
  return {
    status: "error",
    message,
    fieldErrors
  }
}

function photoValidationError(
  message: string,
  fieldErrors?: AvatarPhotoActionState["fieldErrors"]
): AvatarPhotoActionState {
  return {
    status: "error",
    message,
    fieldErrors
  }
}

function consentValidationError(
  message: string,
  fieldErrors?: AvatarConsentFieldErrors
): AvatarConsentActionState {
  return {
    status: "error",
    message,
    fieldErrors
  }
}

function voiceValidationError(
  message: string,
  fieldErrors?: AvatarVoiceFieldErrors
): AvatarVoiceActionState {
  return {
    status: "error",
    message,
    fieldErrors
  }
}

function previewValidationError(
  message: string,
  fieldErrors?: AvatarPreviewActionState["fieldErrors"],
  conversation: AvatarPreviewConversation | undefined = undefined
): AvatarPreviewActionState {
  return {
    status: "error",
    message,
    fieldErrors,
    conversation
  }
}

function publishValidationError(message: string): AvatarPublishActionState {
  return {
    status: "error",
    message
  }
}

function canWriteAvatars(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

function canSendPreviewMessage(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

function canPublishAvatar(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

function normalizeField(formData: FormData, key: string): string {
  return normalizeAvatarInput(formData.get(key))
}

function parsePreviewInput(formData: FormData): {
  avatarId: string
  conversationId: string
  inputText: string
  outputMode: "text" | "audio" | "video"
} {
  const outputMode = normalizeField(formData, "outputMode")
  const normalizedOutputMode = outputMode === "audio" || outputMode === "video"
    ? outputMode
    : "text"

  return {
    avatarId: normalizeField(formData, "avatarId"),
    conversationId: normalizeField(formData, "conversationId"),
    inputText: normalizeField(formData, "inputText"),
    outputMode: normalizedOutputMode
  }
}

function parsePreviewVoiceInput(formData: FormData): {
  avatarId: string
  conversationId: string
  outputMode: "text" | "audio" | "video"
  audioFile: File | null
  durationSeconds: number | null
} {
  const outputMode = normalizeField(formData, "outputMode")
  const normalizedOutputMode = outputMode === "audio" || outputMode === "video"
    ? outputMode
    : "text"
  const audioFile = formData.get("audioFile")

  return {
    avatarId: normalizeField(formData, "avatarId"),
    conversationId: normalizeField(formData, "conversationId"),
    outputMode: normalizedOutputMode,
    audioFile: audioFile instanceof File ? audioFile : null,
    durationSeconds: parseVoiceInputDurationSeconds(formData.get("durationSeconds"))
  }
}

async function createRuntimeTrace(params: {
  workspaceId: string
  avatarId?: string | null
  conversationId?: string | null
  eventType: string
  status: RuntimeTraceStatus
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  try {
    await prisma.runtimeTrace.create({
      data: {
        workspaceId: params.workspaceId,
        avatarId: params.avatarId ?? null,
        conversationId: params.conversationId ?? null,
        eventType: params.eventType,
        status: params.status,
        metadata: params.metadata ?? null
      }
    })
  } catch {
    return
  }
}

function canEditAvatarPhoto(status: AvatarStatus): boolean {
  return status === AvatarStatus.DRAFT || status === AvatarStatus.READY || status === AvatarStatus.FAILED
}

function getRequestIp(headersList: Headers): string | null {
  const forwardedFor = headersList.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null
  }

  return headersList.get("x-real-ip")?.trim() || null
}

function parsePhotoForm(formData: FormData): { avatarId: string; photoFile: File | null } {
  const avatarId = normalizeField(formData, "avatarId")
  const photoFile = formData.get("photo")
  if (photoFile instanceof File) {
    return { avatarId, photoFile }
  }

  return { avatarId, photoFile: null }
}

type AvatarBasicsInput = {
  name: string
  displayName: string
  role: string
  useCase: string
  language: string
  tone: string
  answerStyle: string
}

function parseAvatarBasics(formData: FormData): { data: AvatarBasicsInput; fieldErrors: AvatarFieldErrors } {
  const name = normalizeField(formData, "name")
  const displayName = normalizeField(formData, "displayName")
  const role = normalizeField(formData, "role")
  const useCase = normalizeField(formData, "useCase")
  const language = normalizeField(formData, "language")
  const tone = normalizeField(formData, "tone")
  const answerStyle = normalizeField(formData, "answerStyle")

  const fieldErrors: AvatarFieldErrors = {}

  if (!name) {
    fieldErrors.name = "Avatar name is required."
  } else if (!isTextLengthSafe(name, NAME_MAX_LENGTH)) {
    fieldErrors.name = `Avatar name must be ${NAME_MAX_LENGTH} characters or fewer.`
  }

  if (!displayName) {
    fieldErrors.displayName = "Public display name is required."
  } else if (!isTextLengthSafe(displayName, DISPLAY_NAME_MAX_LENGTH)) {
    fieldErrors.displayName = `Public display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`
  }

  if (!role) {
    fieldErrors.role = "Business role is required."
  } else if (!isTextLengthSafe(role, ROLE_MAX_LENGTH)) {
    fieldErrors.role = `Business role must be ${ROLE_MAX_LENGTH} characters or fewer.`
  }

  if (!useCase) {
    fieldErrors.useCase = "Use case is required."
  } else if (!isTextLengthSafe(useCase, USE_CASE_MAX_LENGTH)) {
    fieldErrors.useCase = `Use case must be ${USE_CASE_MAX_LENGTH} characters or fewer.`
  }

  if (!language) {
    fieldErrors.language = "Primary language is required."
  } else if (!isTextLengthSafe(language, LANGUAGE_MAX_LENGTH)) {
    fieldErrors.language = `Primary language must be ${LANGUAGE_MAX_LENGTH} characters or fewer.`
  }

  if (!tone) {
    fieldErrors.tone = "Tone is required."
  } else if (!isAvatarTone(tone)) {
    fieldErrors.tone = "Select one of the supported tone values."
  }

  if (!answerStyle) {
    fieldErrors.answerStyle = "Answer style is required."
  } else if (!isAvatarAnswerStyle(answerStyle)) {
    fieldErrors.answerStyle = "Select one of the supported answer styles."
  }

  return {
    data: {
      name,
      displayName,
      role,
      useCase,
      language,
      tone,
      answerStyle
    },
    fieldErrors
  }
}

type AvatarBehaviorInput = {
  avatarId: string
  greeting: string
  tone: string
  answerStyle: string
  businessInstructions: string
  fallbackMessage: string
  leadCapturePreference: string
  handoffPreference: string
}

function parseAvatarBehavior(formData: FormData): { data: AvatarBehaviorInput; fieldErrors: AvatarFieldErrors } {
  const avatarId = normalizeField(formData, "avatarId")
  const greeting = normalizeField(formData, "greeting")
  const tone = normalizeField(formData, "tone")
  const answerStyle = normalizeField(formData, "answerStyle")
  const businessInstructions = normalizeField(formData, "businessInstructions")
  const fallbackMessage = normalizeField(formData, "fallbackMessage")
  const leadCapturePreference = normalizeField(formData, "leadCapturePreference")
  const handoffPreference = normalizeField(formData, "handoffPreference")

  const fieldErrors: AvatarFieldErrors = {}

  if (!avatarId) {
    fieldErrors.avatarId = "Missing avatar reference."
  }

  if (!greeting) {
    fieldErrors.greeting = "Greeting is required."
  } else if (!isTextLengthSafe(greeting, GREETING_MAX_LENGTH)) {
    fieldErrors.greeting = `Greeting must be ${GREETING_MAX_LENGTH} characters or fewer.`
  }

  if (!tone) {
    fieldErrors.tone = "Tone is required."
  } else if (!isAvatarTone(tone)) {
    fieldErrors.tone = "Select one of the supported tone values."
  }

  if (!answerStyle) {
    fieldErrors.answerStyle = "Answer style is required."
  } else if (!isAvatarAnswerStyle(answerStyle)) {
    fieldErrors.answerStyle = "Select one of the supported answer styles."
  }

  if (!businessInstructions) {
    fieldErrors.businessInstructions = "Business instructions are required."
  } else if (!isTextLengthSafe(businessInstructions, BUSINESS_INSTRUCTIONS_MAX_LENGTH)) {
    fieldErrors.businessInstructions = "Business instructions are too long."
  }

  if (!fallbackMessage) {
    fieldErrors.fallbackMessage = "Fallback message is required."
  } else if (!isTextLengthSafe(fallbackMessage, FALLBACK_MESSAGE_MAX_LENGTH)) {
    fieldErrors.fallbackMessage = `Fallback message must be ${FALLBACK_MESSAGE_MAX_LENGTH} characters or fewer.`
  }

  if (!leadCapturePreference) {
    fieldErrors.leadCapturePreference = "Lead capture preference is required."
  } else if (!isAvatarLeadCapturePreference(leadCapturePreference)) {
    fieldErrors.leadCapturePreference = "Select one supported lead capture option."
  }

  if (!handoffPreference) {
    fieldErrors.handoffPreference = "Handoff preference is required."
  } else if (!isAvatarHandoffPreference(handoffPreference)) {
    fieldErrors.handoffPreference = "Select one supported handoff option."
  }

  return {
    data: {
      avatarId,
      greeting,
      tone,
      answerStyle,
      businessInstructions,
      fallbackMessage,
      leadCapturePreference,
      handoffPreference
    },
    fieldErrors
  }
}

export async function createAvatarDraftAction(
  _state: AvatarActionState,
  formData: FormData
): Promise<AvatarActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/avatars/new" })
  if (!context) {
    return validationError("Authentication is required.")
  }

  if (!canWriteAvatars(context.workspaceMembership.role)) {
    return validationError("Viewer roles cannot create avatars.")
  }

  const { data, fieldErrors } = parseAvatarBasics(formData)

  if (hasFieldErrors(fieldErrors)) {
    return validationError("Please fix the highlighted fields.", fieldErrors)
  }

  const duplicateNameCount = await prisma.avatar.count({
    where: {
      workspaceId: context.workspace.id,
      name: { equals: data.name, mode: "insensitive" }
    }
  })

  if (duplicateNameCount > 0) {
    return validationError("An avatar with this name already exists in this workspace.", {
      name: "Choose a unique avatar name."
    })
  }

  const displayName = data.displayName || data.name

  const avatar = await prisma.avatar.create({
    data: {
      workspaceId: context.workspace.id,
      name: data.name,
      displayName,
      role: data.role,
      useCase: data.useCase,
      language: data.language,
      greeting: "",
      tone: data.tone,
      answerStyle: data.answerStyle,
      businessInstructions: "",
      fallbackMessage: "",
      leadCapturePreference: "",
      handoffPreference: "",
      status: AvatarStatus.DRAFT
    }
  })

  redirect(`/dashboard/avatars/${avatar.id}/studio`)

  return {
    status: "success",
    message: "Avatar draft created."
  }
}

export async function updateAvatarBasicsAction(
  _state: AvatarActionState,
  formData: FormData
): Promise<AvatarActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/avatars" })
  if (!context) {
    return validationError("Authentication is required.")
  }

  if (!canWriteAvatars(context.workspaceMembership.role)) {
    return validationError("Viewer roles cannot update avatars.")
  }

  const avatarId = normalizeField(formData, "avatarId")
  if (!avatarId) {
    return validationError("Missing avatar reference.")
  }

  const avatar = await prisma.avatar.findFirst({
    where: {
      id: avatarId,
      workspaceId: context.workspace.id
    }
  })

  if (!avatar) {
    return validationError("Avatar does not exist in this workspace.")
  }

  const { data, fieldErrors } = parseAvatarBasics(formData)
  if (hasFieldErrors(fieldErrors)) {
    return validationError("Please fix the highlighted fields.", fieldErrors)
  }

  if (!AVATAR_TONE_OPTIONS.includes(data.tone as (typeof AVATAR_TONE_OPTIONS)[number])) {
    return validationError("Invalid tone option selected.", { tone: "Select a valid tone." })
  }

  if (!AVATAR_ANSWER_STYLE_OPTIONS.includes(
    data.answerStyle as (typeof AVATAR_ANSWER_STYLE_OPTIONS)[number]
  )) {
    return validationError("Invalid answer style option selected.", {
      answerStyle: "Select a valid answer style."
    })
  }

  const duplicateNameCount = await prisma.avatar.count({
    where: {
      workspaceId: context.workspace.id,
      name: { equals: data.name, mode: "insensitive" },
      id: { not: avatarId }
    }
  })

  if (duplicateNameCount > 0) {
    return validationError("An avatar with this name already exists in this workspace.", {
      name: "Choose a unique avatar name."
    })
  }

  const displayName = data.displayName || data.name

  await prisma.avatar.update({
    where: { id: avatar.id },
    data: {
      name: data.name,
      displayName,
      role: data.role,
      useCase: data.useCase,
      language: data.language,
      tone: data.tone,
      answerStyle: data.answerStyle
    }
  })

  return {
    status: "success",
    message: "Avatar basics updated."
  }
}

export async function updateAvatarBehaviorAction(
  _state: AvatarActionState,
  formData: FormData
): Promise<AvatarActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/avatars" })
  if (!context) {
    return validationError("Authentication is required.")
  }

  if (!canWriteAvatars(context.workspaceMembership.role)) {
    return validationError("Viewer roles cannot update avatars.")
  }

  const { data, fieldErrors } = parseAvatarBehavior(formData)
  if (hasFieldErrors(fieldErrors)) {
    return validationError("Please fix the highlighted fields.", fieldErrors)
  }

  if (!AVATAR_LEAD_CAPTURE_PREFERENCE_OPTIONS.includes(
    data.leadCapturePreference as (typeof AVATAR_LEAD_CAPTURE_PREFERENCE_OPTIONS)[number]
  )) {
    return validationError("Invalid lead capture preference.", {
      leadCapturePreference: "Select a valid lead capture preference."
    })
  }

  if (!AVATAR_HANDOFF_PREFERENCE_OPTIONS.includes(
    data.handoffPreference as (typeof AVATAR_HANDOFF_PREFERENCE_OPTIONS)[number]
  )) {
    return validationError("Invalid handoff preference.", {
      handoffPreference: "Select a valid handoff preference."
    })
  }

  const avatar = await prisma.avatar.findFirst({
    where: {
      id: data.avatarId,
      workspaceId: context.workspace.id
    }
  })

  if (!avatar) {
    return validationError("Avatar does not exist in this workspace.")
  }

  await prisma.avatar.update({
    where: { id: avatar.id },
    data: {
      greeting: data.greeting,
      tone: data.tone,
      answerStyle: data.answerStyle,
      businessInstructions: data.businessInstructions,
      fallbackMessage: data.fallbackMessage,
      leadCapturePreference: data.leadCapturePreference,
      handoffPreference: data.handoffPreference
    }
  })

  return {
    status: "success",
    message: "Avatar behavior updated."
  }
}

export async function deleteAvatarDraftAction(
  _state: AvatarActionState,
  formData: FormData
): Promise<AvatarActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/avatars" })
  if (!context) {
    return validationError("Authentication is required.")
  }

  if (!canWriteAvatars(context.workspaceMembership.role)) {
    return validationError("Viewer roles cannot delete avatars.")
  }

  const avatarId = normalizeField(formData, "avatarId")
  if (!avatarId) {
    return validationError("Missing avatar reference.")
  }

  const avatar = await prisma.avatar.findFirst({
    where: {
      id: avatarId,
      workspaceId: context.workspace.id
    },
    select: { id: true, status: true }
  })

  if (!avatar) {
    return validationError("Avatar does not exist in this workspace.")
  }

  if (avatar.status !== AvatarStatus.DRAFT) {
    return validationError("Only draft avatars can be deleted at this stage.")
  }

  await prisma.avatar.delete({ where: { id: avatar.id } })

  return {
    status: "success",
    message: "Avatar draft deleted."
  }
}

export async function uploadAvatarPhotoAction(
  _state: AvatarPhotoActionState,
  formData: FormData
): Promise<AvatarPhotoActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/avatars" })
  if (!context) {
    return photoValidationError("Authentication is required.")
  }

  if (!canWriteAvatars(context.workspaceMembership.role)) {
    return photoValidationError("Viewer roles cannot upload avatar photos.")
  }

  const { avatarId, photoFile } = parsePhotoForm(formData)
  if (!avatarId) {
    return photoValidationError("Missing avatar reference.", { avatarId: "Missing avatar reference." })
  }

  const avatar = await prisma.avatar.findFirst({
    where: {
      id: avatarId,
      workspaceId: context.workspace.id
    },
    select: { id: true, workspaceId: true, status: true }
  })

  if (!avatar) {
    return photoValidationError("Avatar does not exist in this workspace.")
  }

  if (!canEditAvatarPhoto(avatar.status)) {
    return photoValidationError("Avatar photos can only be changed while avatar is draft, ready, or failed.")
  }

  if (!photoFile) {
    return photoValidationError("Upload a valid image file.", { photoFile: "Upload a JPG, PNG, or WEBP image." })
  }

  let rawBytes: Buffer
  try {
    rawBytes = Buffer.from(await photoFile.arrayBuffer())
  } catch {
    return photoValidationError("Upload could not be read. Please try another image.", {
      photoFile: "We could not read this image."
    })
  }

  const validation = validateAvatarPhotoFile(photoFile, rawBytes)
  if (!validation.ok) {
    return photoValidationError(
      validation.validationIssues[0] ?? "This image is not accepted.",
      { photoFile: validation.validationIssues[0] ?? "This image is not accepted." }
    )
  }

  const fileExtension = getAvatarPhotoFileMetadata(photoFile)
  const assetId = randomUUID()
  const storageKey = buildAvatarPhotoStorageKey({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    assetId,
    fileExtension
  })

  try {
    await writeAvatarAssetToDisk({ storageKey, content: rawBytes })
  } catch {
    return photoValidationError("Could not save image. Please try again.")
  }

  try {
    await prisma.$transaction(async tx => {
      await tx.avatarAsset.updateMany({
        where: {
          avatarId: avatar.id,
          type: AvatarAssetType.SOURCE_PHOTO,
          validationStatus: AvatarAssetValidationStatus.VALID
        },
        data: { validationStatus: AvatarAssetValidationStatus.INVALID }
      })

      await tx.avatarAsset.create({
        data: {
          id: assetId,
          workspaceId: avatar.workspaceId,
          avatarId: avatar.id,
          type: AvatarAssetType.SOURCE_PHOTO,
          storageKey,
          displayUrl: buildAvatarPhotoDisplayUrl(assetId),
          originalFileName: photoFile.name || "avatar-photo.jpg",
          mimeType: photoFile.type,
          sizeBytes: photoFile.size,
          width: validation.width ?? 0,
          height: validation.height ?? 0,
          validationStatus: AvatarAssetValidationStatus.VALID,
          validationIssues: validation.validationIssues
        }
      })
    })
  } catch {
    await deleteAvatarAssetFromDisk(storageKey).catch(() => undefined)
    return photoValidationError("Could not process image metadata. Please try again.")
  }

  revalidatePath(`/dashboard/avatars/${avatar.id}/studio`)
  revalidatePath("/dashboard/avatars")
  return {
    status: "success",
    message: "Avatar photo uploaded."
  }
}

export async function removeAvatarPhotoAction(
  _state: AvatarPhotoActionState,
  formData: FormData
): Promise<AvatarPhotoActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/avatars" })
  if (!context) {
    return photoValidationError("Authentication is required.")
  }

  if (!canWriteAvatars(context.workspaceMembership.role)) {
    return photoValidationError("Viewer roles cannot remove avatar photos.")
  }

  const avatarId = normalizeField(formData, "avatarId")
  if (!avatarId) {
    return photoValidationError("Missing avatar reference.", { avatarId: "Missing avatar reference." })
  }

  const avatar = await prisma.avatar.findFirst({
    where: {
      id: avatarId,
      workspaceId: context.workspace.id
    },
    select: { id: true, status: true }
  })

  if (!avatar) {
    return photoValidationError("Avatar does not exist in this workspace.")
  }

  if (!canEditAvatarPhoto(avatar.status)) {
    return photoValidationError("Avatar photos can only be changed while avatar is draft, ready, or failed.")
  }

  const currentPhoto = await prisma.avatarAsset.findFirst({
    where: {
      avatarId: avatar.id,
      type: AvatarAssetType.SOURCE_PHOTO,
      validationStatus: AvatarAssetValidationStatus.VALID
    },
    select: { id: true }
  })

  if (!currentPhoto) {
    return photoValidationError("Avatar has no source photo to remove.")
  }

  await prisma.avatarAsset.updateMany({
    where: {
      avatarId: avatar.id,
      type: AvatarAssetType.SOURCE_PHOTO,
      validationStatus: AvatarAssetValidationStatus.VALID
    },
    data: { validationStatus: AvatarAssetValidationStatus.INVALID }
  })

  revalidatePath(`/dashboard/avatars/${avatar.id}/studio`)
  revalidatePath("/dashboard/avatars")
  return {
    status: "success",
    message: "Avatar photo removed."
  }
}

export async function acceptAvatarConsentAction(
  _state: AvatarConsentActionState,
  formData: FormData
): Promise<AvatarConsentActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/avatars" })
  if (!context) {
    return consentValidationError("Authentication is required.")
  }

  if (!canWriteAvatars(context.workspaceMembership.role)) {
    return consentValidationError("Viewer roles cannot accept avatar consent.")
  }

  const { data, fieldErrors } = parseAvatarConsentInput(formData)
  if (hasAvatarConsentFieldErrors(fieldErrors)) {
    return consentValidationError("Please complete all required consent fields.", fieldErrors)
  }

  if (!data.consentType || !data.permissionBasis) {
    return consentValidationError("Please complete all required consent fields.", fieldErrors)
  }

  const avatar = await prisma.avatar.findFirst({
    where: {
      id: data.avatarId,
      workspaceId: context.workspace.id
    },
    select: {
      id: true,
      workspaceId: true,
      status: true
    }
  })

  if (!avatar) {
    return consentValidationError("Avatar does not exist in this workspace.")
  }

  if (avatar.status === AvatarStatus.SUSPENDED) {
    return consentValidationError("Consent cannot be accepted while this avatar is suspended.")
  }

  const currentPhoto = await prisma.avatarAsset.findFirst({
    where: {
      id: data.sourcePhotoAssetId,
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      type: AvatarAssetType.SOURCE_PHOTO,
      validationStatus: AvatarAssetValidationStatus.VALID
    },
    select: {
      id: true
    }
  })

  if (!currentPhoto) {
    return consentValidationError("Upload a valid source photo before accepting consent.", {
      sourcePhotoAssetId: "Current source photo is missing or no longer valid."
    })
  }

  const latestSourcePhoto = await prisma.avatarAsset.findFirst({
    where: {
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      type: AvatarAssetType.SOURCE_PHOTO,
      validationStatus: AvatarAssetValidationStatus.VALID
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true }
  })

  if (!latestSourcePhoto || latestSourcePhoto.id !== currentPhoto.id) {
    return consentValidationError("The source photo changed. Review the current photo and accept consent again.", {
      sourcePhotoAssetId: "This consent form is no longer tied to the current source photo."
    })
  }

  const headersList = await headers()
  const acceptedIp = getRequestIp(headersList)
  const acceptedUserAgent = headersList.get("user-agent")?.trim() || null

  await prisma.consentRecord.upsert({
    where: {
      avatarAssetId: currentPhoto.id
    },
    create: {
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      avatarAssetId: currentPhoto.id,
      acceptedByUserId: context.user.id,
      consentType: data.consentType,
      permissionBasis: data.permissionBasis,
      termsVersion: AVATAR_CONSENT_TERMS_VERSION,
      acceptedIp,
      acceptedUserAgent
    },
    update: {
      acceptedByUserId: context.user.id,
      consentType: data.consentType,
      permissionBasis: data.permissionBasis,
      termsVersion: AVATAR_CONSENT_TERMS_VERSION,
      acceptedIp,
      acceptedUserAgent,
      acceptedAt: new Date()
    }
  })

  revalidatePath(`/dashboard/avatars/${avatar.id}/studio`)
  revalidatePath("/dashboard/avatars")
  return {
    status: "success",
    message: "Consent accepted for the current source photo."
  }
}

export async function updateAvatarVoiceAction(
  _state: AvatarVoiceActionState,
  formData: FormData
): Promise<AvatarVoiceActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/avatars" })
  if (!context) {
    return voiceValidationError("Authentication is required.")
  }

  if (!canWriteAvatars(context.workspaceMembership.role)) {
    return voiceValidationError("Viewer roles cannot update avatar voice selection.")
  }

  const avatarId = normalizeField(formData, "avatarId")
  const voiceId = normalizeField(formData, "voiceId")
  const shouldClearVoice = normalizeField(formData, "clearVoice") === "true"

  if (!avatarId) {
    return voiceValidationError("Missing avatar reference.", { avatarId: "Missing avatar reference." })
  }

  const avatar = await prisma.avatar.findFirst({
    where: {
      id: avatarId,
      workspaceId: context.workspace.id
    },
    select: {
      id: true,
      language: true,
      status: true
    }
  })

  if (!avatar) {
    return voiceValidationError("Avatar does not exist in this workspace.")
  }

  if (avatar.status === AvatarStatus.SUSPENDED) {
    return voiceValidationError("Voice cannot be changed while this avatar is suspended.")
  }

  if (shouldClearVoice) {
    await prisma.avatar.update({
      where: { id: avatar.id },
      data: { voiceId: null }
    })

    revalidatePath(`/dashboard/avatars/${avatar.id}/studio`)
    revalidatePath("/dashboard/avatars")

    return {
      status: "success",
      message: "Avatar voice selection cleared."
    }
  }

  if (!voiceId) {
    return voiceValidationError("Select an active voice before saving.", {
      voiceId: "Choose an active voice from the library."
    })
  }

  const selectedVoice = await resolveSelectableVoice(voiceId)
  if (!selectedVoice) {
    return voiceValidationError("Selected voice is not available.", {
      voiceId: "Choose an active voice from the library."
    })
  }

  if (selectedVoice.status !== "ACTIVE") {
    return voiceValidationError("Selected voice is inactive.", {
      voiceId: "Choose an active voice from the library."
    })
  }

  if (!isVoiceLanguageCompatible(avatar.language, selectedVoice.language)) {
    return voiceValidationError("Selected voice language does not match this avatar language.", {
      voiceId: `Choose a ${avatar.language} compatible voice.`
    })
  }

  const persistedVoice = await ensurePersistedVoice(selectedVoice)

  await prisma.avatar.update({
    where: { id: avatar.id },
    data: { voiceId: persistedVoice.id }
  })

  revalidatePath(`/dashboard/avatars/${avatar.id}/studio`)
  revalidatePath("/dashboard/avatars")

  return {
    status: "success",
    message: "Avatar voice selection saved."
  }
}

export async function publishAvatarAction(
  _state: AvatarPublishActionState,
  formData: FormData
): Promise<AvatarPublishActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/avatars" })
  if (!context) {
    return publishValidationError("Authentication is required.")
  }

  if (!canPublishAvatar(context.workspaceMembership.role)) {
    return publishValidationError("Viewer roles cannot publish avatars.")
  }

  const avatarId = normalizeField(formData, "avatarId")
  if (!avatarId) {
    return publishValidationError("Missing avatar reference.")
  }

  const avatar = await fetchAvatarByIdAndWorkspace(context.workspace.id, avatarId)
  if (!avatar) {
    return publishValidationError("Avatar does not exist in this workspace.")
  }

  const readiness = buildAvatarPublishReadiness(avatar, { workspaceIsActive: true })
  if (!readiness.isReady) {
    return publishValidationError(
      `Avatar is not ready to publish: ${readiness.blockingIssues.join(" ")}`
    )
  }

  if (avatar.status === AvatarStatus.PUBLISHED) {
    if (!avatar.publishedAt) {
      await prisma.avatar.update({
        where: { id: avatar.id },
        data: { publishedAt: new Date() }
      })
    }

    revalidatePath(`/dashboard/avatars/${avatar.id}/studio?step=publish`)
    revalidatePath("/dashboard/avatars")

    return {
      status: "success",
      message: "Avatar is already published."
    }
  }

  await prisma.avatar.update({
    where: { id: avatar.id },
    data: {
      status: AvatarStatus.PUBLISHED,
      publishedAt: avatar.publishedAt ?? new Date()
    }
  })

  revalidatePath(`/dashboard/avatars/${avatar.id}/studio?step=publish`)
  revalidatePath("/dashboard/avatars")

  return {
    status: "success",
    message: "Avatar published."
  }
}

export async function unpublishAvatarAction(
  _state: AvatarPublishActionState,
  formData: FormData
): Promise<AvatarPublishActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/avatars" })
  if (!context) {
    return publishValidationError("Authentication is required.")
  }

  if (!canPublishAvatar(context.workspaceMembership.role)) {
    return publishValidationError("Viewer roles cannot unpublish avatars.")
  }

  const avatarId = normalizeField(formData, "avatarId")
  if (!avatarId) {
    return publishValidationError("Missing avatar reference.")
  }

  const avatar = await fetchAvatarByIdAndWorkspace(context.workspace.id, avatarId)
  if (!avatar) {
    return publishValidationError("Avatar does not exist in this workspace.")
  }

  if (avatar.status === AvatarStatus.SUSPENDED) {
    return publishValidationError("Suspended avatars cannot be changed from the publish step.")
  }

  if (avatar.status !== AvatarStatus.PUBLISHED) {
    revalidatePath(`/dashboard/avatars/${avatar.id}/studio?step=publish`)
    revalidatePath("/dashboard/avatars")

    return {
      status: "success",
      message: "Avatar is already unpublished."
    }
  }

  await prisma.avatar.update({
    where: { id: avatar.id },
    data: {
      status: getAvatarStatusAfterUnpublish(avatar)
    }
  })

  revalidatePath(`/dashboard/avatars/${avatar.id}/studio?step=publish`)
  revalidatePath("/dashboard/avatars")

  return {
    status: "success",
    message: "Avatar unpublished."
  }
}

export async function sendAvatarPreviewMessageAction(
  _state: AvatarPreviewActionState,
  formData: FormData
): Promise<AvatarPreviewActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/avatars" })
  if (!context) {
    return previewValidationError("Authentication is required.")
  }

  if (!canSendPreviewMessage(context.workspaceMembership.role)) {
    return previewValidationError("Viewer roles cannot send preview messages.")
  }

  const { avatarId, conversationId, inputText, outputMode } = parsePreviewInput(formData)
  if (!avatarId) {
    return previewValidationError("Missing avatar reference.", { avatarId: "Missing avatar reference." })
  }

  if (inputText.length < PREVIEW_MESSAGE_MIN_LENGTH) {
    return previewValidationError("Enter at least two characters.", {
      inputText: "Question needs to be at least two characters."
    })
  }

  if (!isTextLengthSafe(inputText, PREVIEW_MESSAGE_MAX_LENGTH)) {
    return previewValidationError(`Question must be ${PREVIEW_MESSAGE_MAX_LENGTH} characters or fewer.`, {
      inputText: `Question must be ${PREVIEW_MESSAGE_MAX_LENGTH} characters or fewer.`
    })
  }

  const [avatar, knowledgeSummary, existingConversation] = await Promise.all([
    prisma.avatar.findFirst({
      where: {
        id: avatarId,
        workspaceId: context.workspace.id
      },
      select: {
        id: true,
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
        voice: {
          select: {
            id: true,
            provider: true,
            providerVoiceId: true,
            name: true,
            language: true,
            style: true,
            presentationStyle: true,
            status: true
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
            displayUrl: true,
            mimeType: true,
            width: true,
            height: true
          }
        },
        consentRecords: {
          orderBy: { acceptedAt: "desc" },
          take: 5,
          select: {
            avatarAssetId: true
          }
        }
      }
    }),
    fetchKnowledgeSummaryForWorkspace(context.workspace.id),
    conversationId
      ? prisma.conversation.findFirst({
        where: {
          id: conversationId,
          workspaceId: context.workspace.id,
          avatarId,
          channel: ConversationChannel.DASHBOARD_PREVIEW,
          status: ConversationStatus.ACTIVE
        },
        select: { id: true }
      })
      : Promise.resolve(null)
  ])

  if (!avatar) {
    return previewValidationError("Avatar does not exist in this workspace.")
  }

  if (avatar.status === AvatarStatus.SUSPENDED) {
    return previewValidationError("Suspended avatars cannot be previewed.")
  }

  const currentSourcePhoto = avatar.photoAssets[0] ?? null
  const hasCurrentSourcePhotoConsent = Boolean(
    currentSourcePhoto &&
    avatar.consentRecords.some(record => record.avatarAssetId === currentSourcePhoto.id)
  )

  if (outputMode === "audio" || outputMode === "video") {
    if (!avatar.voice) {
      return previewValidationError(outputMode === "video"
        ? "Select a voice before requesting Text + avatar video preview."
        : "Select a voice before requesting Text + audio preview.", {
        outputMode: "Go to the Voice step and choose an active voice."
      })
    }

    if (avatar.voice.status !== "ACTIVE") {
      return previewValidationError(outputMode === "video"
        ? "The selected voice is inactive. Choose an active voice before video preview."
        : "The selected voice is inactive. Choose an active voice before audio preview.", {
        outputMode: "Choose an active voice in the Voice step."
      })
    }

    if (!isVoiceLanguageCompatible(avatar.language, avatar.voice.language)) {
      return previewValidationError(outputMode === "video"
        ? "The selected voice is not compatible with this avatar language for video preview."
        : "The selected voice is not compatible with this avatar language.", {
        outputMode: "Choose a compatible active voice in the Voice step."
      })
    }
  }

  if (outputMode === "video") {
    if (!currentSourcePhoto) {
      return previewValidationError("Upload an avatar photo before generating video.", {
        outputMode: "Go to the Photo step and upload a valid source photo."
      })
    }

    if (!hasCurrentSourcePhotoConsent) {
      return previewValidationError("Accept avatar identity consent before generating video.", {
        outputMode: "Go to the Consent step and accept consent for the current photo."
      })
    }
  }

  if (
    ![
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
    ].every(Boolean) ||
    knowledgeSummary.readySourceCount <= 0
  ) {
    return previewValidationError(
      "Complete basics, behavior, and at least one READY knowledge source before preview."
    )
  }

  const activeConversation = existingConversation ?? await prisma.conversation.findFirst({
    where: {
      workspaceId: context.workspace.id,
      avatarId,
      channel: ConversationChannel.DASHBOARD_PREVIEW,
      status: ConversationStatus.ACTIVE
    },
    select: { id: true }
  })

  const targetConversation = activeConversation
    ? activeConversation
    : await prisma.conversation.create({
      data: {
        workspaceId: context.workspace.id,
        avatarId,
        channel: ConversationChannel.DASHBOARD_PREVIEW,
        status: ConversationStatus.ACTIVE
      }
    })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "message.received",
    status: RuntimeTraceStatus.STARTED
  })

  const visitorMessageId = randomUUID()
  await prisma.message.create({
    data: {
      conversationId: targetConversation.id,
      id: visitorMessageId,
      role: MessageRole.VISITOR,
      content: inputText
    }
  })

  const visitorMessageCount = await prisma.message.count({
    where: {
      conversationId: targetConversation.id,
      role: MessageRole.VISITOR
    }
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "message.received",
    status: RuntimeTraceStatus.SUCCESS
  })

  let runtimeResponse: RuntimeResponse
  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "retrieval.started",
    status: RuntimeTraceStatus.STARTED
  })

  const knowledgeChunks = await fetchRelevantKnowledgeChunksForPreview({
    workspaceId: context.workspace.id,
    messageText: inputText
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "retrieval.completed",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      requestedChunkCount: knowledgeChunks.length,
      keywordCount: inputText.split(/\s+/).filter(Boolean).length
    }
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "llm.started",
    status: RuntimeTraceStatus.STARTED
  })

  if (outputMode === "video") {
    await createRuntimeTrace({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      eventType: "avatar_video.started",
      status: RuntimeTraceStatus.STARTED,
      metadata: {
        sourcePhotoAssetId: currentSourcePhoto?.id ?? null,
        voiceId: avatar.voice?.id ?? null
      }
    })
  }

  let runtimeErrorMessage: string | null = null
  try {
    runtimeResponse = await sendRuntimeTextMessage({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      messageId: visitorMessageId,
      channel: "DASHBOARD_PREVIEW",
      inputType: "text",
      inputText,
      outputMode,
      visitorMessageCount,
      avatarConfig: {
        avatarId: avatar.id,
        greeting: avatar.greeting,
        tone: avatar.tone,
        answerStyle: avatar.answerStyle,
        businessInstructions: avatar.businessInstructions,
        fallbackMessage: avatar.fallbackMessage,
        leadCapturePreference: avatar.leadCapturePreference,
        handoffPreference: avatar.handoffPreference,
        language: avatar.language
      },
      selectedVoiceMetadata: avatar.voice ? {
        id: avatar.voice.id,
        provider: avatar.voice.provider,
        providerVoiceId: avatar.voice.providerVoiceId,
        name: avatar.voice.name,
        language: avatar.voice.language,
        style: avatar.voice.style,
        presentationStyle: avatar.voice.presentationStyle,
        status: avatar.voice.status
      } : null,
      avatarPhotoReference: currentSourcePhoto ? {
        assetId: currentSourcePhoto.id,
        url: currentSourcePhoto.displayUrl,
        mimeType: currentSourcePhoto.mimeType,
        width: currentSourcePhoto.width,
        height: currentSourcePhoto.height
      } : null,
      knowledgeChunks
    })
  } catch {
    runtimeErrorMessage = "Runtime transport or runtime parse failure."
    runtimeResponse = {
      conversationId: targetConversation.id,
      messageId: visitorMessageId,
      status: "error",
      answer: "Runtime request failed. Please try again.",
      leadCaptureDecision: "none",
      leadCapture: {
        required: false,
        reason: null,
        fields: [],
        promptText: null
      },
      handoffDecision: "request",
      usage: {
        provider: "unknown"
      },
      sourceReferences: []
    }
  }

  if (runtimeErrorMessage !== null) {
    await createRuntimeTrace({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      eventType: "runtime.failed",
      status: RuntimeTraceStatus.FAILURE,
      metadata: {
        error: runtimeErrorMessage,
        provider: runtimeResponse.usage.provider
      }
    })
  }

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "llm.completed",
    status: runtimeResponse.status === "error" ? RuntimeTraceStatus.FAILURE : RuntimeTraceStatus.SUCCESS,
    metadata: {
      provider: runtimeResponse.usage.provider,
      status: runtimeResponse.status
    }
  })

  if (runtimeResponse.status === "error") {
    await createRuntimeTrace({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      eventType: "runtime.failed",
      status: RuntimeTraceStatus.FAILURE,
      metadata: {
        status: runtimeResponse.status,
        provider: runtimeResponse.usage.provider,
        reason: runtimeResponse.safetyReason ?? runtimeResponse.usage.reason
      }
    })
  }

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "safety.checked",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      handoffDecision: runtimeResponse.handoffDecision,
      leadCaptureDecision: runtimeResponse.leadCaptureDecision
    }
  })

  const avatarMessageId = randomUUID()
  let audioUrl: string | null = null
  let audioErrorMessage: string | null = runtimeResponse.audioError?.message ?? null
  let audioUsage: Record<string, unknown> | null = runtimeResponse.audio?.usage ?? null
  let videoUrl: string | null = null
  let videoErrorMessage: string | null = runtimeResponse.videoError?.message ?? null
  let videoUsage: Record<string, unknown> | null = runtimeResponse.video?.usage ?? null
  let videoDurationSeconds: number | null = typeof runtimeResponse.video?.durationSeconds === "number"
    ? runtimeResponse.video.durationSeconds
    : null
  let videoProviderJobId: string | null = runtimeResponse.video?.providerJobId ?? null

  if (outputMode === "audio" || outputMode === "video") {
    await createRuntimeTrace({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      eventType: "tts.started",
      status: RuntimeTraceStatus.STARTED,
      metadata: {
        voiceId: avatar.voice?.id ?? null
      }
    })

    if (runtimeResponse.audio) {
      await createRuntimeTrace({
        workspaceId: context.workspace.id,
        avatarId,
        conversationId: targetConversation.id,
        eventType: "tts.completed",
        status: RuntimeTraceStatus.SUCCESS,
        metadata: {
          provider: runtimeResponse.audio.provider,
          mimeType: runtimeResponse.audio.mimeType,
          characters: runtimeResponse.audio.usage.characters ?? runtimeResponse.answer.length
        }
      })

      const audioAssetId = randomUUID()
      const fileExtension = runtimeResponse.audio.fileExtension || "bin"
      const storageKey = buildAvatarAudioStorageKey({
        workspaceId: context.workspace.id,
        avatarId,
        conversationId: targetConversation.id,
        messageId: avatarMessageId,
        assetId: audioAssetId,
        fileExtension
      })

      try {
        const audioBytes = Buffer.from(runtimeResponse.audio.audioBase64, "base64")
        await writeAvatarAssetToDisk({ storageKey, content: audioBytes })
        audioUrl = buildAvatarAudioDisplayUrl(audioAssetId)
        await prisma.avatarAsset.create({
          data: {
            id: audioAssetId,
            workspaceId: context.workspace.id,
            avatarId,
            type: AvatarAssetType.GENERATED_SPEECH_AUDIO,
            storageKey,
            displayUrl: audioUrl,
            originalFileName: `avatar-response-${avatarMessageId}.${fileExtension}`,
            mimeType: runtimeResponse.audio.mimeType,
            sizeBytes: audioBytes.byteLength,
            width: 0,
            height: 0,
            validationStatus: AvatarAssetValidationStatus.VALID,
            validationIssues: []
          }
        })
        await createRuntimeTrace({
          workspaceId: context.workspace.id,
          avatarId,
          conversationId: targetConversation.id,
          eventType: "audio.stored",
          status: RuntimeTraceStatus.SUCCESS,
          metadata: {
            assetId: audioAssetId,
            mimeType: runtimeResponse.audio.mimeType,
            sizeBytes: audioBytes.byteLength
          }
        })
      } catch {
        audioErrorMessage = "Audio was generated but could not be stored."
        audioUrl = null
        await deleteAvatarAssetFromDisk(storageKey).catch(() => undefined)
        await createRuntimeTrace({
          workspaceId: context.workspace.id,
          avatarId,
          conversationId: targetConversation.id,
          eventType: "audio.failed",
          status: RuntimeTraceStatus.FAILURE,
          metadata: {
            reason: "storage_failed"
          }
        })
      }
    } else {
      await createRuntimeTrace({
        workspaceId: context.workspace.id,
        avatarId,
        conversationId: targetConversation.id,
        eventType: "tts.failed",
        status: RuntimeTraceStatus.FAILURE,
        metadata: {
          reason: runtimeResponse.audioError?.code ?? "missing_audio",
          message: runtimeResponse.audioError?.message ?? "TTS provider did not return audio.",
          provider: runtimeResponse.audioError?.provider ?? null
        }
      })
    }
  }

  if (outputMode === "video") {
    if (runtimeResponse.video && runtimeResponse.video.status === "completed") {
      await createRuntimeTrace({
        workspaceId: context.workspace.id,
        avatarId,
        conversationId: targetConversation.id,
        eventType: "avatar_video.completed",
        status: RuntimeTraceStatus.SUCCESS,
        metadata: {
          provider: runtimeResponse.video.provider,
          providerJobId: runtimeResponse.video.providerJobId ?? null,
          durationSeconds: runtimeResponse.video.durationSeconds ?? null
        }
      })

      if (runtimeResponse.video.videoBase64) {
        const videoAssetId = randomUUID()
        const videoMimeType = runtimeResponse.video.mimeType || "video/mp4"
        const fileExtension = runtimeResponse.video.fileExtension ||
          (videoMimeType.includes("webm") ? "webm" : videoMimeType.includes("quicktime") ? "mov" : "mp4")
        const storageKey = buildAvatarVideoStorageKey({
          workspaceId: context.workspace.id,
          avatarId,
          conversationId: targetConversation.id,
          messageId: avatarMessageId,
          assetId: videoAssetId,
          fileExtension
        })

        try {
          const videoBytes = Buffer.from(runtimeResponse.video.videoBase64, "base64")
          await writeAvatarAssetToDisk({ storageKey, content: videoBytes })
          videoUrl = buildAvatarVideoDisplayUrl(videoAssetId)
          await prisma.avatarAsset.create({
            data: {
              id: videoAssetId,
              workspaceId: context.workspace.id,
              avatarId,
              type: AvatarAssetType.GENERATED_AVATAR_VIDEO,
              storageKey,
              displayUrl: videoUrl,
              originalFileName: `avatar-response-${avatarMessageId}.${fileExtension}`,
              mimeType: videoMimeType,
              sizeBytes: videoBytes.byteLength,
              width: 0,
              height: 0,
              validationStatus: AvatarAssetValidationStatus.VALID,
              validationIssues: []
            }
          })
          await createRuntimeTrace({
            workspaceId: context.workspace.id,
            avatarId,
            conversationId: targetConversation.id,
            eventType: "video.stored",
            status: RuntimeTraceStatus.SUCCESS,
            metadata: {
              assetId: videoAssetId,
              mimeType: videoMimeType,
              sizeBytes: videoBytes.byteLength,
              storage: "avatar_asset"
            }
          })
        } catch {
          videoErrorMessage = "Video was generated but could not be stored."
          videoUrl = null
          await deleteAvatarAssetFromDisk(storageKey).catch(() => undefined)
          await createRuntimeTrace({
            workspaceId: context.workspace.id,
            avatarId,
            conversationId: targetConversation.id,
            eventType: "video.failed",
            status: RuntimeTraceStatus.FAILURE,
            metadata: {
              reason: "storage_failed"
            }
          })
        }
      } else if (runtimeResponse.video.videoUrl) {
        videoUrl = runtimeResponse.video.videoUrl
        await createRuntimeTrace({
          workspaceId: context.workspace.id,
          avatarId,
          conversationId: targetConversation.id,
          eventType: "video.stored",
          status: RuntimeTraceStatus.SUCCESS,
          metadata: {
            provider: runtimeResponse.video.provider,
            providerJobId: runtimeResponse.video.providerJobId ?? null,
            storage: "provider_hosted_reference"
          }
        })
      } else {
        videoErrorMessage = "Video generation completed without a playable video URL."
        await createRuntimeTrace({
          workspaceId: context.workspace.id,
          avatarId,
          conversationId: targetConversation.id,
          eventType: "video.failed",
          status: RuntimeTraceStatus.FAILURE,
          metadata: {
            reason: "missing_video_url",
            provider: runtimeResponse.video.provider
          }
        })
      }
    } else {
      videoErrorMessage = runtimeResponse.videoError?.message ??
        (runtimeResponse.video?.status === "processing"
          ? "Video generation is still processing. Phase 10 preview does not include polling for this provider yet."
          : "Avatar video provider did not return a completed video.")
      await createRuntimeTrace({
        workspaceId: context.workspace.id,
        avatarId,
        conversationId: targetConversation.id,
        eventType: "avatar_video.failed",
        status: RuntimeTraceStatus.FAILURE,
        metadata: {
          reason: runtimeResponse.videoError?.code ?? runtimeResponse.video?.status ?? "missing_video",
          message: videoErrorMessage,
          provider: runtimeResponse.videoError?.provider ?? runtimeResponse.video?.provider ?? null,
          providerJobId: runtimeResponse.video?.providerJobId ?? null
        }
      })
      await createRuntimeTrace({
        workspaceId: context.workspace.id,
        avatarId,
        conversationId: targetConversation.id,
        eventType: "video.failed",
        status: RuntimeTraceStatus.FAILURE,
        metadata: {
          reason: runtimeResponse.videoError?.code ?? runtimeResponse.video?.status ?? "missing_video",
          provider: runtimeResponse.videoError?.provider ?? runtimeResponse.video?.provider ?? null,
          providerJobId: runtimeResponse.video?.providerJobId ?? null
        }
      })
    }
  }

  await prisma.message.create({
    data: {
      id: avatarMessageId,
      conversationId: targetConversation.id,
      role: MessageRole.AVATAR,
      content: runtimeResponse.answer || "",
      audioUrl,
      videoUrl,
      metadata: {
        runtimeStatus: runtimeResponse.status,
        usage: runtimeResponse.usage,
        outputMode,
        audioStatus: outputMode === "audio" || outputMode === "video"
          ? audioUrl
            ? "generated"
            : "failed"
          : "none",
        audioError: audioErrorMessage,
        ttsUsage: audioUsage,
        videoStatus: outputMode === "video"
          ? videoUrl
            ? "generated"
            : "failed"
          : "none",
        videoError: videoErrorMessage,
        videoUsage,
        videoDurationSeconds,
        videoProviderJobId,
        intent: runtimeResponse.intent ?? null,
        confidence: runtimeResponse.confidence ?? null,
        handoffDecision: runtimeResponse.handoffDecision,
        leadCaptureDecision: runtimeResponse.leadCaptureDecision,
        leadCapture: runtimeResponse.leadCapture,
        safetyReason: runtimeResponse.safetyReason ?? null,
        sourceReferenceCount: runtimeResponse.sourceReferences.length
      }
    }
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "response.saved",
    status: RuntimeTraceStatus.SUCCESS
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "response.returned",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      messageId: avatarMessageId
    }
  })

  revalidatePath(`/dashboard/avatars/${avatar.id}/studio?step=preview`)
  revalidatePath("/dashboard/avatars")

  const conversation = await fetchDashboardPreviewConversation(context.workspace.id, avatar.id)
  const responseMessage = videoErrorMessage
    ? `Avatar text response generated. ${audioUrl ? "Audio fallback is available. " : ""}${videoErrorMessage}`
    : audioErrorMessage
      ? `Avatar text response generated. ${audioErrorMessage}`
      : runtimeResponse.status === "error"
        ? "The runtime service returned an error. Showing a safe fallback answer."
        : outputMode === "video"
          ? "Avatar text, audio, and video response generated."
          : outputMode === "audio"
            ? "Avatar text and audio response generated."
            : "Avatar response generated."

  return {
    status: runtimeResponse.status === "error" ? "error" : "success",
    message: responseMessage,
    conversation
  }
}

export async function sendAvatarPreviewVoiceMessageAction(
  _state: AvatarPreviewActionState,
  formData: FormData
): Promise<AvatarPreviewActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/avatars" })
  if (!context) {
    return previewValidationError("Authentication is required.")
  }

  if (!canSendPreviewMessage(context.workspaceMembership.role)) {
    return previewValidationError("Viewer roles cannot send preview messages.")
  }

  const { avatarId, conversationId, outputMode, audioFile, durationSeconds } = parsePreviewVoiceInput(formData)
  if (!avatarId) {
    return previewValidationError("Missing avatar reference.", { avatarId: "Missing avatar reference." })
  }

  if (!audioFile) {
    return previewValidationError("Record a voice question before sending.", {
      audioFile: "No recording was received."
    })
  }

  const audioValidation = validateAvatarVoiceInputFile(audioFile, durationSeconds)
  if (!audioValidation.ok || !audioValidation.mimeType) {
    const message = audioValidation.validationIssues[0] ?? "Recording is not accepted."
    return previewValidationError(message, { audioFile: message })
  }

  let rawAudioBytes: Buffer
  try {
    rawAudioBytes = Buffer.from(await audioFile.arrayBuffer())
  } catch {
    return previewValidationError("Recording could not be read. Please try again.", {
      audioFile: "Recording could not be read."
    })
  }

  const [avatar, knowledgeSummary, existingConversation] = await Promise.all([
    prisma.avatar.findFirst({
      where: {
        id: avatarId,
        workspaceId: context.workspace.id
      },
      select: {
        id: true,
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
        voice: {
          select: {
            id: true,
            provider: true,
            providerVoiceId: true,
            name: true,
            language: true,
            style: true,
            presentationStyle: true,
            status: true
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
            displayUrl: true,
            mimeType: true,
            width: true,
            height: true
          }
        },
        consentRecords: {
          orderBy: { acceptedAt: "desc" },
          take: 5,
          select: {
            avatarAssetId: true
          }
        }
      }
    }),
    fetchKnowledgeSummaryForWorkspace(context.workspace.id),
    conversationId
      ? prisma.conversation.findFirst({
        where: {
          id: conversationId,
          workspaceId: context.workspace.id,
          avatarId,
          channel: ConversationChannel.DASHBOARD_PREVIEW,
          status: ConversationStatus.ACTIVE
        },
        select: { id: true }
      })
      : Promise.resolve(null)
  ])

  if (!avatar) {
    return previewValidationError("Avatar does not exist in this workspace.")
  }

  if (avatar.status === AvatarStatus.SUSPENDED) {
    return previewValidationError("Suspended avatars cannot be previewed.")
  }

  const currentSourcePhoto = avatar.photoAssets[0] ?? null
  const hasCurrentSourcePhotoConsent = Boolean(
    currentSourcePhoto &&
    avatar.consentRecords.some(record => record.avatarAssetId === currentSourcePhoto.id)
  )

  if (outputMode === "audio" || outputMode === "video") {
    if (!avatar.voice) {
      return previewValidationError(outputMode === "video"
        ? "Select a voice before requesting Text + avatar video preview."
        : "Select a voice before requesting Text + audio preview.", {
        outputMode: "Go to the Voice step and choose an active voice."
      })
    }

    if (avatar.voice.status !== "ACTIVE") {
      return previewValidationError(outputMode === "video"
        ? "The selected voice is inactive. Choose an active voice before video preview."
        : "The selected voice is inactive. Choose an active voice before audio preview.", {
        outputMode: "Choose an active voice in the Voice step."
      })
    }

    if (!isVoiceLanguageCompatible(avatar.language, avatar.voice.language)) {
      return previewValidationError(outputMode === "video"
        ? "The selected voice is not compatible with this avatar language for video preview."
        : "The selected voice is not compatible with this avatar language.", {
        outputMode: "Choose a compatible active voice in the Voice step."
      })
    }
  }

  if (outputMode === "video") {
    if (!currentSourcePhoto) {
      return previewValidationError("Upload an avatar photo before generating video.", {
        outputMode: "Go to the Photo step and upload a valid source photo."
      })
    }

    if (!hasCurrentSourcePhotoConsent) {
      return previewValidationError("Accept avatar identity consent before generating video.", {
        outputMode: "Go to the Consent step and accept consent for the current photo."
      })
    }
  }

  if (
    ![
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
    ].every(Boolean) ||
    knowledgeSummary.readySourceCount <= 0
  ) {
    return previewValidationError(
      "Complete basics, behavior, and at least one READY knowledge source before preview."
    )
  }

  const activeConversation = existingConversation ?? await prisma.conversation.findFirst({
    where: {
      workspaceId: context.workspace.id,
      avatarId,
      channel: ConversationChannel.DASHBOARD_PREVIEW,
      status: ConversationStatus.ACTIVE
    },
    select: { id: true }
  })

  const targetConversation = activeConversation
    ? activeConversation
    : await prisma.conversation.create({
      data: {
        workspaceId: context.workspace.id,
        avatarId,
        channel: ConversationChannel.DASHBOARD_PREVIEW,
        status: ConversationStatus.ACTIVE
      }
    })

  const visitorMessageId = randomUUID()
  const audioAssetId = randomUUID()
  const storageKey = buildAvatarVoiceInputStorageKey({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    messageId: visitorMessageId,
    assetId: audioAssetId,
    fileExtension: audioValidation.fileExtension
  })
  const audioInputUrl = buildAvatarVoiceInputDisplayUrl(audioAssetId)

  try {
    await writeAvatarAssetToDisk({ storageKey, content: rawAudioBytes })
    await prisma.avatarAsset.create({
      data: {
        id: audioAssetId,
        workspaceId: context.workspace.id,
        avatarId,
        type: AvatarAssetType.VOICE_INPUT_AUDIO,
        storageKey,
        displayUrl: audioInputUrl,
        originalFileName: audioFile.name || `voice-input-${visitorMessageId}.${audioValidation.fileExtension}`,
        mimeType: audioValidation.mimeType,
        sizeBytes: rawAudioBytes.byteLength,
        width: 0,
        height: 0,
        validationStatus: AvatarAssetValidationStatus.VALID,
        validationIssues: []
      }
    })
    await createRuntimeTrace({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      eventType: "audio_input.stored",
      status: RuntimeTraceStatus.SUCCESS,
      metadata: {
        assetId: audioAssetId,
        mimeType: audioValidation.mimeType,
        sizeBytes: rawAudioBytes.byteLength,
        durationSeconds: audioValidation.durationSeconds
      }
    })
  } catch {
    await deleteAvatarAssetFromDisk(storageKey).catch(() => undefined)
    await createRuntimeTrace({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      eventType: "audio_input.failed",
      status: RuntimeTraceStatus.FAILURE,
      metadata: {
        reason: "storage_failed"
      }
    })
    return previewValidationError("Voice recording could not be stored. Please try again.", {
      audioFile: "Voice recording could not be stored."
    })
  }

  const existingVisitorMessageCount = await prisma.message.count({
    where: {
      conversationId: targetConversation.id,
      role: MessageRole.VISITOR
    }
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "stt.started",
    status: RuntimeTraceStatus.STARTED,
    metadata: {
      audioInputAssetId: audioAssetId,
      mimeType: audioValidation.mimeType,
      durationSeconds: audioValidation.durationSeconds
    }
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "retrieval.started",
    status: RuntimeTraceStatus.STARTED
  })

  const knowledgeChunks = await fetchReadyKnowledgeChunksForRuntime({
    workspaceId: context.workspace.id
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "retrieval.completed",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      requestedChunkCount: knowledgeChunks.length,
      inputType: "audio"
    }
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "llm.started",
    status: RuntimeTraceStatus.STARTED
  })

  if (outputMode === "video") {
    await createRuntimeTrace({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      eventType: "avatar_video.started",
      status: RuntimeTraceStatus.STARTED,
      metadata: {
        sourcePhotoAssetId: currentSourcePhoto?.id ?? null,
        voiceId: avatar.voice?.id ?? null
      }
    })
  }

  let runtimeResponse: RuntimeResponse
  try {
    runtimeResponse = await sendRuntimeTextMessage({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      messageId: visitorMessageId,
      channel: "DASHBOARD_PREVIEW",
      inputType: "audio",
      inputText: "",
      audioInput: {
        assetId: audioAssetId,
        audioBase64: rawAudioBytes.toString("base64"),
        mimeType: audioValidation.mimeType,
        fileName: audioFile.name || `voice-input.${audioValidation.fileExtension}`,
        sizeBytes: rawAudioBytes.byteLength,
        durationSeconds: audioValidation.durationSeconds
      },
      outputMode,
      visitorMessageCount: existingVisitorMessageCount + 1,
      avatarConfig: {
        avatarId: avatar.id,
        greeting: avatar.greeting,
        tone: avatar.tone,
        answerStyle: avatar.answerStyle,
        businessInstructions: avatar.businessInstructions,
        fallbackMessage: avatar.fallbackMessage,
        leadCapturePreference: avatar.leadCapturePreference,
        handoffPreference: avatar.handoffPreference,
        language: avatar.language
      },
      selectedVoiceMetadata: avatar.voice ? {
        id: avatar.voice.id,
        provider: avatar.voice.provider,
        providerVoiceId: avatar.voice.providerVoiceId,
        name: avatar.voice.name,
        language: avatar.voice.language,
        style: avatar.voice.style,
        presentationStyle: avatar.voice.presentationStyle,
        status: avatar.voice.status
      } : null,
      avatarPhotoReference: currentSourcePhoto ? {
        assetId: currentSourcePhoto.id,
        url: currentSourcePhoto.displayUrl,
        mimeType: currentSourcePhoto.mimeType,
        width: currentSourcePhoto.width,
        height: currentSourcePhoto.height
      } : null,
      knowledgeChunks,
      visitorLanguage: avatar.language
    })
  } catch {
    runtimeResponse = {
      conversationId: targetConversation.id,
      messageId: visitorMessageId,
      status: "error",
      answer: "Runtime request failed. Please try again.",
      leadCaptureDecision: "none",
      leadCapture: {
        required: false,
        reason: null,
        fields: [],
        promptText: null
      },
      handoffDecision: "request",
      usage: {
        provider: "unknown"
      },
      sourceReferences: []
    }
  }

  const transcript = runtimeResponse.transcription?.text?.trim() ?? ""
  if (!transcript) {
    await createRuntimeTrace({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      eventType: "stt.failed",
      status: RuntimeTraceStatus.FAILURE,
      metadata: {
        audioInputAssetId: audioAssetId,
        reason: runtimeResponse.answer || runtimeResponse.usage.reason || "transcription_failed",
        provider: runtimeResponse.transcription?.provider ?? runtimeResponse.usage.provider ?? null
      }
    })
    const conversation = await fetchDashboardPreviewConversation(context.workspace.id, avatar.id)
    return previewValidationError("Voice transcription failed. Text input is still available.", {
      audioFile: runtimeResponse.answer || "Voice transcription failed."
    }, conversation ?? undefined)
  }

  if (transcript.length < PREVIEW_MESSAGE_MIN_LENGTH) {
    await createRuntimeTrace({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      eventType: "stt.failed",
      status: RuntimeTraceStatus.FAILURE,
      metadata: {
        audioInputAssetId: audioAssetId,
        reason: "transcript_too_short"
      }
    })
    return previewValidationError("Voice transcription was too short. Please try again or type your question.", {
      audioFile: "Transcript was too short."
    })
  }

  if (!isTextLengthSafe(transcript, PREVIEW_MESSAGE_MAX_LENGTH)) {
    await createRuntimeTrace({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      eventType: "stt.failed",
      status: RuntimeTraceStatus.FAILURE,
      metadata: {
        audioInputAssetId: audioAssetId,
        reason: "transcript_too_long"
      }
    })
    return previewValidationError(`Transcript must be ${PREVIEW_MESSAGE_MAX_LENGTH} characters or fewer.`, {
      audioFile: `Transcript must be ${PREVIEW_MESSAGE_MAX_LENGTH} characters or fewer.`
    })
  }

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "stt.completed",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      audioInputAssetId: audioAssetId,
      language: runtimeResponse.transcription?.language ?? null,
      confidence: runtimeResponse.transcription?.confidence ?? null,
      durationSeconds: runtimeResponse.transcription?.durationSeconds ?? audioValidation.durationSeconds,
      provider: runtimeResponse.transcription?.provider ?? null
    }
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "message.received",
    status: RuntimeTraceStatus.STARTED
  })

  await prisma.message.create({
    data: {
      conversationId: targetConversation.id,
      id: visitorMessageId,
      role: MessageRole.VISITOR,
      content: transcript,
      audioUrl: audioInputUrl,
      metadata: {
        inputType: "audio",
        audioInputAssetId: audioAssetId,
        audioMimeType: audioValidation.mimeType,
        audioSizeBytes: rawAudioBytes.byteLength,
        audioDurationSeconds: audioValidation.durationSeconds,
        sttLanguage: runtimeResponse.transcription?.language ?? null,
        sttConfidence: runtimeResponse.transcription?.confidence ?? null,
        sttDurationSeconds: runtimeResponse.transcription?.durationSeconds ?? audioValidation.durationSeconds,
        sttUsage: runtimeResponse.transcription?.usage ?? null,
        sttProvider: runtimeResponse.transcription?.provider ?? null
      }
    }
  })

  await prisma.conversation.update({
    where: { id: targetConversation.id },
    data: { updatedAt: new Date() }
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "message.received",
    status: RuntimeTraceStatus.SUCCESS
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "llm.completed",
    status: runtimeResponse.status === "error" ? RuntimeTraceStatus.FAILURE : RuntimeTraceStatus.SUCCESS,
    metadata: {
      provider: runtimeResponse.usage.provider,
      status: runtimeResponse.status
    }
  })

  if (runtimeResponse.status === "error") {
    await createRuntimeTrace({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      eventType: "runtime.failed",
      status: RuntimeTraceStatus.FAILURE,
      metadata: {
        status: runtimeResponse.status,
        provider: runtimeResponse.usage.provider,
        reason: runtimeResponse.safetyReason ?? runtimeResponse.usage.reason
      }
    })
  }

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "safety.checked",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      handoffDecision: runtimeResponse.handoffDecision,
      leadCaptureDecision: runtimeResponse.leadCaptureDecision
    }
  })

  const avatarMessageId = randomUUID()
  let audioUrl: string | null = null
  let audioErrorMessage: string | null = runtimeResponse.audioError?.message ?? null
  let audioUsage: Record<string, unknown> | null = runtimeResponse.audio?.usage ?? null
  let videoUrl: string | null = null
  let videoErrorMessage: string | null = runtimeResponse.videoError?.message ?? null
  let videoUsage: Record<string, unknown> | null = runtimeResponse.video?.usage ?? null
  let videoDurationSeconds: number | null = typeof runtimeResponse.video?.durationSeconds === "number"
    ? runtimeResponse.video.durationSeconds
    : null
  let videoProviderJobId: string | null = runtimeResponse.video?.providerJobId ?? null

  if (outputMode === "audio" || outputMode === "video") {
    await createRuntimeTrace({
      workspaceId: context.workspace.id,
      avatarId,
      conversationId: targetConversation.id,
      eventType: "tts.started",
      status: RuntimeTraceStatus.STARTED,
      metadata: {
        voiceId: avatar.voice?.id ?? null
      }
    })

    if (runtimeResponse.audio) {
      await createRuntimeTrace({
        workspaceId: context.workspace.id,
        avatarId,
        conversationId: targetConversation.id,
        eventType: "tts.completed",
        status: RuntimeTraceStatus.SUCCESS,
        metadata: {
          provider: runtimeResponse.audio.provider,
          mimeType: runtimeResponse.audio.mimeType,
          characters: runtimeResponse.audio.usage.characters ?? runtimeResponse.answer.length
        }
      })

      const outputAudioAssetId = randomUUID()
      const fileExtension = runtimeResponse.audio.fileExtension || "bin"
      const outputAudioStorageKey = buildAvatarAudioStorageKey({
        workspaceId: context.workspace.id,
        avatarId,
        conversationId: targetConversation.id,
        messageId: avatarMessageId,
        assetId: outputAudioAssetId,
        fileExtension
      })

      try {
        const audioBytes = Buffer.from(runtimeResponse.audio.audioBase64, "base64")
        await writeAvatarAssetToDisk({ storageKey: outputAudioStorageKey, content: audioBytes })
        audioUrl = buildAvatarAudioDisplayUrl(outputAudioAssetId)
        await prisma.avatarAsset.create({
          data: {
            id: outputAudioAssetId,
            workspaceId: context.workspace.id,
            avatarId,
            type: AvatarAssetType.GENERATED_SPEECH_AUDIO,
            storageKey: outputAudioStorageKey,
            displayUrl: audioUrl,
            originalFileName: `avatar-response-${avatarMessageId}.${fileExtension}`,
            mimeType: runtimeResponse.audio.mimeType,
            sizeBytes: audioBytes.byteLength,
            width: 0,
            height: 0,
            validationStatus: AvatarAssetValidationStatus.VALID,
            validationIssues: []
          }
        })
        await createRuntimeTrace({
          workspaceId: context.workspace.id,
          avatarId,
          conversationId: targetConversation.id,
          eventType: "audio.stored",
          status: RuntimeTraceStatus.SUCCESS,
          metadata: {
            assetId: outputAudioAssetId,
            mimeType: runtimeResponse.audio.mimeType,
            sizeBytes: audioBytes.byteLength
          }
        })
      } catch {
        audioErrorMessage = "Audio was generated but could not be stored."
        audioUrl = null
        await deleteAvatarAssetFromDisk(outputAudioStorageKey).catch(() => undefined)
        await createRuntimeTrace({
          workspaceId: context.workspace.id,
          avatarId,
          conversationId: targetConversation.id,
          eventType: "audio.failed",
          status: RuntimeTraceStatus.FAILURE,
          metadata: {
            reason: "storage_failed"
          }
        })
      }
    } else {
      await createRuntimeTrace({
        workspaceId: context.workspace.id,
        avatarId,
        conversationId: targetConversation.id,
        eventType: "tts.failed",
        status: RuntimeTraceStatus.FAILURE,
        metadata: {
          reason: runtimeResponse.audioError?.code ?? "missing_audio",
          message: runtimeResponse.audioError?.message ?? "TTS provider did not return audio.",
          provider: runtimeResponse.audioError?.provider ?? null
        }
      })
    }
  }

  if (outputMode === "video") {
    if (runtimeResponse.video && runtimeResponse.video.status === "completed") {
      await createRuntimeTrace({
        workspaceId: context.workspace.id,
        avatarId,
        conversationId: targetConversation.id,
        eventType: "avatar_video.completed",
        status: RuntimeTraceStatus.SUCCESS,
        metadata: {
          provider: runtimeResponse.video.provider,
          providerJobId: runtimeResponse.video.providerJobId ?? null,
          durationSeconds: runtimeResponse.video.durationSeconds ?? null
        }
      })

      if (runtimeResponse.video.videoBase64) {
        const videoAssetId = randomUUID()
        const videoMimeType = runtimeResponse.video.mimeType || "video/mp4"
        const fileExtension = runtimeResponse.video.fileExtension ||
          (videoMimeType.includes("webm") ? "webm" : videoMimeType.includes("quicktime") ? "mov" : "mp4")
        const videoStorageKey = buildAvatarVideoStorageKey({
          workspaceId: context.workspace.id,
          avatarId,
          conversationId: targetConversation.id,
          messageId: avatarMessageId,
          assetId: videoAssetId,
          fileExtension
        })

        try {
          const videoBytes = Buffer.from(runtimeResponse.video.videoBase64, "base64")
          await writeAvatarAssetToDisk({ storageKey: videoStorageKey, content: videoBytes })
          videoUrl = buildAvatarVideoDisplayUrl(videoAssetId)
          await prisma.avatarAsset.create({
            data: {
              id: videoAssetId,
              workspaceId: context.workspace.id,
              avatarId,
              type: AvatarAssetType.GENERATED_AVATAR_VIDEO,
              storageKey: videoStorageKey,
              displayUrl: videoUrl,
              originalFileName: `avatar-response-${avatarMessageId}.${fileExtension}`,
              mimeType: videoMimeType,
              sizeBytes: videoBytes.byteLength,
              width: 0,
              height: 0,
              validationStatus: AvatarAssetValidationStatus.VALID,
              validationIssues: []
            }
          })
          await createRuntimeTrace({
            workspaceId: context.workspace.id,
            avatarId,
            conversationId: targetConversation.id,
            eventType: "video.stored",
            status: RuntimeTraceStatus.SUCCESS,
            metadata: {
              assetId: videoAssetId,
              mimeType: videoMimeType,
              sizeBytes: videoBytes.byteLength,
              storage: "avatar_asset"
            }
          })
        } catch {
          videoErrorMessage = "Video was generated but could not be stored."
          videoUrl = null
          await deleteAvatarAssetFromDisk(videoStorageKey).catch(() => undefined)
          await createRuntimeTrace({
            workspaceId: context.workspace.id,
            avatarId,
            conversationId: targetConversation.id,
            eventType: "video.failed",
            status: RuntimeTraceStatus.FAILURE,
            metadata: {
              reason: "storage_failed"
            }
          })
        }
      } else if (runtimeResponse.video.videoUrl) {
        videoUrl = runtimeResponse.video.videoUrl
        await createRuntimeTrace({
          workspaceId: context.workspace.id,
          avatarId,
          conversationId: targetConversation.id,
          eventType: "video.stored",
          status: RuntimeTraceStatus.SUCCESS,
          metadata: {
            provider: runtimeResponse.video.provider,
            providerJobId: runtimeResponse.video.providerJobId ?? null,
            storage: "provider_hosted_reference"
          }
        })
      } else {
        videoErrorMessage = "Video generation completed without a playable video URL."
      }
    } else {
      videoErrorMessage = runtimeResponse.videoError?.message ??
        (runtimeResponse.video?.status === "processing"
          ? "Video generation is still processing. Phase 10 preview does not include polling for this provider yet."
          : "Avatar video provider did not return a completed video.")
      await createRuntimeTrace({
        workspaceId: context.workspace.id,
        avatarId,
        conversationId: targetConversation.id,
        eventType: "avatar_video.failed",
        status: RuntimeTraceStatus.FAILURE,
        metadata: {
          reason: runtimeResponse.videoError?.code ?? runtimeResponse.video?.status ?? "missing_video",
          message: videoErrorMessage,
          provider: runtimeResponse.videoError?.provider ?? runtimeResponse.video?.provider ?? null,
          providerJobId: runtimeResponse.video?.providerJobId ?? null
        }
      })
    }
  }

  await prisma.message.create({
    data: {
      id: avatarMessageId,
      conversationId: targetConversation.id,
      role: MessageRole.AVATAR,
      content: runtimeResponse.answer || "",
      audioUrl,
      videoUrl,
      metadata: {
        runtimeStatus: runtimeResponse.status,
        usage: runtimeResponse.usage,
        outputMode,
        audioStatus: outputMode === "audio" || outputMode === "video"
          ? audioUrl
            ? "generated"
            : "failed"
          : "none",
        audioError: audioErrorMessage,
        ttsUsage: audioUsage,
        videoStatus: outputMode === "video"
          ? videoUrl
            ? "generated"
            : "failed"
          : "none",
        videoError: videoErrorMessage,
        videoUsage,
        videoDurationSeconds,
        videoProviderJobId,
        intent: runtimeResponse.intent ?? null,
        confidence: runtimeResponse.confidence ?? null,
        handoffDecision: runtimeResponse.handoffDecision,
        leadCaptureDecision: runtimeResponse.leadCaptureDecision,
        leadCapture: runtimeResponse.leadCapture,
        safetyReason: runtimeResponse.safetyReason ?? null,
        sourceReferenceCount: runtimeResponse.sourceReferences.length
      }
    }
  })

  await prisma.conversation.update({
    where: { id: targetConversation.id },
    data: { updatedAt: new Date() }
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "response.saved",
    status: RuntimeTraceStatus.SUCCESS
  })

  await createRuntimeTrace({
    workspaceId: context.workspace.id,
    avatarId,
    conversationId: targetConversation.id,
    eventType: "response.returned",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      messageId: avatarMessageId
    }
  })

  revalidatePath(`/dashboard/avatars/${avatar.id}/studio?step=preview`)
  revalidatePath("/dashboard/avatars")

  const conversation = await fetchDashboardPreviewConversation(context.workspace.id, avatar.id)
  const responseMessage = videoErrorMessage
    ? `Voice question transcribed. ${audioUrl ? "Audio fallback is available. " : ""}${videoErrorMessage}`
    : audioErrorMessage
      ? `Voice question transcribed. ${audioErrorMessage}`
      : runtimeResponse.status === "error"
        ? "Voice question transcribed, but the runtime returned a safe fallback error."
        : outputMode === "video"
          ? "Voice question transcribed, and avatar text, audio, and video response generated."
          : outputMode === "audio"
            ? "Voice question transcribed, and avatar text and audio response generated."
            : "Voice question transcribed, and avatar response generated."

  return {
    status: runtimeResponse.status === "error" ? "error" : "success",
    message: responseMessage,
    conversation
  }
}
