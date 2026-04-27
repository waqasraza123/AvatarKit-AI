# AvatarKit AI - Technical Implementation Documentation

## 1. Product Summary

AvatarKit AI is a multi-tenant business avatar platform. A business can create a talking AI avatar, give it approved knowledge, embed it on a website or kiosk, and let visitors speak with it through text, voice, and video.

The product should not be a simple "photo-to-video" wrapper. It should be a full avatar runtime system:

```text
Avatar Studio
+ consent and safety
+ business knowledge ingestion
+ realtime conversation engine
+ text-to-speech
+ avatar video generation/streaming
+ embeddable widget
+ analytics dashboard
+ developer SDK
+ Python AI/media workers
+ TypeScript web/API/SDK layer
```

For the first production-grade MVP, use existing avatar providers such as D-ID or Tavus underneath a clean internal provider interface. D-ID's official docs describe talking avatar generation from images, text, and audio, including real-time streaming use cases; Tavus exposes a Conversational Video Interface with concepts like replicas, personas, and conversations for real-time video interactions. ([D-ID][1])

---

# 2. High-Level Architecture

## 2.1 Core Services

Use a hybrid TypeScript + Python architecture.

```text
apps/web                 Next.js dashboard, landing site, widget preview
apps/api                 TypeScript API/BFF for auth, workspaces, billing, widget config
apps/widget              Embeddable JavaScript widget
packages/sdk             Public React SDK
packages/ui              Shared UI components
packages/types           Shared TypeScript contracts
services/ai-runtime      Python FastAPI AI orchestration service
services/media-worker    Python worker for STT/TTS/avatar/render jobs
services/ingestion       Python document/website ingestion worker
infra                    Docker, compose, deployment, queues, observability
```

Next.js App Router is suitable for the web product because it supports layouts, server/client components, and route handlers for custom request endpoints inside the `app` directory. FastAPI is suitable for the Python AI service because it is a type-hint-based Python web framework and supports WebSockets and background task patterns for real-time and async workloads. ([Next.js][2])

## 2.2 System Diagram

```text
Visitor Browser
  |
  | loads widget.js
  v
Avatar Widget / React SDK
  |
  | HTTPS/WebSocket
  v
TypeScript API Gateway / BFF
  |
  | validates workspace, avatar, domain, session
  v
Python AI Runtime
  |
  | retrieves knowledge, generates answer, calls STT/TTS/avatar provider
  v
Media Worker / Avatar Provider
  |
  | returns text/audio/video/stream session
  v
Widget plays avatar response

Postgres stores:
users, workspaces, avatars, conversations, messages, leads, usage, consent

Redis stores:
queues, short-lived sessions, realtime state, rate limits

Object storage stores:
photos, audio files, generated videos, transcript exports
```

---

# 3. Technology Choices

## 3.1 Frontend

```text
Next.js App Router
TypeScript
Tailwind CSS
Framer Motion
TanStack Query
Zustand or Jotai
React Hook Form
Zod
Web Audio API
WebRTC where provider requires it
```

## 3.2 TypeScript API Layer

Use TypeScript for:

```text
auth/session handling
workspace permissions
billing
API keys
widget config
domain allowlist
public SDK APIs
dashboard APIs
webhook verification
usage metering
```

Recommended options:

```text
Next.js Route Handlers for simple BFF routes
or
NestJS/Fastify for a dedicated API service
```

For this product, use:

```text
apps/web: Next.js
apps/api: Fastify/NestJS TypeScript API
services/ai-runtime: FastAPI Python
```

This separation keeps the AI/media system independent from the business SaaS system.

## 3.3 Python AI Layer

Use Python for:

```text
LLM orchestration
RAG retrieval
document ingestion
STT/TTS integration
avatar provider orchestration
media processing
GPU/self-hosted avatar experiments
quality scoring
safety classification
```

Recommended libraries:

```text
FastAPI
Pydantic
SQLAlchemy or direct API access through service boundaries
httpx
Celery/RQ/Arq
Redis
Qdrant client or pgvector
OpenAI/Anthropic SDKs
Deepgram/Whisper integration
ElevenLabs/OpenAI TTS integration
```

## 3.4 Storage

```text
PostgreSQL: source of truth
Redis: queue, ephemeral sessions, rate limits
S3/R2/Supabase Storage: files and generated media
Qdrant or pgvector: knowledge embeddings
```

For this product style, Supabase/Postgres + pgvector is enough for v1. Qdrant is better if a dedicated vector system is needed later.

---

# 4. Monorepo Structure

```text
avatarkit-ai/
  apps/
    web/
      app/
        (marketing)/
        (dashboard)/
        api/
      components/
      features/
      lib/
      styles/
    api/
      src/
        modules/
          auth/
          workspaces/
          avatars/
          conversations/
          widget/
          billing/
          usage/
          webhooks/
        shared/
        main.ts
    widget/
      src/
        index.ts
        launcher.ts
        runtime.ts
        transport.ts
        ui/
  packages/
    sdk/
      src/
        AvatarKitProvider.tsx
        TalkingAvatar.tsx
        useAvatarSession.ts
    ui/
    types/
    config/
  services/
    ai-runtime/
      app/
        main.py
        api/
        core/
        agents/
        providers/
        retrieval/
        safety/
        schemas/
    media-worker/
      app/
        worker.py
        jobs/
        providers/
    ingestion/
      app/
        worker.py
        loaders/
        chunking/
        embeddings/
  prisma/
    schema.prisma
  docs/
    architecture/
    product/
    api/
  docker-compose.yml
  package.json
  pnpm-workspace.yaml
```

---

# 5. Data Model

Use Prisma for the core SaaS database.

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memberships WorkspaceMember[]
}

model Workspace {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members          WorkspaceMember[]
  avatars          Avatar[]
  apiKeys          ApiKey[]
  conversations    Conversation[]
  knowledgeSources KnowledgeSource[]
}

