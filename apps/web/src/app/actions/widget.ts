"use server"

import { revalidatePath } from "next/cache"
import { WorkspaceRole } from "@prisma/client"
import { recordMutationAuditEvent } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"
import {
  normalizeAllowedDomainInput,
  parseWidgetSettingsInput,
  widgetDbSettingsInput
} from "@/lib/widget"

type WidgetActionState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: Record<string, string>
}

function actionError(message: string, fieldErrors?: Record<string, string>): WidgetActionState {
  return {
    status: "error",
    message,
    fieldErrors
  }
}

function canManageWidget(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

function normalizeField(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

export async function addAllowedDomainAction(
  _state: WidgetActionState,
  formData: FormData
): Promise<WidgetActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/embed" })
  if (!context) {
    return actionError("Authentication is required.")
  }

  if (!canManageWidget(context.workspaceMembership.role)) {
    return actionError("Viewer roles cannot manage widget domains.")
  }

  const normalized = normalizeAllowedDomainInput(formData.get("domain"))
  if (!normalized.domain) {
    return actionError(normalized.error ?? "Enter a valid domain.", {
      domain: normalized.error ?? "Enter a valid domain."
    })
  }

  const existing = await prisma.allowedDomain.findUnique({
    where: {
      workspaceId_domain: {
        workspaceId: context.workspace.id,
        domain: normalized.domain
      }
    },
    select: { id: true }
  })

  if (existing) {
    return actionError("That domain is already allowed for this workspace.", {
      domain: "Duplicate domain."
    })
  }

  const allowedDomain = await prisma.allowedDomain.create({
    data: {
      workspaceId: context.workspace.id,
      domain: normalized.domain
    },
    select: { id: true }
  })

  await recordMutationAuditEvent({
    workspaceId: context.workspace.id,
    actorUserId: context.user.id,
    eventType: "widget_domain.added",
    metadata: {
      domainId: allowedDomain.id,
      domain: normalized.domain
    }
  })

  revalidatePath("/dashboard/embed")
  return {
    status: "success",
    message: "Allowed domain added."
  }
}

export async function removeAllowedDomainAction(
  _state: WidgetActionState,
  formData: FormData
): Promise<WidgetActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/embed" })
  if (!context) {
    return actionError("Authentication is required.")
  }

  if (!canManageWidget(context.workspaceMembership.role)) {
    return actionError("Viewer roles cannot manage widget domains.")
  }

  const domainId = normalizeField(formData, "domainId")
  if (!domainId) {
    return actionError("Missing domain reference.")
  }

  const deleted = await prisma.allowedDomain.deleteMany({
    where: {
      id: domainId,
      workspaceId: context.workspace.id
    }
  })

  if (deleted.count > 0) {
    await recordMutationAuditEvent({
      workspaceId: context.workspace.id,
      actorUserId: context.user.id,
      eventType: "widget_domain.removed",
      metadata: { domainId }
    })
  }

  revalidatePath("/dashboard/embed")
  return {
    status: "success",
    message: "Allowed domain removed."
  }
}

export async function updateWidgetSettingsAction(
  _state: WidgetActionState,
  formData: FormData
): Promise<WidgetActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/embed" })
  if (!context) {
    return actionError("Authentication is required.")
  }

  if (!canManageWidget(context.workspaceMembership.role)) {
    return actionError("Viewer roles cannot update widget settings.")
  }

  const parsed = parseWidgetSettingsInput(formData)
  if (Object.keys(parsed.errors).length > 0) {
    return actionError("Please fix the highlighted widget settings.", parsed.errors)
  }

  const avatar = await prisma.avatar.findFirst({
    where: {
      id: parsed.avatarId,
      workspaceId: context.workspace.id,
      status: "PUBLISHED"
    },
    select: {
      id: true,
      workspaceId: true
    }
  })

  if (!avatar) {
    return actionError("Widget settings can only be updated for published avatars.", {
      avatarId: "Select a published avatar."
    })
  }

  await prisma.widgetSettings.upsert({
    where: { avatarId: avatar.id },
    create: {
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      ...widgetDbSettingsInput(parsed)
    },
    update: widgetDbSettingsInput(parsed)
  })

  await recordMutationAuditEvent({
    workspaceId: context.workspace.id,
    actorUserId: context.user.id,
    avatarId: avatar.id,
    eventType: "widget_settings.updated",
    metadata: {
      theme: parsed.theme,
      position: parsed.position,
      greetingEnabled: parsed.greetingEnabled,
      primaryColor: parsed.primaryColor
    }
  })

  revalidatePath("/dashboard/embed")
  return {
    status: "success",
    message: "Widget settings saved."
  }
}
