"use server"

import { revalidatePath } from "next/cache"
import { AvatarStatus, WorkspaceRole } from "@prisma/client"
import { recordMutationAuditEvent } from "@/lib/audit"
import { parseKioskSettingsInput } from "@/lib/kiosk"
import { prisma } from "@/lib/prisma"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"

export type KioskActionState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: Record<string, string>
}

function actionError(message: string, fieldErrors?: Record<string, string>): KioskActionState {
  return {
    status: "error",
    message,
    fieldErrors
  }
}

function canManageKiosk(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

export async function updateKioskSettingsAction(
  _state: KioskActionState,
  formData: FormData
): Promise<KioskActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/kiosk" })
  if (!context) {
    return actionError("Authentication is required.")
  }

  if (!canManageKiosk(context.workspaceMembership.role)) {
    return actionError("Viewer roles cannot update kiosk settings.")
  }

  const parsed = parseKioskSettingsInput(formData)
  if (Object.keys(parsed.errors).length > 0) {
    return actionError("Please fix the highlighted kiosk settings.", parsed.errors)
  }

  const avatar = await prisma.avatar.findFirst({
    where: {
      id: parsed.avatarId,
      workspaceId: context.workspace.id,
      status: AvatarStatus.PUBLISHED
    },
    select: {
      id: true,
      workspaceId: true
    }
  })

  if (!avatar) {
    return actionError("Kiosk settings can only be updated for published avatars.", {
      avatarId: "Select a published avatar."
    })
  }

  await prisma.kioskSettings.upsert({
    where: { avatarId: avatar.id },
    create: {
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      enabled: parsed.enabled,
      idleGreeting: parsed.idleGreeting,
      inactivityTimeoutSeconds: parsed.inactivityTimeoutSeconds,
      privacyTimeoutSeconds: parsed.privacyTimeoutSeconds,
      allowedLanguage: parsed.allowedLanguage,
      leadCaptureEnabled: parsed.leadCaptureEnabled,
      qrHandoffUrl: parsed.qrHandoffUrl,
      staffCallLabel: parsed.staffCallLabel,
      staffCallUrl: parsed.staffCallUrl
    },
    update: {
      enabled: parsed.enabled,
      idleGreeting: parsed.idleGreeting,
      inactivityTimeoutSeconds: parsed.inactivityTimeoutSeconds,
      privacyTimeoutSeconds: parsed.privacyTimeoutSeconds,
      allowedLanguage: parsed.allowedLanguage,
      leadCaptureEnabled: parsed.leadCaptureEnabled,
      qrHandoffUrl: parsed.qrHandoffUrl,
      staffCallLabel: parsed.staffCallLabel,
      staffCallUrl: parsed.staffCallUrl
    }
  })

  await recordMutationAuditEvent({
    workspaceId: context.workspace.id,
    actorUserId: context.user.id,
    avatarId: avatar.id,
    eventType: parsed.enabled ? "kiosk_settings.enabled_or_updated" : "kiosk_settings.disabled_or_updated",
    metadata: {
      enabled: parsed.enabled,
      inactivityTimeoutSeconds: parsed.inactivityTimeoutSeconds,
      privacyTimeoutSeconds: parsed.privacyTimeoutSeconds,
      leadCaptureEnabled: parsed.leadCaptureEnabled,
      hasQrHandoffUrl: Boolean(parsed.qrHandoffUrl),
      hasStaffCallUrl: Boolean(parsed.staffCallUrl)
    }
  })

  revalidatePath("/dashboard/kiosk")
  return {
    status: "success",
    message: "Kiosk settings saved."
  }
}