model WorkspaceMember {
  id          String @id @default(cuid())
  workspaceId String
  userId      String
  role        WorkspaceRole

  workspace Workspace @relation(fields: [workspaceId], references: [id])
  user      User      @relation(fields: [userId], references: [id])

  @@unique([workspaceId, userId])
}

enum WorkspaceRole {
  OWNER
  ADMIN
  OPERATOR
  VIEWER
}

model Avatar {
  id          String       @id @default(cuid())
  workspaceId String
  name        String
  role        String
  status      AvatarStatus @default(DRAFT)
  engine      AvatarEngine @default(DID)
  photoUrl    String?
  voiceId     String?
  language    String       @default("en")
  prompt      String
  publishedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace     Workspace @relation(fields: [workspaceId], references: [id])
  consentRecord ConsentRecord?
  conversations Conversation[]
}

enum AvatarStatus {
  DRAFT
  PROCESSING
  READY
  PUBLISHED
  SUSPENDED
  FAILED
}

enum AvatarEngine {
  DID
  TAVUS
  SIMLI
  SELF_HOSTED
  MOCK
}

model ConsentRecord {
  id                String   @id @default(cuid())
  workspaceId       String
  avatarId          String   @unique
  consentType       String
  acceptedByUserId  String
  acceptedIp        String?
  acceptedUserAgent String?
  termsVersion      String
  createdAt         DateTime @default(now())

  avatar Avatar @relation(fields: [avatarId], references: [id])
}

model KnowledgeSource {
  id          String @id @default(cuid())
  workspaceId String
  type        KnowledgeSourceType
  title       String
  sourceUrl   String?
  fileUrl     String?
  rawText     String?
  status      KnowledgeStatus @default(PENDING)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id])
  chunks    KnowledgeChunk[]
}

enum KnowledgeSourceType {
  FAQ
  PDF
  WEBSITE
  TEXT
}

enum KnowledgeStatus {
  PENDING
  INGESTING
  READY
  FAILED
}

model KnowledgeChunk {
  id          String @id @default(cuid())
  sourceId    String
  workspaceId String
  content     String
  metadata    Json?
  embeddingId String?
  createdAt   DateTime @default(now())

  source KnowledgeSource @relation(fields: [sourceId], references: [id])
}

model Conversation {
  id          String @id @default(cuid())
  workspaceId String
  avatarId    String
  visitorId   String?
  channel     ConversationChannel
  status      ConversationStatus @default(ACTIVE)
  summary     String?
  createdAt   DateTime @default(now())
  endedAt     DateTime?

  workspace Workspace @relation(fields: [workspaceId], references: [id])
  avatar    Avatar    @relation(fields: [avatarId], references: [id])
  messages  Message[]
  lead      Lead?
}

enum ConversationChannel {
  WIDGET
  DASHBOARD_PREVIEW
  KIOSK
  API
}

enum ConversationStatus {
  ACTIVE
  ENDED
  HANDOFF_REQUESTED
  FAILED
}

model Message {
  id             String @id @default(cuid())
  conversationId String
  role           MessageRole
  content        String
  audioUrl       String?
  videoUrl       String?
  metadata       Json?
  createdAt      DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id])
}

enum MessageRole {
  VISITOR
  AVATAR
  SYSTEM
  OPERATOR
}

model Lead {
  id             String @id @default(cuid())
  workspaceId    String
  conversationId String @unique
  name           String?
  email          String?
  phone          String?
  message        String?
  status         LeadStatus @default(NEW)
  createdAt      DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id])
}

enum LeadStatus {
  NEW
  CONTACTED
  QUALIFIED
  CLOSED
  SPAM
}

model ApiKey {
  id          String @id @default(cuid())
  workspaceId String
  name        String
  keyHash     String
  prefix      String
  createdAt   DateTime @default(now())
  revokedAt   DateTime?

  workspace Workspace @relation(fields: [workspaceId], references: [id])
}

model UsageEvent {
  id          String @id @default(cuid())
  workspaceId String
  avatarId    String?
  eventType   String
  quantity    Int
  metadata    Json?
  createdAt   DateTime @default(now())
}
```

---

# 6. Event and Queue Design

Use queues for anything slow, expensive, or failure-prone.

## 6.1 Queue Names

```text
avatar.photo.process
knowledge.source.ingest
conversation.message.process
media.tts.generate
media.avatar.generate
media.avatar.stream.start
conversation.summary.generate
usage.aggregate
webhook.dispatch
```

## 6.2 Job Payloads

```ts
export type ProcessConversationMessageJob = {
  conversationId: string
  workspaceId: string
  avatarId: string
  messageId: string
  inputMode: "text" | "voice"
  responseMode: "text" | "audio" | "video" | "stream"
}

