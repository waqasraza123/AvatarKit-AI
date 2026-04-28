"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import {
  KnowledgeGapReason,
  KnowledgeGapSource,
  KnowledgeGapStatus,
  KnowledgeSourceType,
  KnowledgeStatus,
  MessageRole
} from "@prisma/client"
import {
  KNOWLEDGE_CATEGORY_MAX_LENGTH,
  KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH,
  KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH,
  KNOWLEDGE_TITLE_MAX_LENGTH,
  buildFaqRawText,
  chunkKnowledgeText,
  isKnowledgeTextLengthSafe,
  normalizeKnowledgeInput
} from "@/lib/knowledge"
import {
  canManageKnowledgeGaps,
  recordKnowledgeGap
} from "@/lib/knowledge-gap"
import { prisma } from "@/lib/prisma"
import { recordUsageEvents } from "@/lib/usage"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

type KnowledgeGapActionState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: {
    gapId?: string
    messageId?: string
    targetStatus?: string
    title?: string
    question?: string
    answer?: string
    category?: string
  }
}

const initialErrorState: KnowledgeGapActionState["status"] = "error"

function actionError(message: string, fieldErrors?: KnowledgeGapActionState["fieldErrors"]): KnowledgeGapActionState {
  return {
    status: initialErrorState,
    message,
    fieldErrors
  }
}

function safeReturnPath(value: string | null): string {
  const path = value?.trim() || "/dashboard/knowledge/gaps"
  if (!path.startsWith("/") || path.startsWith("//")) {
    return "/dashboard/knowledge/gaps"
  }

  return path
}

function parseGapStatus(value: string): KnowledgeGapStatus | null {
  if (
    value === KnowledgeGapStatus.NEW ||
    value === KnowledgeGapStatus.IN_REVIEW ||
    value === KnowledgeGapStatus.RESOLVED ||
    value === KnowledgeGapStatus.IGNORED
  ) {
    return value
  }

  return null
}

function hasErrors(errors: NonNullable<KnowledgeGapActionState["fieldErrors"]>): boolean {
  return Object.values(errors).some(Boolean)
}

async function resolveMessageGapInput(workspaceId: string, messageId: string): Promise<{
  avatarId: string
  conversationId: string
  question: string
  suggestedAnswer: string | null
} | null> {
  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      conversation: {
        workspaceId
      }
    },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      conversation: {
        select: {
          id: true,
          avatarId: true,
          messages: {
            where: {
              role: MessageRole.VISITOR
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              content: true,
              createdAt: true
            }
          }
        }
      }
    }
  })

  if (!message) {
    return null
  }

  if (message.role === MessageRole.AVATAR) {
    const previousVisitor = await prisma.message.findFirst({
      where: {
        conversationId: message.conversation.id,
        role: MessageRole.VISITOR,
        createdAt: { lte: message.createdAt }
      },
      orderBy: { createdAt: "desc" },
      select: { content: true }
    })

    return {
      avatarId: message.conversation.avatarId,
      conversationId: message.conversation.id,
      question: previousVisitor?.content || message.content,
      suggestedAnswer: message.content
    }
  }

  return {
    avatarId: message.conversation.avatarId,
    conversationId: message.conversation.id,
    question: message.content,
    suggestedAnswer: null
  }
}

