"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { randomUUID } from "node:crypto"
import {
  AvatarAssetType,
  AvatarAssetValidationStatus,
  AvatarStatus,
  WorkspaceRole
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"
import {
  buildAvatarPhotoDisplayUrl,
  buildAvatarPhotoStorageKey,
  deleteAvatarAssetFromDisk,
  writeAvatarAssetToDisk
} from "@/lib/avatar-asset-storage"
import {
  AVATAR_ANSWER_STYLE_OPTIONS,
  AVATAR_HANDOFF_PREFERENCE_OPTIONS,
  AVATAR_LEAD_CAPTURE_PREFERENCE_OPTIONS,
  AVATAR_TONE_OPTIONS,
  AvatarFieldErrors,
  isAvatarAnswerStyle,
  isAvatarHandoffPreference,
  isAvatarLeadCapturePreference,
  isAvatarTone,
  isTextLengthSafe,
  normalizeAvatarInput
} from "@/lib/avatar"
import {
  getAvatarPhotoFileMetadata,
  validateAvatarPhotoFile
} from "@/lib/avatar-photo-validation"
import {
  AVATAR_CONSENT_TERMS_VERSION,
  hasAvatarConsentFieldErrors,
  parseAvatarConsentInput,
  type AvatarConsentFieldErrors
} from "@/lib/avatar-consent"

const NAME_MAX_LENGTH = 120
const DISPLAY_NAME_MAX_LENGTH = 140
const ROLE_MAX_LENGTH = 140
const USE_CASE_MAX_LENGTH = 220
const LANGUAGE_MAX_LENGTH = 80
const GREETING_MAX_LENGTH = 500
const BUSINESS_INSTRUCTIONS_MAX_LENGTH = 2000
const FALLBACK_MESSAGE_MAX_LENGTH = 500

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

function canWriteAvatars(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

function normalizeField(formData: FormData, key: string): string {
  return normalizeAvatarInput(formData.get(key))
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