export type GenerateAvatarMediaJob = {
  conversationId: string
  messageId: string
  avatarId: string
  engine: "DID" | "TAVUS" | "SIMLI" | "SELF_HOSTED"
  text: string
  audioUrl?: string
}
```

## 6.3 Job State Machine

```text
queued
-> running
-> provider_pending
-> completed
-> failed
-> retrying
-> dead_letter
```

Each failed media job should save a clean fallback:

```text
video failed -> return audio
audio failed -> return text
LLM failed -> return safe apology
retrieval weak -> ask clarification or handoff
```

---

# 7. Conversation Runtime Protocol

The runtime should not be random request/response only. Define a stable protocol.

## 7.1 Widget to API Request

```ts
export type RuntimeMessageRequest = {
  avatarId: string
  conversationId?: string
  visitorId?: string
  input: {
    type: "text" | "audio"
    text?: string
    audioUrl?: string
    language?: string
  }
  output: {
    mode: "text" | "audio" | "video" | "stream"
  }
  context?: {
    pageUrl?: string
    referrer?: string
    timezone?: string
  }
}
```

## 7.2 Runtime Response

```ts
export type RuntimeMessageResponse = {
  conversationId: string
  messageId: string
  status: "completed" | "processing" | "streaming" | "failed"
  answer?: {
    text: string
    audioUrl?: string
    videoUrl?: string
    streamUrl?: string
  }
  leadCapture?: {
    required: boolean
    fields: Array<"name" | "email" | "phone" | "message">
    reason?: string
  }
  handoff?: {
    required: boolean
    reason?: string
  }
  usage: {
    llmTokens?: number
    ttsCharacters?: number
    videoSeconds?: number
  }
}
```

## 7.3 Realtime WebSocket Events

```ts
export type AvatarRuntimeEvent =
  | { type: "session.started"; conversationId: string }
  | { type: "user.transcript.partial"; text: string }
  | { type: "user.transcript.final"; text: string }
  | { type: "avatar.answer.partial"; text: string }
  | { type: "avatar.audio.ready"; audioUrl: string }
  | { type: "avatar.video.ready"; videoUrl: string }
  | { type: "avatar.stream.ready"; streamUrl: string }
  | { type: "lead.capture.requested"; fields: string[] }
  | { type: "handoff.requested"; reason: string }
  | { type: "error"; code: string; message: string }
```

---

# 8. TypeScript API Implementation

## 8.1 Avatar Provider Interface

Create a provider interface so the product is not locked to D-ID or Tavus.

```ts
export type AvatarEngineName = "DID" | "TAVUS" | "SIMLI" | "SELF_HOSTED" | "MOCK"

export type AvatarMediaRequest = {
  avatarId: string
  photoUrl?: string
  voiceId?: string
  text: string
  audioUrl?: string
  language: string
}

export type AvatarMediaResult = {
  providerJobId?: string
  videoUrl?: string
  streamUrl?: string
  status: "completed" | "processing" | "streaming" | "failed"
  metadata?: Record<string, unknown>
}

export interface AvatarProvider {
  name: AvatarEngineName
  generateVideo(input: AvatarMediaRequest): Promise<AvatarMediaResult>
  startStream?(input: AvatarMediaRequest): Promise<AvatarMediaResult>
  getStatus?(providerJobId: string): Promise<AvatarMediaResult>
}
```

## 8.2 Provider Registry

```ts
import { DidAvatarProvider } from "./providers/did"
import { TavusAvatarProvider } from "./providers/tavus"
import { MockAvatarProvider } from "./providers/mock"

export function createAvatarProvider(engine: AvatarEngineName): AvatarProvider {
  if (engine === "DID") return new DidAvatarProvider()
  if (engine === "TAVUS") return new TavusAvatarProvider()
  if (engine === "MOCK") return new MockAvatarProvider()
  throw new Error(`Unsupported avatar engine: ${engine}`)
}
```

## 8.3 Runtime Route Handler

```ts
import { z } from "zod"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { callAiRuntime } from "@/lib/ai-runtime"

const runtimeMessageSchema = z.object({
  avatarId: z.string().min(1),
  conversationId: z.string().optional(),
  visitorId: z.string().optional(),
  input: z.object({
    type: z.enum(["text", "audio"]),
    text: z.string().optional(),
    audioUrl: z.string().url().optional(),
    language: z.string().optional()
  }),
  output: z.object({
    mode: z.enum(["text", "audio", "video", "stream"])
  }),
  context: z.object({
    pageUrl: z.string().optional(),
    referrer: z.string().optional(),
    timezone: z.string().optional()
  }).optional()
})

export async function POST(request: NextRequest) {
  const payload = runtimeMessageSchema.parse(await request.json())

  const avatar = await prisma.avatar.findUnique({
    where: { id: payload.avatarId },
    include: { workspace: true }
  })

  if (!avatar || avatar.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Avatar is not available" }, { status: 404 })
  }

  const conversation = payload.conversationId
    ? await prisma.conversation.findUnique({ where: { id: payload.conversationId } })
    : await prisma.conversation.create({
        data: {
          workspaceId: avatar.workspaceId,
          avatarId: avatar.id,
          visitorId: payload.visitorId,
          channel: "WIDGET"
        }
      })

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  const visitorMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "VISITOR",
      content: payload.input.text ?? "",
      metadata: payload
    }
  })

  const result = await callAiRuntime({
    workspaceId: avatar.workspaceId,
    avatarId: avatar.id,
    conversationId: conversation.id,
    messageId: visitorMessage.id,
    input: payload.input,
    output: payload.output
  })

  return NextResponse.json(result)
}
```

## 8.4 Python AI Runtime Client in TypeScript

```ts
import { env } from "@/lib/env"

export type AiRuntimeRequest = {
  workspaceId: string
  avatarId: string
  conversationId: string
  messageId: string
  input: {
    type: "text" | "audio"
    text?: string
    audioUrl?: string
    language?: string
  }
  output: {
    mode: "text" | "audio" | "video" | "stream"
  }
}