export async function markMessageAsKnowledgeGapAction(formData: FormData): Promise<void> {
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "/dashboard/conversations"))
  const context = await getWorkspaceContextForRequest({ nextPath: returnPath })
  if (!context) {
    redirect("/sign-in")
  }

  if (!canManageKnowledgeGaps(context.workspaceMembership.role)) {
    redirect(`${returnPath}${returnPath.includes("?") ? "&" : "?"}gapError=permission_denied`)
  }

  const messageId = normalizeKnowledgeInput(formData.get("messageId"))
  const note = normalizeKnowledgeInput(formData.get("note"))
  if (!messageId) {
    redirect(`${returnPath}${returnPath.includes("?") ? "&" : "?"}gapError=bad_request`)
  }

  const resolved = await resolveMessageGapInput(context.workspace.id, messageId)
  if (!resolved) {
    redirect(`${returnPath}${returnPath.includes("?") ? "&" : "?"}gapError=missing_message`)
  }

  await recordKnowledgeGap({
    workspaceId: context.workspace.id,
    avatarId: resolved.avatarId,
    conversationId: resolved.conversationId,
    messageId,
    question: resolved.question,
    reason: KnowledgeGapReason.OPERATOR_MARKED_POOR,
    source: KnowledgeGapSource.SYSTEM,
    suggestedAnswer: resolved.suggestedAnswer,
    metadata: {
      operatorNote: note || null,
      markedByUserId: context.user.id
    }
  })

  revalidatePath("/dashboard/knowledge/gaps")
  revalidatePath(returnPath)
  redirect(`${returnPath}${returnPath.includes("?") ? "&" : "?"}gapMarked=1`)
}

export async function updateKnowledgeGapStatusAction(formData: FormData): Promise<void> {
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "/dashboard/knowledge/gaps"))
  const context = await getWorkspaceContextForRequest({ nextPath: returnPath })
  if (!context) {
    redirect("/sign-in")
  }

  if (!canManageKnowledgeGaps(context.workspaceMembership.role)) {
    redirect(`${returnPath}${returnPath.includes("?") ? "&" : "?"}gapError=permission_denied`)
  }

  const gapId = normalizeKnowledgeInput(formData.get("gapId"))
  const targetStatus = parseGapStatus(normalizeKnowledgeInput(formData.get("targetStatus")))
  if (!gapId || !targetStatus) {
    redirect(`${returnPath}${returnPath.includes("?") ? "&" : "?"}gapError=bad_request`)
  }

  const gap = await prisma.knowledgeGap.findFirst({
    where: {
      id: gapId,
      workspaceId: context.workspace.id
    },
    select: { id: true }
  })

  if (!gap) {
    redirect(`${returnPath}${returnPath.includes("?") ? "&" : "?"}gapError=missing_gap`)
  }

  await prisma.knowledgeGap.update({
    where: { id: gap.id },
    data: {
      status: targetStatus,
      resolvedAt: targetStatus === KnowledgeGapStatus.RESOLVED ? new Date() : null,
      resolvedByUserId: targetStatus === KnowledgeGapStatus.RESOLVED ? context.user.id : null
    }
  })

  revalidatePath("/dashboard/knowledge/gaps")
  revalidatePath(`/dashboard/knowledge/gaps/${gap.id}`)
  redirect(returnPath)
}

