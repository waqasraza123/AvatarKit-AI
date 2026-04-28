export const KNOWLEDGE_TITLE_MAX_LENGTH = 160
export const KNOWLEDGE_CATEGORY_MAX_LENGTH = 80
export const KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH = 1000
export const KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH = 5000
export const KNOWLEDGE_TEXT_CONTENT_MAX_LENGTH = 20000
export const KNOWLEDGE_CHUNK_MAX_LENGTH = 1400

export type KnowledgeSourceTypeValue = "FAQ" | "TEXT" | "WEBSITE" | "PDF"
export type KnowledgeStatusValue = "PENDING" | "READY" | "FAILED" | "ARCHIVED"

export type KnowledgeSourceMetadata = {
  category?: string
  question?: string
  answer?: string
}

export type KnowledgeChunkRecord = {
  id: string
  content: string
  position: number
  metadata: unknown
  createdAt: Date
}

export type KnowledgeSourceRecord = {
  id: string
  workspaceId: string
  title: string
  type: KnowledgeSourceTypeValue
  status: KnowledgeStatusValue
  rawText: string | null
  sourceUrl: string | null
  fileUrl: string | null
  metadata: KnowledgeSourceMetadata
  chunkCount: number
  createdAt: Date
  updatedAt: Date
  archivedAt: Date | null
}

export type KnowledgeSourceDetail = KnowledgeSourceRecord & {
  chunks: KnowledgeChunkRecord[]
}

export type KnowledgeSummary = {
  totalSourceCount: number
  readySourceCount: number
  archivedSourceCount: number
  readyChunkCount: number
}

export type KnowledgeFieldErrors = {
  title?: string
  question?: string
  answer?: string
  content?: string
  category?: string
  sourceId?: string
  sourceType?: string
}