export async function callAiRuntime(payload: AiRuntimeRequest) {
  const response = await fetch(`${env.AI_RUNTIME_URL}/runtime/message`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.AI_RUNTIME_SERVICE_TOKEN}`
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error("AI runtime request failed")
  }

  return response.json()
}
```

---

# 9. Python AI Runtime Implementation

## 9.1 FastAPI App

```py
from fastapi import FastAPI, Depends, HTTPException
from app.schemas.runtime import RuntimeMessageRequest, RuntimeMessageResponse
from app.core.auth import verify_service_token
from app.agents.conversation_agent import ConversationAgent

app = FastAPI(title="AvatarKit AI Runtime")

@app.post("/runtime/message", response_model=RuntimeMessageResponse)
async def process_runtime_message(
    payload: RuntimeMessageRequest,
    _: None = Depends(verify_service_token),
):
    agent = ConversationAgent()
    try:
        return await agent.process(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
```

## 9.2 Pydantic Schemas

```py
from typing import Literal, Optional, Any
from pydantic import BaseModel, Field

class RuntimeInput(BaseModel):
    type: Literal["text", "audio"]
    text: Optional[str] = None
    audioUrl: Optional[str] = None
    language: Optional[str] = None

class RuntimeOutput(BaseModel):
    mode: Literal["text", "audio", "video", "stream"]

class RuntimeMessageRequest(BaseModel):
    workspaceId: str
    avatarId: str
    conversationId: str
    messageId: str
    input: RuntimeInput
    output: RuntimeOutput

class RuntimeAnswer(BaseModel):
    text: str
    audioUrl: Optional[str] = None
    videoUrl: Optional[str] = None
    streamUrl: Optional[str] = None

class LeadCapture(BaseModel):
    required: bool = False
    fields: list[str] = Field(default_factory=list)
    reason: Optional[str] = None

class Handoff(BaseModel):
    required: bool = False
    reason: Optional[str] = None

class RuntimeUsage(BaseModel):
    llmTokens: Optional[int] = None
    ttsCharacters: Optional[int] = None
    videoSeconds: Optional[int] = None

class RuntimeMessageResponse(BaseModel):
    conversationId: str
    messageId: str
    status: Literal["completed", "processing", "streaming", "failed"]
    answer: Optional[RuntimeAnswer] = None
    leadCapture: LeadCapture = Field(default_factory=LeadCapture)
    handoff: Handoff = Field(default_factory=Handoff)
    usage: RuntimeUsage = Field(default_factory=RuntimeUsage)
    metadata: dict[str, Any] = Field(default_factory=dict)
```

## 9.3 Conversation Agent

The Python agent should own the AI pipeline.

```py
from app.schemas.runtime import RuntimeMessageRequest, RuntimeMessageResponse, RuntimeAnswer
from app.retrieval.knowledge_search import KnowledgeSearch
from app.safety.policy_guard import PolicyGuard
from app.providers.llm import LlmProvider
from app.providers.tts import TtsProvider
from app.providers.avatar import AvatarProvider
from app.repositories.avatar_repository import AvatarRepository
from app.repositories.message_repository import MessageRepository

class ConversationAgent:
    def __init__(self):
        self.avatar_repository = AvatarRepository()
        self.message_repository = MessageRepository()
        self.knowledge_search = KnowledgeSearch()
        self.policy_guard = PolicyGuard()
        self.llm = LlmProvider()
        self.tts = TtsProvider()
        self.avatar_provider = AvatarProvider()

    async def process(self, payload: RuntimeMessageRequest) -> RuntimeMessageResponse:
        avatar = await self.avatar_repository.get_avatar(payload.avatarId)

        user_text = await self._resolve_input_text(payload)
        context_chunks = await self.knowledge_search.search(
            workspace_id=payload.workspaceId,
            query=user_text,
            limit=6,
        )

        generation = await self.llm.generate_avatar_answer(
            avatar=avatar,
            user_text=user_text,
            context_chunks=context_chunks,
        )

        safety = await self.policy_guard.check_answer(
            avatar=avatar,
            user_text=user_text,
            answer=generation.answer,
        )

        if not safety.allowed:
            generation.answer = safety.fallback_answer
            generation.handoff_required = safety.handoff_required

        audio_url = None
        video_url = None
        stream_url = None

        if payload.output.mode in ["audio", "video", "stream"]:
            audio_url = await self.tts.generate(
                text=generation.answer,
                voice_id=avatar.voice_id,
                language=avatar.language,
            )

        if payload.output.mode == "video":
            avatar_result = await self.avatar_provider.generate_video(
                avatar=avatar,
                text=generation.answer,
                audio_url=audio_url,
            )
            video_url = avatar_result.video_url

        if payload.output.mode == "stream":
            avatar_result = await self.avatar_provider.start_stream(
                avatar=avatar,
                text=generation.answer,
                audio_url=audio_url,
            )
            stream_url = avatar_result.stream_url

        assistant_message = await self.message_repository.create_avatar_message(
            conversation_id=payload.conversationId,
            content=generation.answer,
            audio_url=audio_url,
            video_url=video_url,
            metadata={
                "sources": [chunk.id for chunk in context_chunks],
                "safety": safety.model_dump(),
                "leadCapture": generation.lead_capture.model_dump(),
            },
        )

        return RuntimeMessageResponse(
            conversationId=payload.conversationId,
            messageId=assistant_message.id,
            status="streaming" if stream_url else "completed",
            answer=RuntimeAnswer(
                text=generation.answer,
                audioUrl=audio_url,
                videoUrl=video_url,
                streamUrl=stream_url,
            ),
            leadCapture=generation.lead_capture,
            handoff=generation.handoff,
            usage=generation.usage,
        )

    async def _resolve_input_text(self, payload: RuntimeMessageRequest) -> str:
        if payload.input.type == "text" and payload.input.text:
            return payload.input.text

        if payload.input.type == "audio" and payload.input.audioUrl:
            return await self.llm.transcribe(payload.input.audioUrl)

        raise ValueError("Invalid runtime input")
```

---

# 10. RAG / Knowledge Retrieval

## 10.1 Ingestion Flow

```text
User adds FAQ/PDF/website
-> TypeScript API creates KnowledgeSource
-> enqueue knowledge.source.ingest
-> Python ingestion worker loads source
-> extracts clean text
-> chunks text
-> embeds chunks
-> stores chunks in Postgres/Qdrant
-> marks source READY
```

## 10.2 Chunking Strategy

For v1:

```text
chunk size: 700-1,000 tokens
overlap: 100-150 tokens
metadata: source title, URL, page number, section heading
```

## 10.3 Python Ingestion Worker

```py
from app.loaders.source_loader import SourceLoader
from app.chunking.text_chunker import TextChunker
from app.embeddings.embedding_provider import EmbeddingProvider
from app.repositories.knowledge_repository import KnowledgeRepository

class KnowledgeIngestionJob:
    def __init__(self):
        self.loader = SourceLoader()
        self.chunker = TextChunker()
        self.embeddings = EmbeddingProvider()
        self.repository = KnowledgeRepository()

    async def run(self, source_id: str):
        source = await self.repository.get_source(source_id)
        text = await self.loader.load(source)
        chunks = self.chunker.chunk(text)

        for chunk in chunks:
            embedding = await self.embeddings.embed(chunk.content)
            await self.repository.create_chunk(
                source_id=source.id,
                workspace_id=source.workspace_id,
                content=chunk.content,
                embedding=embedding,
                metadata=chunk.metadata,
            )

        await self.repository.mark_ready(source.id)
```

## 10.4 Knowledge Search

```py
class KnowledgeSearch:
    async def search(self, workspace_id: str, query: str, limit: int = 6):
        query_embedding = await self.embedding_provider.embed(query)
        return await self.repository.vector_search(
            workspace_id=workspace_id,
            embedding=query_embedding,
            limit=limit,
        )
```

---

# 11. Prompting and Structured Output

The avatar should not freely ramble. It should produce structured decisions.

## 11.1 Internal Answer Contract

```py
from pydantic import BaseModel, Field

class GeneratedLeadCapture(BaseModel):
    required: bool = False
    fields: list[str] = Field(default_factory=list)
    reason: str | None = None

class GeneratedHandoff(BaseModel):
    required: bool = False
    reason: str | None = None

class GeneratedUsage(BaseModel):
    llmTokens: int | None = None
    ttsCharacters: int | None = None
    videoSeconds: int | None = None

class GeneratedAvatarAnswer(BaseModel):
    answer: str
    confidence: float
    intent: str
    lead_capture: GeneratedLeadCapture
    handoff: GeneratedHandoff
    usage: GeneratedUsage = Field(default_factory=GeneratedUsage)
```

## 11.2 Prompt Template

```text
You are the business avatar named {avatar_name}.

Role:
{avatar_role}

Business rules:
{avatar_prompt}

Allowed knowledge:
Use only the provided business knowledge when answering factual business questions.

Visitor question:
{user_text}

Relevant business knowledge:
{context_chunks}

Instructions:
- Answer naturally and briefly.
- Do not invent prices, policies, availability, legal advice, medical advice, or guarantees.
- If the knowledge is insufficient, say that you are not fully sure and offer to collect contact details.
- If the visitor shows buying intent, request lead details.
- If the topic is sensitive or outside the business scope, request human handoff.
- Return only valid JSON matching the schema.
```

---

# 12. Safety Layer

## 12.1 Safety Decisions

The safety system should run before and after generation.

```text
pre-check user input
-> reject abuse or impersonation request
-> generation
-> post-check generated answer
-> allow, revise, refuse, or handoff
```

## 12.2 Safety Result

```py
from pydantic import BaseModel

class SafetyResult(BaseModel):
    allowed: bool
    severity: str
    reason: str | None = None
    fallback_answer: str | None = None
    handoff_required: bool = False
```

## 12.3 Safety Guard

```py
class PolicyGuard:
    async def check_answer(self, avatar, user_text: str, answer: str) -> SafetyResult:
        if self._contains_unsupported_medical_advice(avatar.role, answer):
            return SafetyResult(
                allowed=False,
                severity="high",
                reason="medical_advice",
                fallback_answer="I cannot give medical advice here, but I can collect your details so the team can help.",
                handoff_required=True,
            )

        if self._contains_unsupported_legal_advice(avatar.role, answer):
            return SafetyResult(
                allowed=False,
                severity="high",
                reason="legal_advice",
                fallback_answer="I cannot provide legal advice directly, but I can collect your details for the team.",
                handoff_required=True,
            )

        return SafetyResult(allowed=True, severity="none")
```

---

# 13. Avatar Provider Integration

## 13.1 Internal Python Provider Interface

```py
from dataclasses import dataclass
from typing import Optional, Protocol

@dataclass
class AvatarMediaInput:
    avatar_id: str
    photo_url: Optional[str]
    voice_id: Optional[str]
    text: str
    audio_url: Optional[str]
    language: str

@dataclass
class AvatarMediaOutput:
    status: str
    video_url: Optional[str] = None
    stream_url: Optional[str] = None
    provider_job_id: Optional[str] = None

class AvatarMediaProvider(Protocol):
    async def generate_video(self, payload: AvatarMediaInput) -> AvatarMediaOutput:
        ...

    async def start_stream(self, payload: AvatarMediaInput) -> AvatarMediaOutput:
        ...
```

## 13.2 D-ID Provider Skeleton

```py
import httpx
from app.config import settings
from app.providers.avatar.base import AvatarMediaInput, AvatarMediaOutput

class DidAvatarMediaProvider:
    def __init__(self):
        self.base_url = settings.did_base_url
        self.api_key = settings.did_api_key

    async def generate_video(self, payload: AvatarMediaInput) -> AvatarMediaOutput:
        body = {
            "source_url": payload.photo_url,
            "script": {
                "type": "audio" if payload.audio_url else "text",
                "audio_url": payload.audio_url,
                "input": payload.text,
            },
            "config": {
                "stitch": True,
            },
        }

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self.base_url}/talks",
                headers={"authorization": f"Basic {self.api_key}"},
                json=body,
            )
            response.raise_for_status()
            data = response.json()

        return AvatarMediaOutput(
            status="processing",
            provider_job_id=data.get("id"),
        )

    async def start_stream(self, payload: AvatarMediaInput) -> AvatarMediaOutput:
        raise NotImplementedError("D-ID streaming provider should be implemented against Talks Streams")
```

## 13.3 Tavus Provider Skeleton

```py
import httpx
from app.config import settings
from app.providers.avatar.base import AvatarMediaInput, AvatarMediaOutput

class TavusAvatarMediaProvider:
    def __init__(self):
        self.base_url = settings.tavus_base_url
        self.api_key = settings.tavus_api_key

    async def start_stream(self, payload: AvatarMediaInput) -> AvatarMediaOutput:
        body = {
            "replica_id": settings.tavus_default_replica_id,
            "persona_id": settings.tavus_default_persona_id,
            "callback_url": settings.tavus_callback_url,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self.base_url}/conversations",
                headers={"x-api-key": self.api_key},
                json=body,
            )
            response.raise_for_status()
            data = response.json()

        return AvatarMediaOutput(
            status="streaming",
            stream_url=data.get("conversation_url"),
            provider_job_id=data.get("conversation_id"),
        )
```

The exact request shape should be finalized against the current provider docs before implementation, but the internal provider abstraction should stay stable.

---

# 14. Text-to-Speech Layer

## 14.1 TTS Provider Interface

```py
from typing import Protocol

class TtsProviderProtocol(Protocol):
    async def generate(self, text: str, voice_id: str | None, language: str) -> str:
        ...
```

## 14.2 TTS Provider Implementation

```py
import httpx
from app.config import settings
from app.storage.object_storage import ObjectStorage

class TtsProvider:
    def __init__(self):
        self.storage = ObjectStorage()

    async def generate(self, text: str, voice_id: str | None, language: str) -> str:
        audio_bytes = await self._generate_audio(text, voice_id, language)
        return await self.storage.put_bytes(
            key_prefix="tts",
            content=audio_bytes,
            content_type="audio/mpeg",
        )

    async def _generate_audio(self, text: str, voice_id: str | None, language: str) -> bytes:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                settings.tts_endpoint,
                headers={"authorization": f"Bearer {settings.tts_api_key}"},
                json={
                    "voice_id": voice_id or settings.default_voice_id,
                    "text": text,
                    "language": language,
                },
            )
            response.raise_for_status()
            return response.content
```

---

# 15. Speech-to-Text Layer

## 15.1 Voice Flow

```text
Browser records audio
-> uploads audio blob to signed URL
-> calls runtime with audioUrl
-> Python downloads/transcribes audio
-> text enters normal conversation flow
```

## 15.2 Browser Audio Capture

```ts
export async function recordAudio(durationMs: number): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  const chunks: BlobPart[] = []

  return await new Promise((resolve, reject) => {
    recorder.ondataavailable = event => chunks.push(event.data)
    recorder.onerror = () => reject(new Error("Audio recording failed"))
    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop())
      resolve(new Blob(chunks, { type: "audio/webm" }))
    }

    recorder.start()
    window.setTimeout(() => recorder.stop(), durationMs)
  })
}
```

## 15.3 Python Transcription

```py
import httpx
from app.config import settings

class SttProvider:
    async def transcribe(self, audio_url: str) -> str:
        async with httpx.AsyncClient(timeout=90) as client:
            audio_response = await client.get(audio_url)
            audio_response.raise_for_status()

            response = await client.post(
                settings.stt_endpoint,
                headers={"authorization": f"Bearer {settings.stt_api_key}"},
                files={"file": ("audio.webm", audio_response.content, "audio/webm")},
            )
            response.raise_for_status()
            data = response.json()

        return data["text"]
```

---

# 16. Embeddable Widget Implementation

## 16.1 Widget Goals

The widget must be:

```text
small
isolated
async loaded
themeable
domain-restricted
safe on client websites
resilient when API fails
```

## 16.2 Script Tag

```html
<script
  src="https://cdn.avatarkit.ai/widget.js"
  data-avatar-id="av_123"
  data-position="bottom-right"
  data-theme="light">
</script>
```

## 16.3 Widget Bootstrap

```ts
type WidgetConfig = {
  avatarId: string
  apiBaseUrl: string
  position: "bottom-right" | "bottom-left"
  theme: "light" | "dark"
}

function readConfig(): WidgetConfig {
  const script = document.currentScript as HTMLScriptElement

  return {
    avatarId: script.dataset.avatarId ?? "",
    apiBaseUrl: script.dataset.apiBaseUrl ?? "https://api.avatarkit.ai",
    position: (script.dataset.position as WidgetConfig["position"]) ?? "bottom-right",
    theme: (script.dataset.theme as WidgetConfig["theme"]) ?? "light",
  }
}

async function boot() {
  const config = readConfig()

  if (!config.avatarId) {
    return
  }

  const root = document.createElement("div")
  root.id = "avatarkit-widget-root"
  document.body.appendChild(root)

  const { createRoot } = await import("react-dom/client")
  const { AvatarWidget } = await import("./ui/AvatarWidget")

  createRoot(root).render(<AvatarWidget config={config} />)
}

void boot()
```

## 16.4 Widget Runtime Hook

```ts
import { useMutation } from "@tanstack/react-query"

export function useAvatarMessage(apiBaseUrl: string) {
  return useMutation({
    mutationFn: async (payload: RuntimeMessageRequest): Promise<RuntimeMessageResponse> => {
      const response = await fetch(`${apiBaseUrl}/runtime/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error("Avatar message failed")
      }

      return response.json()
    }
  })
}
```

---

# 17. React SDK

## 17.1 Provider

```tsx
import { createContext, useContext } from "react"

