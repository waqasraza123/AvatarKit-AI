"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { AvatarStatus, RuntimeTraceStatus, SafetyEventType } from "@prisma/client"
import { canManageOperations } from "@/lib/operations"
import { prisma } from "@/lib/prisma"
import { suspendAvatarForSafety } from "@/lib/safety"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

type OperationsActionError =
  | "bad_request"
  | "missing_avatar"
  | "permission_denied"

const RESTORABLE_AVATAR_STATUSES = [
  AvatarStatus.DRAFT,
  AvatarStatus.PROCESSING,
  AvatarStatus.READY,
  AvatarStatus.PUBLISHED,
  AvatarStatus.FAILED
] as const

function appendOperationsError(path: string, error: OperationsActionError): string {
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}operationsError=${encodeURIComponent(error)}`
}

function safeReturnPath(rawPath: string | null): string {
  const path = rawPath?.trim() ?? "/dashboard/operations"
  if (!path.startsWith("/") || path.startsWith("//")) {
    return "/dashboard/operations"
  }

  if (!path.startsWith("/dashboard/operations") && !path.startsWith("/dashboard/avatars")) {
    return "/dashboard/operations"
  }

  return path
}

function previousAvatarStatus(metadata: unknown): AvatarStatus {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return AvatarStatus.DRAFT
  }

  const previousStatus = (metadata as Record<string, unknown>).previousStatus
  if (RESTORABLE_AVATAR_STATUSES.includes(previousStatus as AvatarStatus)) {
    return previousStatus as AvatarStatus
  }

  return AvatarStatus.DRAFT
}

export async function suspendAvatarFromOperationsAction(formData: FormData): Promise<void> {
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "/dashboard/operations"))
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/operations" })
  if (!context) {
    redirect("/sign-in")
  }

  if (!canManageOperations(context.workspaceMembership.role)) {
    redirect(appendOperationsError(returnPath, "permission_denied"))
  }

  const avatarId = String(formData.get("avatarId") ?? "").trim()
  if (!avatarId) {
    redirect(appendOperationsError(returnPath, "bad_request"))
  }

  const suspended = await suspendAvatarForSafety({
    workspaceId: context.workspace.id,
    avatarId,
    userId: context.user.id,
    reason: "Manual operations suspension."
  })

  if (!suspended) {
    redirect(appendOperationsError(returnPath, "missing_avatar"))
  }

  await prisma.runtimeTrace.create({
    data: {
      workspaceId: context.workspace.id,
      avatarId,
      eventType: "operations.avatar_suspended",
      status: RuntimeTraceStatus.SUCCESS,
      metadata: {
        userId: context.user.id
      }
    }
  }).catch(() => undefined)

  revalidatePath("/dashboard/operations")
  revalidatePath("/dashboard/avatars")
  revalidatePath(`/dashboard/avatars/${avatarId}/studio`)
  redirect(returnPath)
}

export async function unsuspendAvatarFromOperationsAction(formData: FormData): Promise<void> {
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "/dashboard/operations"))
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/operations" })
  if (!context) {
    redirect("/sign-in")
  }

  if (!canManageOperations(context.workspaceMembership.role)) {
    redirect(appendOperationsError(returnPath, "permission_denied"))
  }

  const avatarId = String(formData.get("avatarId") ?? "").trim()
  if (!avatarId) {
    redirect(appendOperationsError(returnPath, "bad_request"))
  }

  const avatar = await prisma.avatar.findFirst({
    where: {
      id: avatarId,
      workspaceId: context.workspace.id
    },
    select: {
      id: true,
      status: true,
      safetyEvents: {
        where: {
          eventType: SafetyEventType.avatar_suspended
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          metadata: true
        }
      }
    }
  })

  if (!avatar || avatar.status !== AvatarStatus.SUSPENDED) {
    redirect(appendOperationsError(returnPath, "missing_avatar"))
  }

  const restoredStatus = previousAvatarStatus(avatar.safetyEvents[0]?.metadata)
  await prisma.avatar.update({
    where: { id: avatar.id },
    data: { status: restoredStatus }
  })

  await prisma.runtimeTrace.create({
    data: {
      workspaceId: context.workspace.id,
      avatarId: avatar.id,
      eventType: "operations.avatar_unsuspended",
      status: RuntimeTraceStatus.SUCCESS,
      metadata: {
        userId: context.user.id,
        restoredStatus
      }
    }
  }).catch(() => undefined)

  revalidatePath("/dashboard/operations")
  revalidatePath("/dashboard/avatars")
  revalidatePath(`/dashboard/avatars/${avatar.id}/studio`)
  redirect(returnPath)
}
