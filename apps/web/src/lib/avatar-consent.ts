import { ConsentType, PermissionBasis } from "@prisma/client"
import { z } from "zod"

export const AVATAR_CONSENT_TERMS_VERSION = "avatar-identity-terms-v1"

export const AVATAR_CONSENT_TYPE_OPTIONS = [
  {
    value: ConsentType.SELF_IMAGE,
    label: "Self image"
  },
  {
    value: ConsentType.AUTHORIZED_STAFF,
    label: "Authorized staff member"
  },
  {
    value: ConsentType.BUSINESS_OWNED_CHARACTER,
    label: "Business-owned character"
  },
  {
    value: ConsentType.LICENSED_SYNTHETIC_AVATAR,
    label: "Licensed synthetic avatar"
  }
] as const

export const AVATAR_PERMISSION_BASIS_OPTIONS = [
  {
    value: PermissionBasis.I_OWN_THIS_IMAGE,
    label: "I own this image."
  },
  {
    value: PermissionBasis.I_HAVE_PERMISSION_FROM_PERSON_SHOWN,
    label: "I have permission from the person shown."
  },
  {
    value: PermissionBasis.BRAND_OWNED_FICTIONAL_OR_SYNTHETIC_CHARACTER,
    label: "This is a brand-owned fictional or synthetic character."
  },
  {
    value: PermissionBasis.PROPERLY_LICENSED_AVATAR_IMAGE,
    label: "This is a properly licensed avatar image."
  }
] as const

export const AVATAR_CONSENT_REQUIRED_STATEMENTS = [
  {
    key: "statementImageRights",
    label: "I own this image or have permission to use it."
  },
  {
    key: "statementNoImpersonation",
    label: "I will not use this avatar to impersonate a public figure, celebrity, politician, or private person without permission."
  },
  {
    key: "statementNoDeception",
    label: "I will not use this avatar for fake endorsements, fraud, deception, or misleading identity claims."
  },
  {
    key: "statementAiTransparency",
    label: "I understand this avatar is AI-generated or AI-assisted when used in future runtime features."
  },
  {
    key: "statementTermsAccepted",
    label: "I accept the AvatarKit AI avatar identity usage terms for this workspace."
  }
] as const

const avatarConsentFormSchema = z.object({
  avatarId: z.string().min(1),
  sourcePhotoAssetId: z.string().min(1),
  consentType: z.enum([
    ConsentType.SELF_IMAGE,
    ConsentType.AUTHORIZED_STAFF,
    ConsentType.BUSINESS_OWNED_CHARACTER,
    ConsentType.LICENSED_SYNTHETIC_AVATAR
  ]),
  permissionBasis: z.enum([
    PermissionBasis.I_OWN_THIS_IMAGE,
    PermissionBasis.I_HAVE_PERMISSION_FROM_PERSON_SHOWN,
    PermissionBasis.BRAND_OWNED_FICTIONAL_OR_SYNTHETIC_CHARACTER,
    PermissionBasis.PROPERLY_LICENSED_AVATAR_IMAGE
  ]),
  statementImageRights: z.literal(true),
  statementNoImpersonation: z.literal(true),
  statementNoDeception: z.literal(true),
  statementAiTransparency: z.literal(true),
  statementTermsAccepted: z.literal(true)
})

export type AvatarConsentStatementKey = (typeof AVATAR_CONSENT_REQUIRED_STATEMENTS)[number]["key"]

export type AvatarConsentRecord = {
  id: string
  avatarAssetId: string
  acceptedByUserId: string
  consentType: ConsentType
  permissionBasis: PermissionBasis
  termsVersion: string
  acceptedAt: Date
  createdAt: Date
  updatedAt: Date
}

export type AvatarConsentFieldErrors = Partial<
  Record<
    | "avatarId"
    | "sourcePhotoAssetId"
    | "consentType"
    | "permissionBasis"
    | AvatarConsentStatementKey,
    string
  >
>

