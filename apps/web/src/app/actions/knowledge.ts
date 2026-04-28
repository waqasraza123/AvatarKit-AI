"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { KnowledgeSourceType, KnowledgeStatus } from "@prisma/client"
import {
  KNOWLEDGE_CATEGORY_MAX_LENGTH,
  KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH,
  KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH,
  KNOWLEDGE_TEXT_CONTENT_MAX_LENGTH,
  KNOWLEDGE_TITLE_MAX_LENGTH,
  KnowledgeFieldErrors,
  buildFaqRawText,
  canManageKnowledge,
  chunkKnowledgeText,
  isKnowledgeTextLengthSafe,
  normalizeKnowledgeInput
} from "@/lib/knowledge"
import { prisma } from "@/lib/prisma"
import { recordUsageEvents } from "@/lib/usage"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

type KnowledgeActionState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: KnowledgeFieldErrors
}

type KnowledgeSourceInput = {
  sourceId: string
  title: string
  sourceType: string
  question: string
  answer: string
  content: string
  category: string
}

function knowledgeValidationError(
  message: string,
  fieldErrors?: KnowledgeFieldErrors
): KnowledgeActionState {
  return {
    status: "error",
    message,
    fieldErrors
  }
}

function hasKnowledgeFieldErrors(errors: KnowledgeFieldErrors): boolean {
  return Object.values(errors).some(Boolean)
}

function parseKnowledgeForm(formData: FormData): KnowledgeSourceInput {
  return {
    sourceId: normalizeKnowledgeInput(formData.get("sourceId")),
    title: normalizeKnowledgeInput(formData.get("title")),
    sourceType: normalizeKnowledgeInput(formData.get("sourceType")),
    question: normalizeKnowledgeInput(formData.get("question")),
    answer: normalizeKnowledgeInput(formData.get("answer")),
    content: normalizeKnowledgeInput(formData.get("content")),
    category: normalizeKnowledgeInput(formData.get("category"))
  }
}

function validateSharedFields(data: KnowledgeSourceInput): KnowledgeFieldErrors {
  const fieldErrors: KnowledgeFieldErrors = {}

  if (!data.title) {
    fieldErrors.title = "Title is required."
  } else if (!isKnowledgeTextLengthSafe(data.title, KNOWLEDGE_TITLE_MAX_LENGTH)) {
    fieldErrors.title = `Title must be ${KNOWLEDGE_TITLE_MAX_LENGTH} characters or fewer.`
  }

  if (data.category && !isKnowledgeTextLengthSafe(data.category, KNOWLEDGE_CATEGORY_MAX_LENGTH)) {
    fieldErrors.category = `Category must be ${KNOWLEDGE_CATEGORY_MAX_LENGTH} characters or fewer.`
  }

  return fieldErrors
}

function validateFaqInput(data: KnowledgeSourceInput): KnowledgeFieldErrors {
  const fieldErrors = validateSharedFields(data)

  if (!data.question) {
    fieldErrors.question = "Question is required."
  } else if (!isKnowledgeTextLengthSafe(data.question, KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH)) {
    fieldErrors.question = `Question must be ${KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH} characters or fewer.`
  }

  if (!data.answer) {
    fieldErrors.answer = "Answer is required."
  } else if (!isKnowledgeTextLengthSafe(data.answer, KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH)) {
    fieldErrors.answer = `Answer must be ${KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH} characters or fewer.`
  }

  return fieldErrors
}

function validateTextInput(data: KnowledgeSourceInput): KnowledgeFieldErrors {
  const fieldErrors = validateSharedFields(data)

  if (!data.content) {
    fieldErrors.content = "Manual text content is required."
  } else if (!isKnowledgeTextLengthSafe(data.content, KNOWLEDGE_TEXT_CONTENT_MAX_LENGTH)) {
    fieldErrors.content = `Manual text content must be ${KNOWLEDGE_TEXT_CONTENT_MAX_LENGTH} characters or fewer.`
  }

  return fieldErrors
}

function buildFaqChunks(data: KnowledgeSourceInput) {
  const rawText = buildFaqRawText(data.question, data.answer)
  const chunks = chunkKnowledgeText({
    rawText,
    sourceType: KnowledgeSourceType.FAQ,
    category: data.category
  })

  return { rawText, chunks }
}