export async function convertKnowledgeGapToFaqAction(
  _state: KnowledgeGapActionState,
  formData: FormData
): Promise<KnowledgeGapActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/knowledge/gaps" })
  if (!context) {
    return actionError("Authentication is required.")
  }

  if (!canManageKnowledgeGaps(context.workspaceMembership.role)) {
    return actionError("Viewer roles cannot convert knowledge gaps.")
  }

  const gapId = normalizeKnowledgeInput(formData.get("gapId"))
  const title = normalizeKnowledgeInput(formData.get("title"))
  const question = normalizeKnowledgeInput(formData.get("question"))
  const answer = normalizeKnowledgeInput(formData.get("answer"))
  const category = normalizeKnowledgeInput(formData.get("category"))
  const fieldErrors: NonNullable<KnowledgeGapActionState["fieldErrors"]> = {}

  if (!gapId) {
    fieldErrors.gapId = "Missing knowledge gap reference."
  }

  if (!title) {
    fieldErrors.title = "Title is required."
  } else if (!isKnowledgeTextLengthSafe(title, KNOWLEDGE_TITLE_MAX_LENGTH)) {
    fieldErrors.title = `Title must be ${KNOWLEDGE_TITLE_MAX_LENGTH} characters or fewer.`
  }

  if (!question) {
    fieldErrors.question = "Question is required."
  } else if (!isKnowledgeTextLengthSafe(question, KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH)) {
    fieldErrors.question = `Question must be ${KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH} characters or fewer.`
  }

  if (!answer) {
    fieldErrors.answer = "Answer is required before creating an FAQ."
  } else if (!isKnowledgeTextLengthSafe(answer, KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH)) {
    fieldErrors.answer = `Answer must be ${KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH} characters or fewer.`
  }

  if (category && !isKnowledgeTextLengthSafe(category, KNOWLEDGE_CATEGORY_MAX_LENGTH)) {
    fieldErrors.category = `Category must be ${KNOWLEDGE_CATEGORY_MAX_LENGTH} characters or fewer.`
  }

  if (hasErrors(fieldErrors)) {
    return actionError("Please fix the highlighted fields.", fieldErrors)
  }

  const gap = await prisma.knowledgeGap.findFirst({
    where: {
      id: gapId,
      workspaceId: context.workspace.id
    },
    select: {
      id: true,
      status: true
    }
  })

  if (!gap) {
    return actionError("Knowledge gap does not exist in this workspace.", {
      gapId: "Missing or unavailable knowledge gap."
    })
  }

  if (gap.status === KnowledgeGapStatus.RESOLVED || gap.status === KnowledgeGapStatus.IGNORED) {
    return actionError("Only unresolved gaps can be converted to FAQ.")
  }

  const rawText = buildFaqRawText(question, answer)
  const chunks = chunkKnowledgeText({
    rawText,
    sourceType: KnowledgeSourceType.FAQ,
    category
  })

  if (chunks.length === 0) {
    return actionError("FAQ produced no usable chunks.", {
      answer: "Add a complete answer before converting."
    })
  }

  const source = await prisma.$transaction(async tx => {
    const createdSource = await tx.knowledgeSource.create({
      data: {
        workspaceId: context.workspace.id,
        title,
        type: KnowledgeSourceType.FAQ,
        status: KnowledgeStatus.READY,
        rawText,
        metadata: {
          category: category || null,
          question,
          answer,
          createdFromKnowledgeGapId: gap.id
        }
      },
      select: { id: true }
    })

    await tx.knowledgeChunk.createMany({
      data: chunks.map(chunk => ({
        workspaceId: context.workspace.id,
        sourceId: createdSource.id,
        content: chunk.content,
        position: chunk.position,
        metadata: chunk.metadata
      }))
    })

    await tx.knowledgeGap.update({
      where: { id: gap.id },
      data: {
        status: KnowledgeGapStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedByUserId: context.user.id,
        metadata: {
          convertedToKnowledgeSourceId: createdSource.id
        }
      }
    })

    return {
      ...createdSource,
      chunkCount: chunks.length
    }
  })

  await recordUsageEvents([
    {
      workspaceId: context.workspace.id,
      eventType: "knowledge.source.created",
      quantity: 1,
      unit: "count",
      metadata: {
        sourceId: source.id,
        sourceType: KnowledgeSourceType.FAQ,
        createdFromKnowledgeGapId: gap.id
      },
      idempotencyKey: `knowledge-source-created:${source.id}`
    },
    {
      workspaceId: context.workspace.id,
      eventType: "knowledge.chunk.created",
      quantity: source.chunkCount,
      unit: "count",
      metadata: {
        sourceId: source.id,
        sourceType: KnowledgeSourceType.FAQ,
        createdFromKnowledgeGapId: gap.id
      },
      idempotencyKey: `knowledge-chunks-created:${source.id}`
    }
  ])

  revalidatePath("/dashboard/knowledge")
  revalidatePath("/dashboard/knowledge/gaps")
  revalidatePath(`/dashboard/knowledge/gaps/${gap.id}`)
  redirect(`/dashboard/knowledge/${source.id}?saved=created-from-gap`)
}