export type AvatarConsentInput = {
  avatarId: string
  sourcePhotoAssetId: string
  consentType: ConsentType | ""
  permissionBasis: PermissionBasis | ""
  statements: Record<AvatarConsentStatementKey, boolean>
}

export type AvatarConsentState = {
  currentConsent: AvatarConsentRecord | null
  isCurrentConsentValid: boolean
  currentSourcePhotoId: string | null
  latestConsentPhotoId: string | null
  latestConsentAcceptedAt: Date | null
}

export function isAvatarConsentType(value: string): value is ConsentType {
  return AVATAR_CONSENT_TYPE_OPTIONS.some(option => option.value === value)
}

export function isAvatarPermissionBasis(value: string): value is PermissionBasis {
  return AVATAR_PERMISSION_BASIS_OPTIONS.some(option => option.value === value)
}

export function normalizeConsentInput(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim()
}

export function parseAvatarConsentInput(formData: FormData): {
  data: AvatarConsentInput
  fieldErrors: AvatarConsentFieldErrors
} {
  const avatarId = normalizeConsentInput(formData.get("avatarId"))
  const sourcePhotoAssetId = normalizeConsentInput(formData.get("sourcePhotoAssetId"))
  const consentTypeValue = normalizeConsentInput(formData.get("consentType"))
  const permissionBasisValue = normalizeConsentInput(formData.get("permissionBasis"))
  const fieldErrors: AvatarConsentFieldErrors = {}

  const consentType = isAvatarConsentType(consentTypeValue) ? consentTypeValue : ""
  const permissionBasis = isAvatarPermissionBasis(permissionBasisValue) ? permissionBasisValue : ""

  const statements = AVATAR_CONSENT_REQUIRED_STATEMENTS.reduce(
    (result, statement) => {
      const accepted = formData.get(statement.key) === "on"
      result[statement.key] = accepted

      return result
    },
    {} as Record<AvatarConsentStatementKey, boolean>
  )

  const schemaResult = avatarConsentFormSchema.safeParse({
    avatarId,
    sourcePhotoAssetId,
    consentType: consentTypeValue,
    permissionBasis: permissionBasisValue,
    ...statements
  })

  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      const field = issue.path[0]
      if (field === "avatarId") {
        fieldErrors.avatarId = "Missing avatar reference."
      }
      if (field === "sourcePhotoAssetId") {
        fieldErrors.sourcePhotoAssetId = "Upload a valid source photo before accepting consent."
      }
      if (field === "consentType") {
        fieldErrors.consentType = "Select the consent type."
      }
      if (field === "permissionBasis") {
        fieldErrors.permissionBasis = "Select the permission basis."
      }
      if (
        field === "statementImageRights" ||
        field === "statementNoImpersonation" ||
        field === "statementNoDeception" ||
        field === "statementAiTransparency" ||
        field === "statementTermsAccepted"
      ) {
        fieldErrors[field] = "Required."
      }
    }
  }

  return {
    data: {
      avatarId,
      sourcePhotoAssetId,
      consentType,
      permissionBasis,
      statements
    },
    fieldErrors
  }
}

export function hasAvatarConsentFieldErrors(errors: AvatarConsentFieldErrors): boolean {
  return Object.values(errors).some(Boolean)
}

export function getAvatarConsentState({
  currentSourcePhotoId,
  consentRecords
}: {
  currentSourcePhotoId: string | null
  consentRecords: AvatarConsentRecord[]
}): AvatarConsentState {
  const latestConsent = consentRecords[0] ?? null
  const currentConsent = currentSourcePhotoId
    ? consentRecords.find(record => record.avatarAssetId === currentSourcePhotoId) ?? null
    : null

  return {
    currentConsent,
    isCurrentConsentValid: Boolean(currentSourcePhotoId && currentConsent),
    currentSourcePhotoId,
    latestConsentPhotoId: latestConsent?.avatarAssetId ?? null,
    latestConsentAcceptedAt: latestConsent?.acceptedAt ?? null
  }
}
