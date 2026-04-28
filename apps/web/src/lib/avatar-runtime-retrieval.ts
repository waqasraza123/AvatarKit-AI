import { KnowledgeStatus, type KnowledgeSourceType } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export type RuntimeKnowledgeChunkForRuntime = {
  id: string
  sourceId: string
  sourceTitle: string
  sourceType: KnowledgeSourceType
  content: string
  metadata?: Record<string, unknown> | null
  position: number
}

type KeywordScore = {
  chunk: {
    id: string
    sourceId: string
    sourceTitle: string
    sourceType: KnowledgeSourceType
    content: string
    metadata: Record<string, unknown> | null
    position: number
    createdAt: Date
  }
  score: number
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeText(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2)
}

function calculateChunkScore(
  content: string,
  keywords: string[]
): number {
  const normalizedContent = normalizeText(content).join(" ")
  let score = 0

  for (const keyword of keywords) {
    if (!keyword) continue
    const expression = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "g")
    const matches = normalizedContent.match(expression)
    score += matches ? matches.length : 0
  }

  return score
}

export async function fetchRelevantKnowledgeChunksForPreview({
  workspaceId,
  messageText,
  maxChunks = 6
}: {
  workspaceId: string
  messageText: string
  maxChunks?: number
}): Promise<RuntimeKnowledgeChunkForRuntime[]> {
  const normalizedKeywords = normalizeText(messageText)
  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      workspaceId,
      source: {
        status: KnowledgeStatus.READY
      }
    },
    orderBy: { createdAt: "desc" },
    include: {
      source: {
        select: {
          id: true,
          title: true,
          type: true
        }
      }
    },
    select: {
      id: true,
      sourceId: true,
      content: true,
      metadata: true,
      position: true,
      createdAt: true,
      source: {
        select: {
          id: true,
          title: true,
          type: true
        }
      }
    }
  })

  if (chunks.length <= 4) {
    return chunks.map(chunk => ({
      id: chunk.id,
      sourceId: chunk.sourceId,
      sourceTitle: chunk.source.title,
      sourceType: chunk.source.type,
      content: chunk.content,
      metadata: chunk.metadata && typeof chunk.metadata === "object" ? chunk.metadata as Record<string, unknown> : null,
      position: chunk.position
    }))
  }

  const scoredChunks: KeywordScore[] = chunks.map(chunk => ({
    chunk,
    score: calculateChunkScore(chunk.content, normalizedKeywords)
  }))

  const anyMatch = scoredChunks.some(item => item.score > 0)
  const sortedChunks = scoredChunks.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    return right.chunk.createdAt.getTime() - left.chunk.createdAt.getTime()
  })

  const bestMatches = anyMatch
    ? sortedChunks.filter(item => item.score > 0).slice(0, maxChunks)
    : sortedChunks.slice(0, maxChunks)

  return bestMatches.map(item => ({
    id: item.chunk.id,
    sourceId: item.chunk.sourceId,
    sourceTitle: item.chunk.source.title,
    sourceType: item.chunk.source.type,
    content: item.chunk.content,
    metadata: item.chunk.metadata && typeof item.chunk.metadata === "object"
      ? item.chunk.metadata as Record<string, unknown>
      : null,
    position: item.chunk.position
  }))
}