type AvatarKitContextValue = {
  apiKey?: string
  apiBaseUrl: string
}

const AvatarKitContext = createContext<AvatarKitContextValue | null>(null)

export function AvatarKitProvider({
  apiKey,
  apiBaseUrl = "https://api.avatarkit.ai",
  children,
}: {
  apiKey?: string
  apiBaseUrl?: string
  children: React.ReactNode
}) {
  return (
    <AvatarKitContext.Provider value={{ apiKey, apiBaseUrl }}>
      {children}
    </AvatarKitContext.Provider>
  )
}

export function useAvatarKit() {
  const context = useContext(AvatarKitContext)

  if (!context) {
    throw new Error("useAvatarKit must be used inside AvatarKitProvider")
  }

  return context
}
```

## 17.2 Talking Avatar Component

```tsx
import { useState } from "react"
import { useAvatarKit } from "./AvatarKitProvider"

export function TalkingAvatar({ avatarId }: { avatarId: string }) {
  const { apiBaseUrl, apiKey } = useAvatarKit()
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [message, setMessage] = useState("")
  const [videoUrl, setVideoUrl] = useState<string | undefined>()
  const [answer, setAnswer] = useState<string | undefined>()
  const [isSending, setIsSending] = useState(false)

  async function sendMessage() {
    setIsSending(true)

    try {
      const response = await fetch(`${apiBaseUrl}/runtime/message`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          avatarId,
          conversationId,
          input: {
            type: "text",
            text: message,
          },
          output: {
            mode: "video",
          },
        }),
      })

      if (!response.ok) {
        throw new Error("Avatar request failed")
      }

      const data = await response.json()
      setConversationId(data.conversationId)
      setAnswer(data.answer?.text)
      setVideoUrl(data.answer?.videoUrl)
      setMessage("")
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="rounded-3xl border bg-white p-4 shadow-xl">
      <div className="aspect-video overflow-hidden rounded-2xl bg-slate-100">
        {videoUrl ? (
          <video src={videoUrl} autoPlay playsInline controls className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Avatar is ready
          </div>
        )}
      </div>

      {answer ? <p className="mt-4 text-sm text-slate-700">{answer}</p> : null}

      <div className="mt-4 flex gap-2">
        <input
          value={message}
          onChange={event => setMessage(event.target.value)}
          className="flex-1 rounded-xl border px-3 py-2 text-sm"
          placeholder="Ask the avatar..."
        />
        <button
          onClick={sendMessage}
          disabled={isSending || !message.trim()}
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