function buildTextChunks(data: KnowledgeSourceInput) {
  const rawText = data.content
  const chunks = chunkKnowledgeText({
    rawText,
    sourceType: KnowledgeSourceType.TEXT,
    category: data.category
  })

  return { rawText, chunks }
}

export async function createKnowledgeFaqAction(
  _state: KnowledgeActionState,
  formData: FormData
): Promise<KnowledgeActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/knowledge/new" })
  if (!context) {
    return knowledgeValidationError("Authentication is required.")
  }

  if (!canManageKnowledge(context.workspaceMembership.role)) {
    return knowledgeValidationError("Viewer roles cannot create knowledge sources.")
  }

  const data = parseKnowledgeForm(formData)
  if (data.sourceType !== KnowledgeSourceType.FAQ) {
    return knowledgeValidationError("Unsupported knowledge source type.", {
      sourceType: "FAQ is required for this form."
    })
  }

  const fieldErrors = validateFaqInput(data)
  if (hasKnowledgeFieldErrors(fieldErrors)) {
    return knowledgeValidationError("Please fix the highlighted fields.", fieldErrors)
  }

  const { rawText, chunks } = buildFaqChunks(data)
  if (chunks.length === 0) {
    return knowledgeValidationError("Knowledge source produced no usable chunks.", {
      answer: "Add a complete answer before saving."
    })
  }

  const source = await prisma.$transaction(async tx => {
    const createdSource = await tx.knowledgeSource.create({
      data: {
        workspaceId: context.workspace.id,
        title: data.title,
        type: KnowledgeSourceType.FAQ,
        status: KnowledgeStatus.READY,
        rawText,
        metadata: {
          category: data.category || null,
          question: data.question,
          answer: data.answer
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
        sourceType: KnowledgeSourceType.FAQ
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
        sourceType: KnowledgeSourceType.FAQ
      },
      idempotencyKey: `knowledge-chunks-created:${source.id}`
    }
  ])

  revalidatePath("/dashboard/knowledge")
  revalidatePath("/dashboard/avatars")
  redirect(`/dashboard/knowledge/${source.id}?saved=created`)
}

export async function createKnowledgeTextAction(
  _state: KnowledgeActionState,
  formData: FormData
): Promise<KnowledgeActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/knowledge/new" })
  if (!context) {
    return knowledgeValidationError("Authentication is required.")
  }

  if (!canManageKnowledge(context.workspaceMembership.role)) {
    return knowledgeValidationError("Viewer roles cannot create knowledge sources.")
  }

  const data = parseKnowledgeForm(formData)
  if (data.sourceType !== KnowledgeSourceType.TEXT) {
    return knowledgeValidationError("Unsupported knowledge source type.", {
      sourceType: "TEXT is required for this form."
    })
  }

  const fieldErrors = validateTextInput(data)
  if (hasKnowledgeFieldErrors(fieldErrors)) {
    return knowledgeValidationError("Please fix the highlighted fields.", fieldErrors)
  }

  const { rawText, chunks } = buildTextChunks(data)
  if (chunks.length === 0) {
    return knowledgeValidationError("Knowledge source produced no usable chunks.", {
      content: "Add source text before saving."
    })
  }

  const source = await prisma.$transaction(async tx => {
    const createdSource = await tx.knowledgeSource.create({
      data: {
        workspaceId: context.workspace.id,
        title: data.title,
        type: KnowledgeSourceType.TEXT,
        status: KnowledgeStatus.READY,
        rawText,
        metadata: {
          category: data.category || null
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
        sourceType: KnowledgeSourceType.TEXT
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
        sourceType: KnowledgeSourceType.TEXT
      },
      idempotencyKey: `knowledge-chunks-created:${source.id}`
    }
  ])

  revalidatePath("/dashboard/knowledge")
  revalidatePath("/dashboard/avatars")
  redirect(`/dashboard/knowledge/${source.id}?saved=created`)
}

export async function updateKnowledgeSourceAction(
  _state: KnowledgeActionState,
  formData: FormData
): Promise<KnowledgeActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/knowledge" })
  if (!context) {
    return knowledgeValidationError("Authentication is required.")
  }

  if (!canManageKnowledge(context.workspaceMembership.role)) {
    return knowledgeValidationError("Viewer roles cannot update knowledge sources.")
  }

  const data = parseKnowledgeForm(formData)
  if (!data.sourceId) {
    return knowledgeValidationError("Missing knowledge source reference.", {
      sourceId: "Missing knowledge source reference."
    })
  }

  const source = await prisma.knowledgeSource.findFirst({
    where: {
      id: data.sourceId,
      workspaceId: context.workspace.id
    },
    select: {
      id: true,
      type: true,
      status: true
    }
  })

  if (!source) {
    return knowledgeValidationError("Knowledge source does not exist in this workspace.")
  }

  if (source.status === KnowledgeStatus.ARCHIVED) {
    return knowledgeValidationError("Archived knowledge sources cannot be edited.")
  }

  if (source.type !== KnowledgeSourceType.FAQ && source.type !== KnowledgeSourceType.TEXT) {
    return knowledgeValidationError("This source type is not editable in Phase 6.")
  }

  const fieldErrors = source.type === KnowledgeSourceType.FAQ
    ? validateFaqInput(data)
    : validateTextInput(data)

  if (hasKnowledgeFieldErrors(fieldErrors)) {
    return knowledgeValidationError("Please fix the highlighted fields.", fieldErrors)
  }

  const prepared = source.type === KnowledgeSourceType.FAQ
    ? buildFaqChunks(data)
    : buildTextChunks(data)

  if (prepared.chunks.length === 0) {
    return knowledgeValidationError("Knowledge source produced no usable chunks.")
  }

  await prisma.$transaction(async tx => {
    await tx.knowledgeChunk.deleteMany({
      where: { sourceId: source.id }
    })

    await tx.knowledgeSource.update({
      where: { id: source.id },
      data: {
        title: data.title,
        rawText: prepared.rawText,
        status: KnowledgeStatus.READY,
        metadata: source.type === KnowledgeSourceType.FAQ
          ? {
              category: data.category || null,
              question: data.question,
              answer: data.answer
            }
          : {
              category: data.category || null
            }
      }
    })

    await tx.knowledgeChunk.createMany({
      data: prepared.chunks.map(chunk => ({
        workspaceId: context.workspace.id,
        sourceId: source.id,
        content: chunk.content,
        position: chunk.position,
        metadata: chunk.metadata
      }))
    })
  })

  revalidatePath("/dashboard/knowledge")
  revalidatePath(`/dashboard/knowledge/${source.id}`)
  revalidatePath("/dashboard/avatars")

  return {
    status: "success",
    message: "Knowledge source updated."
  }
}

export async function archiveKnowledgeSourceAction(
  _state: KnowledgeActionState,
  formData: FormData
): Promise<KnowledgeActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/knowledge" })
  if (!context) {
    return knowledgeValidationError("Authentication is required.")
  }

  if (!canManageKnowledge(context.workspaceMembership.role)) {
    return knowledgeValidationError("Viewer roles cannot archive knowledge sources.")
  }

  const sourceId = normalizeKnowledgeInput(formData.get("sourceId"))
  if (!sourceId) {
    return knowledgeValidationError("Missing knowledge source reference.", {
      sourceId: "Missing knowledge source reference."
    })
  }

  const source = await prisma.knowledgeSource.findFirst({
    where: {
      id: sourceId,
      workspaceId: context.workspace.id
    },
    select: {
      id: true,
      status: true
    }
  })

  if (!source) {
    return knowledgeValidationError("Knowledge source does not exist in this workspace.")
  }

  if (source.status === KnowledgeStatus.ARCHIVED) {
    return {
      status: "success",
      message: "Knowledge source is already archived."
    }
  }

  await prisma.knowledgeSource.update({
    where: { id: source.id },
    data: {
      status: KnowledgeStatus.ARCHIVED,
      archivedAt: new Date()
    }
  })

  revalidatePath("/dashboard/knowledge")
  revalidatePath(`/dashboard/knowledge/${source.id}`)
  revalidatePath("/dashboard/avatars")

  return {
    status: "success",
    message: "Knowledge source archived."
  }
}
