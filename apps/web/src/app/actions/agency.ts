"use server"

import { revalidatePath } from "next/cache"
import { AvatarStatus, BillingPlan, WorkspaceRole } from "@prisma/client"
import {
  allocateAvatarName,
  canManageAgencyWorkspace,
  canUseWhiteLabelPlan,
  parseAgencyBrandingInput,
  parseAgencyClientProfileInput,
  parseAgencyDuplicateInput
} from "@/lib/agency"
import { prisma } from "@/lib/prisma"
import { getWorkspaceContextForRequest, hasWorkspaceRole, type DashboardContext } from "@/lib/workspace"

export type AgencyActionState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: Record<string, string>
}

function actionError(message: string, fieldErrors?: Record<string, string>): AgencyActionState {
  return {
    status: "error",
    message,
    fieldErrors
  }
}

function membershipRole(context: DashboardContext, workspaceId: string): WorkspaceRole | null {
  return context.workspaceMemberships.find(member => member.workspace.id === workspaceId)?.role ?? null
}

export async function updateAgencyBrandingAction(
  _state: AgencyActionState,
  formData: FormData
): Promise<AgencyActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/agency" })
  if (!context) {
    return actionError("Authentication is required.")
  }

  if (!canManageAgencyWorkspace(context.workspaceMembership.role)) {
    return actionError("Viewer roles cannot update white-label settings.")
  }

  const billingAccount = await prisma.billingAccount.findUnique({
    where: { workspaceId: context.workspace.id },
    select: { plan: true }
  })
  const plan = billingAccount?.plan ?? BillingPlan.FREE
  const parsed = parseAgencyBrandingInput(formData, canUseWhiteLabelPlan(plan))
  if (Object.keys(parsed.errors).length > 0) {
    return actionError("Please fix the highlighted branding settings.", parsed.errors)
  }

  await prisma.workspaceBranding.upsert({
    where: { workspaceId: context.workspace.id },
    create: {
      workspaceId: context.workspace.id,
      brandName: parsed.brandName,
      customLogoUrl: parsed.customLogoUrl,
      widgetAccentColor: parsed.widgetAccentColor,
      hideAvatarKitBranding: parsed.hideAvatarKitBranding
    },
    update: {
      brandName: parsed.brandName,
      customLogoUrl: parsed.customLogoUrl,
      widgetAccentColor: parsed.widgetAccentColor,
      hideAvatarKitBranding: parsed.hideAvatarKitBranding
    }
  })

  revalidatePath("/dashboard/agency")
  revalidatePath("/dashboard/embed")
  return {
    status: "success",
    message: "White-label settings saved."
  }
}

export async function updateAgencyClientProfileAction(
  _state: AgencyActionState,
  formData: FormData
): Promise<AgencyActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/agency" })
  if (!context) {
    return actionError("Authentication is required.")
  }

  if (!canManageAgencyWorkspace(context.workspaceMembership.role)) {
    return actionError("Viewer roles cannot update client handoff details.")
  }

  const parsed = parseAgencyClientProfileInput(formData)
  if (Object.keys(parsed.errors).length > 0) {
    return actionError("Please fix the highlighted client handoff details.", parsed.errors)
  }

  await prisma.workspaceClientProfile.upsert({
    where: { workspaceId: context.workspace.id },
    create: {
      workspaceId: context.workspace.id,
      clientName: parsed.clientName,
      clientContactName: parsed.clientContactName,
      clientContactEmail: parsed.clientContactEmail,
      handoffNotes: parsed.handoffNotes,
      checklist: parsed.checklist
    },
    update: {
      clientName: parsed.clientName,
      clientContactName: parsed.clientContactName,
      clientContactEmail: parsed.clientContactEmail,
      handoffNotes: parsed.handoffNotes,
      checklist: parsed.checklist
    }
  })

  revalidatePath("/dashboard/agency")
  return {
    status: "success",
    message: "Client handoff profile saved."
  }
}

export async function duplicateAvatarForAgencyAction(
  _state: AgencyActionState,
  formData: FormData
): Promise<AgencyActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/agency" })
  if (!context) {
    return actionError("Authentication is required.")
  }

  const parsed = parseAgencyDuplicateInput(formData)
  if (Object.keys(parsed.errors).length > 0) {
    return actionError("Please fix the highlighted duplication fields.", parsed.errors)
  }

  const sourceRole = membershipRole(context, parsed.sourceWorkspaceId)
  const targetRole = membershipRole(context, parsed.targetWorkspaceId)

  if (!sourceRole) {
    return actionError("You are not a member of the source workspace.", {
      sourceWorkspaceId: "Select one of your workspaces."
    })
  }

  if (!targetRole || !hasWorkspaceRole(targetRole, WorkspaceRole.OPERATOR)) {
    return actionError("You need Operator access or higher in the target workspace.", {
      targetWorkspaceId: "Select a workspace where you can create avatars."
    })
  }

  const sourceAvatar = await prisma.avatar.findFirst({
    where: {
      id: parsed.sourceAvatarId,
      workspaceId: parsed.sourceWorkspaceId
    },
    select: {
      voiceId: true,
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
      engine: true
    }
  })

  if (!sourceAvatar) {
    return actionError("Source avatar was not found in the selected workspace.", {
      sourceAvatarId: "Select a valid source avatar."
    })
  }

  const allocatedName = await allocateAvatarName(parsed.targetWorkspaceId, parsed.newName)
  const duplicated = await prisma.avatar.create({
    data: {
      workspaceId: parsed.targetWorkspaceId,
      voiceId: parsed.copyVoice ? sourceAvatar.voiceId : null,
      name: allocatedName,
      displayName: parsed.newDisplayName,
      role: sourceAvatar.role,
      useCase: sourceAvatar.useCase,
      language: sourceAvatar.language,
      greeting: parsed.copyBehavior ? sourceAvatar.greeting : `Hi, I am ${parsed.newDisplayName}. How can I help?`,
      tone: sourceAvatar.tone,
      answerStyle: sourceAvatar.answerStyle,
      businessInstructions: parsed.copyBehavior ? sourceAvatar.businessInstructions : "Use the approved workspace knowledge and answer conservatively.",
      fallbackMessage: parsed.copyBehavior ? sourceAvatar.fallbackMessage : "I do not have enough approved information to answer that yet.",
      leadCapturePreference: sourceAvatar.leadCapturePreference,
      handoffPreference: sourceAvatar.handoffPreference,
      status: AvatarStatus.DRAFT,
      engine: sourceAvatar.engine
    },
    select: { id: true }
  })

  revalidatePath("/dashboard/agency")
  revalidatePath("/dashboard/avatars")
  return {
    status: "success",
    message: `Avatar duplicated as a draft. New avatar id: ${duplicated.id}`
  }
}