---

# 18. Dashboard Screens

## 18.1 Required Pages

```text
/dashboard
/dashboard/avatars
/dashboard/avatars/new
/dashboard/avatars/:id/studio
/dashboard/avatars/:id/preview
/dashboard/knowledge
/dashboard/conversations
/dashboard/conversations/:id
/dashboard/leads
/dashboard/embed
/dashboard/usage
/dashboard/settings
```

## 18.2 Avatar Studio Flow

```text
Step 1: Avatar basics
Step 2: Upload/capture image
Step 3: Consent
Step 4: Voice and language
Step 5: Business behavior
Step 6: Knowledge
Step 7: Preview
Step 8: Publish
```

## 18.3 Studio State

```ts
export type AvatarStudioState = {
  avatarId?: string
  name: string
  role: string
  photoUrl?: string
  consentAccepted: boolean
  voiceId?: string
  language: string
  prompt: string
  knowledgeSourceIds: string[]
  status: "draft" | "processing" | "ready" | "published" | "failed"
}
```

---

# 19. Realtime Voice Implementation

## 19.1 Simple v1 Voice

Start with push-to-talk:

```text
user clicks mic
-> record 5-20 seconds
-> upload blob
-> transcribe
-> generate answer
-> generate avatar video/audio
-> play response
```

