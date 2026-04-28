import {
  KnowledgeSourceType,
  KnowledgeStatus,
  Prisma,
  WorkspaceRole
} from "@prisma/client"
import {
  KNOWLEDGE_CATEGORY_MAX_LENGTH,
  KNOWLEDGE_CHUNK_MAX_LENGTH,
  KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH,
  KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH,
  KNOWLEDGE_TEXT_CONTENT_MAX_LENGTH,
  KNOWLEDGE_TITLE_MAX_LENGTH,
  type KnowledgeChunkRecord,
  type KnowledgeFieldErrors,
  type KnowledgeSourceDetail,
  type KnowledgeSourceMetadata,
  type KnowledgeSourceRecord,
  type KnowledgeSummary
} from "@/lib/knowledge-shared"
import { prisma } from "@/lib/prisma"
import { hasWorkspaceRole } from "@/lib/workspace"

export {
  KNOWLEDGE_CATEGORY_MAX_LENGTH,
  KNOWLEDGE_CHUNK_MAX_LENGTH,
  KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH,
  KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH,
  KNOWLEDGE_TEXT_CONTENT_MAX_LENGTH,
  KNOWLEDGE_TITLE_MAX_LENGTH,
  type KnowledgeChunkRecord,
  type KnowledgeFieldErrors,
  type KnowledgeSourceDetail,
  type KnowledgeSourceMetadata,
  type KnowledgeSourceRecord,
  type KnowledgeSummary
}

export function canManageKnowledge(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

export function normalizeKnowledgeInput(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim()
}

export function isKnowledgeTextLengthSafe(value: string, maxLength: number): boolean {
  return value.length <= maxLength
}

function normalizeParagraphs(value: string): string[] {
  return value
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map(paragraph => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

function splitLongParagraph(paragraph: string): string[] {
  if (paragraph.length <= KNOWLEDGE_CHUNK_MAX_LENGTH) {
    return [paragraph]
  }

  const chunks: string[] = []
  let remaining = paragraph

  while (remaining.length > KNOWLEDGE_CHUNK_MAX_LENGTH) {
    const candidate = remaining.slice(0, KNOWLEDGE_CHUNK_MAX_LENGTH + 1)
    const splitIndex = Math.max(
      candidate.lastIndexOf(". "),
      candidate.lastIndexOf("? "),
      candidate.lastIndexOf("! "),
      candidate.lastIndexOf(" ")
    )
    const safeIndex = splitIndex > 200 ? splitIndex + 1 : KNOWLEDGE_CHUNK_MAX_LENGTH
    const chunk = remaining.slice(0, safeIndex).trim()

    if (chunk) {
      chunks.push(chunk)
    }

    remaining = remaining.slice(safeIndex).trim()
  }

  if (remaining) {
    chunks.push(remaining)
  }

  return chunks
}

export function buildFaqRawText(question: string, answer: string): string {
  return `Question: ${question.trim()}\nAnswer: ${answer.trim()}`
}

export function chunkKnowledgeText({
  rawText,
  sourceType,
  category
}: {
  rawText: string
  sourceType: KnowledgeSourceType
  category?: string
}): Array<{ content: string; position: number; metadata: Prisma.InputJsonValue }> {
  const paragraphs = normalizeParagraphs(rawText).flatMap(splitLongParagraph)
  const chunks: string[] = []
  let current = ""

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph

    if (next.length <= KNOWLEDGE_CHUNK_MAX_LENGTH) {
      current = next
      continue
    }

    if (current) {
      chunks.push(current)
    }

    current = paragraph
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
    .map(content => content.trim())
    .filter(Boolean)
    .map((content, index) => ({
      content,
      position: index,
      metadata: {
        sourceType,
        category: category || null
      }
    }))
}

function parseKnowledgeMetadata(raw: Prisma.JsonValue | null): KnowledgeSourceMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {}
  }

  const candidate = raw as Record<string, unknown>

  return {
    category: candidate.category ? String(candidate.category) : undefined,
    question: candidate.question ? String(candidate.question) : undefined,
    answer: candidate.answer ? String(candidate.answer) : undefined
  }
}

function mapKnowledgeSource(raw: {
  id: string
  workspaceId: string
  title: string
  type: KnowledgeSourceType
  status: KnowledgeStatus
  rawText: string | null
  sourceUrl: string | null
  fileUrl: string | null
  metadata: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
  archivedAt: Date | null
  _count?: { chunks: number }
}): KnowledgeSourceRecord {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId,
    title: raw.title,
    type: raw.type as KnowledgeSourceRecord["type"],
    status: raw.status as KnowledgeSourceRecord["status"],
    rawText: raw.rawText,
    sourceUrl: raw.sourceUrl,
    fileUrl: raw.fileUrl,
    metadata: parseKnowledgeMetadata(raw.metadata),
    chunkCount: raw._count?.chunks ?? 0,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    archivedAt: raw.archivedAt
  }
}

function mapKnowledgeChunk(raw: {
  id: string
  content: string
  position: number
  metadata: Prisma.JsonValue | null
  createdAt: Date
}): KnowledgeChunkRecord {
  return {
    id: raw.id,
    content: raw.content,
    position: raw.position,
    metadata: raw.metadata,
    createdAt: raw.createdAt
  }
}

export async function fetchKnowledgeSourcesForWorkspace(workspaceId: string): Promise<KnowledgeSourceRecord[]> {
  const sources = await prisma.knowledgeSource.findMany({
    where: { workspaceId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      workspaceId: true,
      title: true,
      type: true,
      status: true,
      rawText: true,
      sourceUrl: true,
      fileUrl: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      archivedAt: true,
      _count: {
        select: { chunks: true }
      }
    }
  })

  return sources.map(mapKnowledgeSource)
}

export async function fetchKnowledgeSourceDetail(
  workspaceId: string,
  sourceId: string
): Promise<KnowledgeSourceDetail | null> {
  const source = await prisma.knowledgeSource.findFirst({
    where: {
      id: sourceId,
      workspaceId
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      type: true,
      status: true,
      rawText: true,
      sourceUrl: true,
      fileUrl: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      archivedAt: true,
      _count: {
        select: { chunks: true }
      },
      chunks: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          content: true,
          position: true,
          metadata: true,
          createdAt: true
        }
      }
    }
  })

  if (!source) {
    return null
  }

  return {
    ...mapKnowledgeSource(source),
    chunks: source.chunks.map(mapKnowledgeChunk)
  }
}

export async function fetchKnowledgeSummaryForWorkspace(workspaceId: string): Promise<KnowledgeSummary> {
  const [totalSourceCount, readySourceCount, archivedSourceCount, readyChunkCount] = await Promise.all([
    prisma.knowledgeSource.count({
      where: {
        workspaceId,
        status: { not: KnowledgeStatus.ARCHIVED }
      }
    }),
    prisma.knowledgeSource.count({
      where: {
        workspaceId,
        status: KnowledgeStatus.READY
      }
    }),
    prisma.knowledgeSource.count({
      where: {
        workspaceId,
        status: KnowledgeStatus.ARCHIVED
      }
    }),
    prisma.knowledgeChunk.count({
      where: {
        workspaceId,
        source: {
          status: KnowledgeStatus.READY
        }
      }
    })
  ])

  return {
    totalSourceCount,
    readySourceCount,
    archivedSourceCount,
    readyChunkCount
  }
}
