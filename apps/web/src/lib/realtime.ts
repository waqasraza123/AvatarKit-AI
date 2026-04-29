import {
  ConversationChannel,
  ConversationStatus,
  RealtimeSessionChannel,
  RealtimeSessionStatus,
  RuntimeTraceStatus,
  type Prisma
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { recordUsageEvent } from "@/lib/usage"

const realtimeSessionTtlMs = 30 * 60 * 1000
export const REALTIME_MESSAGE_MAX_LENGTH = 800

export const realtimeClientEventTypes = [
  "session.start",
  "session.end",
  "user.message.text",
  "user.message.audio",
  "ping"
] as const

export const realtimeServerEventTypes = [
  "session.started",
  "session.ended",
  "avatar.status",
  "user.transcript.final",
  "avatar.answer.partial",
  "avatar.answer.final",
  "avatar.audio.ready",
  "avatar.video.ready",
  "lead.capture.requested",
  "error",
  "pong"
] as const

export const realtimeStatusValues = [
  "idle",
  "listening",
  "transcribing",
  "thinking",
  "speaking",
  "waiting",
  "failed",
  "ended"
] as const

export type RealtimeStatusValue = (typeof realtimeStatusValues)[number]
export type RealtimeClientEventType = (typeof realtimeClientEventTypes)[number]
export type RealtimeServerEventType = (typeof realtimeServerEventTypes)[number]

export type RealtimeServerEvent =
  | { type: "session.started"; sessionId: string; conversationId: string | null; status: RealtimeStatusValue }
  | { type: "session.ended"; sessionId: string; status: RealtimeStatusValue }
  | { type: "avatar.status"; status: RealtimeStatusValue; message?: string | null }
  | { type: "user.transcript.final"; text: string }
  | { type: "avatar.answer.partial"; text: string }
  | { type: "avatar.answer.final"; messageId: string | null; text: string; runtimeStatus?: string | null }
  | { type: "avatar.audio.ready"; messageId: string | null; audioUrl: string }
  | { type: "avatar.video.ready"; messageId: string | null; videoUrl: string }
  | { type: "lead.capture.requested"; fields: string[]; promptText: string | null }
  | { type: "error"; code: string; message: string }
  | { type: "pong"; timestamp: string }

export class RealtimePublicError extends Error {
  statusCode: number
  code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

export function mapRealtimeChannelToConversationChannel(channel: RealtimeSessionChannel): ConversationChannel {
  if (channel === RealtimeSessionChannel.WIDGET) {
    return ConversationChannel.WIDGET
  }

  if (channel === RealtimeSessionChannel.API) {
    return ConversationChannel.API
  }

  return ConversationChannel.DASHBOARD_PREVIEW
}

export async function recordRealtimeTrace(input: {
  workspaceId: string
  avatarId?: string | null
  conversationId?: string | null
  eventType: string
  status: RuntimeTraceStatus
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  try {
    await prisma.runtimeTrace.create({
      data: {
        workspaceId: input.workspaceId,
        avatarId: input.avatarId ?? null,
        conversationId: input.conversationId ?? null,
        eventType: input.eventType,
        status: input.status,
        metadata: sanitizeJson(input.metadata)
      }
    })
  } catch {
    return
  }
}

function sanitizeJson(metadata: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (!metadata) {
    return undefined
  }

  return JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue
}

export async function startRealtimeSession(input: {
  workspaceId: string
  avatarId: string
  channel: RealtimeSessionChannel
  visitorId?: string | null
  conversationId?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<{ id: string; conversationId: string | null }> {
  const now = new Date()
  const conversationChannel = mapRealtimeChannelToConversationChannel(input.channel)
  const conversationId = input.conversationId ?? (await prisma.conversation.create({
    data: {
      workspaceId: input.workspaceId,
      avatarId: input.avatarId,
      visitorId: input.visitorId ?? null,
      channel: conversationChannel,
      status: ConversationStatus.ACTIVE
    },
    select: { id: true }
  })).id

  const session = await prisma.realtimeSession.create({
    data: {
      workspaceId: input.workspaceId,
      avatarId: input.avatarId,
      conversationId,
      channel: input.channel,
      status: RealtimeSessionStatus.ACTIVE,
      visitorId: input.visitorId ?? null,
      startedAt: now,
      lastEventAt: now,
      metadata: sanitizeJson(input.metadata)
    },
    select: {
      id: true,
      conversationId: true
    }
  })

  await recordRealtimeTrace({
    workspaceId: input.workspaceId,
    avatarId: input.avatarId,
    conversationId,
    eventType: "realtime.session.started",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: {
      sessionId: session.id,
      channel: input.channel
    }
  })

  await recordUsageEvent({
    workspaceId: input.workspaceId,
    avatarId: input.avatarId,
    conversationId,
    eventType: "realtime.session.started",
    quantity: 1,
    unit: "count",
    metadata: {
      sessionId: session.id,
      channel: input.channel
    },
    idempotencyKey: `realtime-session-started:${session.id}`
  })

  return session
}

export async function fetchActiveRealtimeSession(input: {
  workspaceId: string
  sessionId: string
  avatarId?: string | null
  channel?: RealtimeSessionChannel | null
}): Promise<{
  id: string
  workspaceId: string
  avatarId: string
  conversationId: string | null
  channel: RealtimeSessionChannel
  status: RealtimeSessionStatus
  visitorId: string | null
} | null> {
  const session = await prisma.realtimeSession.findFirst({
    where: {
      id: input.sessionId,
      workspaceId: input.workspaceId,
      avatarId: input.avatarId ?? undefined,
      channel: input.channel ?? undefined,
      status: RealtimeSessionStatus.ACTIVE
    },
    select: {
      id: true,
      workspaceId: true,
      avatarId: true,
      conversationId: true,
      channel: true,
      status: true,
      visitorId: true,
      lastEventAt: true,
      startedAt: true
    }
  })

  if (!session) {
    return null
  }

  const activityAt = session.lastEventAt ?? session.startedAt

  if (Date.now() - activityAt.getTime() > realtimeSessionTtlMs) {
    await prisma.realtimeSession.updateMany({
      where: {
        id: session.id,
        workspaceId: session.workspaceId,
        status: RealtimeSessionStatus.ACTIVE
      },
      data: {
        status: RealtimeSessionStatus.EXPIRED,
        endedAt: new Date(),
        lastEventAt: new Date()
      }
    })
    await recordRealtimeTrace({
      workspaceId: session.workspaceId,
      avatarId: session.avatarId,
      conversationId: session.conversationId,
      eventType: "realtime.session.expired",
      status: RuntimeTraceStatus.SUCCESS,
      metadata: { sessionId: session.id }
    })

    return null
  }

  return {
    id: session.id,
    workspaceId: session.workspaceId,
    avatarId: session.avatarId,
    conversationId: session.conversationId,
    channel: session.channel,
    status: session.status,
    visitorId: session.visitorId
  }
}

export async function updateRealtimeSessionState(input: {
  sessionId: string
  workspaceId: string
  status?: RealtimeSessionStatus
  conversationId?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  await prisma.realtimeSession.updateMany({
    where: {
      id: input.sessionId,
      workspaceId: input.workspaceId
    },
    data: {
      status: input.status,
      conversationId: input.conversationId ?? undefined,
      endedAt: input.status === RealtimeSessionStatus.ENDED || input.status === RealtimeSessionStatus.FAILED || input.status === RealtimeSessionStatus.EXPIRED ? new Date() : undefined,
      lastEventAt: new Date(),
      metadata: input.metadata ? sanitizeJson(input.metadata) : undefined
    }
  })
}

export function parseRealtimeMessagePayload(body: unknown): {
  message: string
  outputMode: "text" | "audio" | "video"
} {
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const message = String(payload.message ?? payload.text ?? "").trim()
  const outputMode = payload.outputMode === "audio" || payload.outputMode === "video" ? payload.outputMode : "text"

  return { message, outputMode }
}

export function realtimeStreamResponse(input: {
  workspaceId: string
  avatarId: string
  conversationId?: string | null
  sessionId: string
  run: (send: (event: RealtimeServerEvent) => Promise<void>) => Promise<void>
}): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      async function send(event: RealtimeServerEvent): Promise<void> {
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`))
        await recordRealtimeTrace({
          workspaceId: input.workspaceId,
          avatarId: input.avatarId,
          conversationId: input.conversationId ?? null,
          eventType: "realtime.event.sent",
          status: RuntimeTraceStatus.SUCCESS,
          metadata: {
            sessionId: input.sessionId,
            eventType: event.type
          }
        })
        await recordUsageEvent({
          workspaceId: input.workspaceId,
          avatarId: input.avatarId,
          conversationId: input.conversationId ?? null,
          eventType: "realtime.event.sent",
          quantity: 1,
          unit: "count",
          metadata: {
            sessionId: input.sessionId,
            eventType: event.type
          },
          idempotencyKey: `realtime-event:${input.sessionId}:${event.type}:${Date.now()}:${Math.random().toString(16).slice(2)}`
        })
      }

      try {
        await input.run(send)
      } catch {
        await send({
          type: "error",
          code: "realtime_stream_failed",
          message: "Realtime message could not be processed."
        })
        await updateRealtimeSessionState({
          sessionId: input.sessionId,
          workspaceId: input.workspaceId,
          status: RealtimeSessionStatus.FAILED
        })
        await recordRealtimeTrace({
          workspaceId: input.workspaceId,
          avatarId: input.avatarId,
          conversationId: input.conversationId ?? null,
          eventType: "realtime.connection.failed",
          status: RuntimeTraceStatus.FAILURE,
          metadata: { sessionId: input.sessionId }
        })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    }
  })
}