This is much easier and reliable.

## 19.2 Advanced v2 Realtime

Then add:

```text
voice activity detection
partial transcripts
interruptions
streaming LLM
sentence-level TTS
avatar stream response
WebSocket session control
```

## 19.3 WebSocket Endpoint

```py
from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/runtime/stream")
async def runtime_stream(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            event = await websocket.receive_json()
            if event["type"] == "user.message":
                response = await ConversationAgent().process_stream_event(event)
                await websocket.send_json(response)
    except WebSocketDisconnect:
        return
```

FastAPI has official WebSocket support, which makes it a good choice for the Python realtime runtime service. ([FastAPI][3])

---

# 20. Usage Metering

Track everything that costs money.

## 20.1 Usage Event Types

```text
llm.tokens.input
llm.tokens.output
stt.seconds
tts.characters
avatar.video.seconds
avatar.stream.seconds
knowledge.embeddings
storage.bytes
widget.sessions
conversation.messages
```

## 20.2 Usage Logger

```ts
export async function recordUsageEvent(input: {
  workspaceId: string
  avatarId?: string
  eventType: string
  quantity: number
  metadata?: Record<string, unknown>
}) {
  await prisma.usageEvent.create({
    data: {
      workspaceId: input.workspaceId,
      avatarId: input.avatarId,
      eventType: input.eventType,
      quantity: input.quantity,
      metadata: input.metadata ?? {},
    },
  })
}
```

---

# 21. Domain Security for Widget

Each workspace should allow approved domains only.

```prisma
model AllowedDomain {
  id          String @id @default(cuid())
  workspaceId String
  domain      String
  createdAt   DateTime @default(now())
}
```

Validation:

```ts
export function getRequestOriginDomain(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return null

  try {
    return new URL(origin).hostname
  } catch {
    return null
  }
}

export async function assertWidgetDomainAllowed(workspaceId: string, request: Request) {
  const domain = getRequestOriginDomain(request)

  if (!domain) {
    throw new Error("Missing request origin")
  }

  const allowed = await prisma.allowedDomain.findFirst({
    where: { workspaceId, domain },
  })

  if (!allowed) {
    throw new Error("Domain is not allowed")
  }
}
```

---

# 22. Observability

Log every important step.

## 22.1 Event Timeline Per Conversation

```text
session.started
visitor.message.received
stt.started
stt.completed
retrieval.started
retrieval.completed
llm.started
llm.completed
safety.checked
tts.started
tts.completed
avatar.render.started
avatar.render.completed
response.delivered
lead.created
session.ended
```

