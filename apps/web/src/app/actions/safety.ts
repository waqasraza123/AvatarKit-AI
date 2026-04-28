"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { getWorkspaceContextForRequest } from "@/lib/workspace"
import { prisma } from "@/lib/prisma"
import {
  canReviewSafetyEvents,
  canSuspendAvatarFromSafety,
  parseReviewStatus,
  suspendAvatarForSafety
} from "@/lib/safety"

type SafetyActionError =
  | "bad_request"
  | "missing_event"
  | "missing_avatar"
  | "permission_denied"

function appendSafetyError(path: string, error: SafetyActionError): string {
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}safetyError=${encodeURIComponent(error)}`
}

function safeReturnPath(rawPath: string | null): string {
  const path = rawPath?.trim() ?? "/dashboard/safety"
  if (!path.startsWith("/") || path.startsWith("//")) {
    return "/dashboard/safety"
  }

  if (!path.startsWith("/dashboard/safety") && !path.startsWith("/dashboard/conversations")) {
    return "/dashboard/safety"
  }

  return path
}

export async function updateSafetyEventStatusAction(formData: FormData): Promise<void> {
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "/dashboard/safety"))
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/safety" })
  if (!context) {
    redirect("/sign-in")
  }

  const safetyEventId = String(formData.get("safetyEventId") ?? "").trim()
  const targetStatus = parseReviewStatus(String(formData.get("targetStatus") ?? "").trim())

  if (!safetyEventId || !targetStatus) {
    redirect(appendSafetyError(returnPath, "bad_request"))
  }

  if (!canReviewSafetyEvents(context.workspaceMembership.role)) {
    redirect(appendSafetyError(returnPath, "permission_denied"))
  }

  const safetyEvent = await prisma.safetyEvent.findFirst({
    where: {
      id: safetyEventId,
      workspaceId: context.workspace.id
    },
    select: {
      id: true,
      conversationId: true
    }
  })

  if (!safetyEvent) {
    redirect(appendSafetyError(returnPath, "missing_event"))
  }

  await prisma.safetyEvent.update({
    where: { id: safetyEvent.id },
    data: {
      status: targetStatus,
      reviewedAt: new Date(),
      reviewedByUserId: context.user.id
    }
  })

  revalidatePath("/dashboard/safety")
  if (safetyEvent.conversationId) {
    revalidatePath(`/dashboard/conversations/${safetyEvent.conversationId}`)
  }

  redirect(returnPath)
}

export async function suspendAvatarFromSafetyAction(formData: FormData): Promise<void> {
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "/dashboard/safety"))
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/safety" })
  if (!context) {
    redirect("/sign-in")
  }

  const avatarId = String(formData.get("avatarId") ?? "").trim()
  const reason = String(formData.get("reason") ?? "Manual safety suspension.").trim()
  if (!avatarId) {
    redirect(appendSafetyError(returnPath, "bad_request"))
  }

  if (!canSuspendAvatarFromSafety(context.workspaceMembership.role)) {
    redirect(appendSafetyError(returnPath, "permission_denied"))
  }

  const updated = await suspendAvatarForSafety({
    workspaceId: context.workspace.id,
    avatarId,
    userId: context.user.id,
    reason
  })

  if (!updated) {
    redirect(appendSafetyError(returnPath, "missing_avatar"))
  }

  revalidatePath("/dashboard/safety")
  revalidatePath("/dashboard/avatars")
  revalidatePath(`/dashboard/avatars/${avatarId}/studio`)
  redirect(returnPath)
}
