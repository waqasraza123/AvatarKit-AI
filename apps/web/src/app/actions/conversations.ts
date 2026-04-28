"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { ConversationStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  canManageConversation,
  isConversationStatusTransitionAllowed
} from "@/lib/conversation"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

type ConversationStatusActionError = "bad_request" | "missing_conversation" | "permission_denied" | "transition_not_allowed"

type ParsedConversationStatusAction = {
  conversationId: string
  targetStatus: ConversationStatus | null
  returnPath: string
}

function appendStatusError(path: string, error: ConversationStatusActionError): string {
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}statusError=${encodeURIComponent(error)}`
}

function safeReturnPath(rawPath: string | null): string {
  const path = rawPath?.trim() ?? "/dashboard/conversations"
  if (!path.startsWith("/")) {
    return "/dashboard/conversations"
  }

  if (path.startsWith("//")) {
    return "/dashboard/conversations"
  }

  return path
}

function parseAction(formData: FormData): ParsedConversationStatusAction {
  const conversationId = String(formData.get("conversationId") ?? "").trim()
  const targetStatusRaw = String(formData.get("targetStatus") ?? "").trim()
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "/dashboard/conversations"))

  const targetStatus =
    targetStatusRaw === ConversationStatus.ACTIVE ||
    targetStatusRaw === ConversationStatus.ENDED ||
    targetStatusRaw === ConversationStatus.HANDOFF_REQUESTED ||
    targetStatusRaw === ConversationStatus.FAILED
      ? targetStatusRaw
      : null

  return {
    conversationId,
    targetStatus,
    returnPath
  }
}

function buildEndedAt(currentStatus: ConversationStatus, targetStatus: ConversationStatus): Date | null {
  if (targetStatus === ConversationStatus.ACTIVE) {
    return null
  }

  if (currentStatus === ConversationStatus.ACTIVE && targetStatus === ConversationStatus.ENDED) {
    return new Date()
  }

  if (currentStatus === ConversationStatus.ACTIVE && targetStatus === ConversationStatus.FAILED) {
    return new Date()
  }

  if (currentStatus === ConversationStatus.HANDOFF_REQUESTED && targetStatus === ConversationStatus.FAILED) {
    return new Date()
  }

  if (currentStatus === ConversationStatus.HANDOFF_REQUESTED && targetStatus === ConversationStatus.ENDED) {
    return new Date()
  }

  return null
}

export async function markConversationStatusAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/conversations" })
  if (!context) {
    redirect("/sign-in")
  }

  const { conversationId, targetStatus, returnPath } = parseAction(formData)
  if (!conversationId) {
    redirect(appendStatusError(returnPath, "bad_request"))
  }

  if (!targetStatus) {
    redirect(appendStatusError(returnPath, "bad_request"))
  }

  if (!canManageConversation(context.workspaceMembership.role)) {
    redirect(appendStatusError(returnPath, "permission_denied"))
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: context.workspace.id
    },
    select: {
      id: true,
      status: true
    }
  })

  if (!conversation) {
    redirect(appendStatusError(returnPath, "missing_conversation"))
  }

  if (!isConversationStatusTransitionAllowed(conversation.status, targetStatus)) {
    redirect(appendStatusError(returnPath, "transition_not_allowed"))
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: targetStatus,
      endedAt: buildEndedAt(conversation.status, targetStatus)
    }
  })

  revalidatePath("/dashboard/conversations")
  revalidatePath(`/dashboard/conversations/${conversation.id}`)
  redirect(returnPath)
}