## 22.2 Trace Table

```prisma
model RuntimeTrace {
  id             String @id @default(cuid())
  workspaceId    String
  avatarId       String?
  conversationId String?
  eventType      String
  durationMs     Int?
  status         String
  metadata       Json?
  createdAt      DateTime @default(now())
}
```

---

# 23. Deployment Architecture

## 23.1 Local Development

```text
pnpm dev
docker compose up postgres redis qdrant minio
uvicorn app.main:app --reload
python -m app.worker
```

## 23.2 Production

```text
Vercel: apps/web
Fly.io/Render/AWS ECS: apps/api
Fly.io/Render/AWS ECS: services/ai-runtime
GPU host later: media-worker/self-hosted avatar engine
Supabase/Neon/RDS: Postgres
Upstash/Redis Cloud: Redis
Cloudflare R2/S3: media storage
Qdrant Cloud or pgvector: vector search
```

## 23.3 Environment Variables

```text
DATABASE_URL
REDIS_URL
AI_RUNTIME_URL
AI_RUNTIME_SERVICE_TOKEN
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY
OBJECT_STORAGE_BUCKET
OPENAI_API_KEY
ANTHROPIC_API_KEY
TTS_API_KEY
STT_API_KEY
DID_API_KEY
DID_BASE_URL
TAVUS_API_KEY
TAVUS_BASE_URL
WEBHOOK_SIGNING_SECRET
```

---

# 24. Implementation Milestones

## Milestone 1 - Foundation

Build:

```text
monorepo
Next.js marketing/app shell
TypeScript API service
Postgres schema
auth
workspace model
shared types
basic dashboard layout
```

Verification:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm prisma migrate dev
```

## Milestone 2 - Avatar Studio

Build:

```text
avatar CRUD
photo upload
object storage
consent record
voice selection
avatar draft/publish status
```

Verification:

```bash
pnpm test avatars
pnpm test uploads
pnpm test permissions
```

## Milestone 3 - Python AI Runtime

Build:

```text
FastAPI service
runtime message endpoint
service-token auth
LLM answer generation
message persistence callback or direct API call
```

Verification:

```bash
pytest
ruff check .
mypy .
```

## Milestone 4 - First Talking Avatar

Build:

```text
TTS provider
D-ID/Tavus provider abstraction
video response generation
dashboard preview page
saved transcript
usage events
```

Verification:

```bash
pytest tests/providers
pnpm test runtime
```

## Milestone 5 - Knowledge Base

Build:

```text
FAQ source
PDF/text ingestion
embedding
vector search
grounded prompt
unknown-answer fallback
```

Verification:

```bash
pytest tests/retrieval
pytest tests/agents
```

## Milestone 6 - Widget

Build:

```text
widget bundle
script-tag embed
floating launcher
text question
video answer
lead capture
domain allowlist
```

Verification:

```bash
pnpm test widget
pnpm playwright test
```

## Milestone 7 - Voice

Build:

```text
browser recording
audio upload
STT
voice response
audio/video fallback
```

Verification:

```bash
pnpm playwright test voice
pytest tests/stt
```

## Milestone 8 - Realtime

Build:

```text
WebSocket session
partial events
streaming answer
stream provider integration
interrupt support
session traces
```

Verification:

```bash
pytest tests/realtime
pnpm playwright test realtime
```

---

# 25. Coding Rules for This Product

Use these rules across the codebase:

```text
No hardcoded provider logic inside route handlers
No avatar provider calls directly from React components
No business logic inside UI components
No unvalidated request payloads
No public widget calls without domain checks
No generated avatar without consent record
No answer generation without workspace/avatar lookup
No file upload without signed URL and content validation
No long-running media task inside frontend request lifecycle
No provider-specific fields leaking into public SDK contracts
```

---

# 26. The First Practical Build Order

Build in this exact order:

```text
1. Monorepo + database + auth + workspace
2. Avatar Studio draft flow
3. Photo upload + consent
4. Python runtime service
5. Text question -> AI answer
6. TTS audio generation
7. Avatar provider video generation
8. Save conversation/messages
9. Preview page
10. Knowledge FAQ ingestion
11. Widget script
12. Lead capture
13. Usage dashboard
14. Voice input
15. Realtime stream
```

This avoids getting stuck in the hardest media/realtime work before the product foundation exists.

---

# 27. MVP Acceptance Criteria

The MVP is complete when:

```text
A user can create a workspace.
A user can create an avatar.
A user can upload an avatar photo.
The system records consent.
A user can add business FAQs.
A user can ask the avatar a question in the dashboard.
The avatar answers using business knowledge.
The avatar response includes generated voice/video.
The conversation is saved.
A user can publish the avatar.
A user can embed the widget on another website.
A visitor can ask the widget a question.
The widget shows a talking avatar response.
The dashboard shows conversations, leads, and usage.
```

---

# 28. What Makes This Hard

The hard part is not building a dashboard.

The hard part is connecting all of this into one reliable product:

```text
multi-tenant SaaS
identity and consent
media upload pipeline
AI answer generation
business knowledge retrieval
TTS
avatar video/stream generation
conversation persistence
widget SDK
domain security
usage metering
fallback behavior
realtime voice
provider abstraction
future self-hosted avatar engines
```

This is exactly why the product is difficult even with AI coding. AI can generate isolated files, but this system requires correct architecture, boundaries, state management, cost control, media reliability, and a polished user experience.

[1]: https://docs.d-id.com/docs/quickstart?utm_source=chatgpt.com "Documentation - Quickstart - D-ID"
[2]: https://nextjs.org/docs/app?utm_source=chatgpt.com "Next.js Docs: App Router"
[3]: https://fastapi.tiangolo.com/advanced/websockets/?utm_source=chatgpt.com "WebSockets"
