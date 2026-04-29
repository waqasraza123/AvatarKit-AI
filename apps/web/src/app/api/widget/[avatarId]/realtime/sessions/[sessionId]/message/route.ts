import { RealtimeSessionChannel, RealtimeSessionStatus, RuntimeTraceStatus } from "@prisma/client"
import {
  WidgetPublicError,
  assertWidgetDomainAllowed,
  buildWidgetCorsHeaders,
  processWidgetMessage
} from "@/lib/widget"
import { prisma } from "@/lib/prisma"
import {
  fetchActiveRealtimeSession,
  REALTIME_MESSAGE_MAX_LENGTH,
  parseRealtimeMessagePayload,
  realtimeStreamResponse,
  recordRealtimeTrace,
  updateRealtimeSessionState
} from "@/lib/realtime"

export const dynamic = "force-dynamic"

type RouteParams = Promise<{ avatarId: string; sessionId: string }>

function jsonResponse(payload: unknown, status: number, origin: string | null) {
  return Response.json(payload, {
    status,
    headers: buildWidgetCorsHeaders(origin)
  })
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: buildWidgetCorsHeaders(request.headers.get("origin"))
  })
}

export async function POST(
  request: Request,
  { params }: { params: RouteParams }
) {
  const { avatarId, sessionId } = await params
  const origin = request.headers.get("origin")
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return jsonResponse({
      status: "error",
      code: "invalid_json",
      message: "Request body must be valid JSON."
    }, 400, origin)
  }

  const payload = parseRealtimeMessagePayload(body)
  if (payload.message.length < 2) {
    return jsonResponse({
      status: "error",
      code: "message_too_short",
      message: "Enter at least two characters."
    }, 400, origin)
  }

  if (payload.message.length > REALTIME_MESSAGE_MAX_LENGTH) {
    return jsonResponse({
      status: "error",
      code: "message_too_long",
      message: `Message must be ${REALTIME_MESSAGE_MAX_LENGTH} characters or fewer.`
    }, 400, origin)
  }

  const avatarRow = await prisma.avatar.findUnique({
    where: { id: avatarId },
    select: { workspaceId: true }
  })

  if (!avatarRow) {
    return jsonResponse({
      status: "error",
      code: "avatar_not_found",
      message: "Avatar was not found."
    }, 404, origin)
  }

  try {
    await assertWidgetDomainAllowed(avatarRow.workspaceId, request)
  } catch (error) {
    if (error instanceof WidgetPublicError) {
      return jsonResponse({
        status: "error",
        code: error.code,
        message: error.message
      }, error.statusCode, origin)
    }

    throw error
  }

  const session = await fetchActiveRealtimeSession({
    workspaceId: avatarRow.workspaceId,
    avatarId,
    sessionId,
    channel: RealtimeSessionChannel.WIDGET
  })

  if (!session) {
    return jsonResponse({
      status: "error",
      code: "realtime_session_inactive",
      message: "Realtime session is not active."
    }, 404, origin)
  }

  await recordRealtimeTrace({
    workspaceId: avatarRow.workspaceId,
    avatarId,
    conversationId: session.conversationId,
    eventType: "realtime.message.received",
    status: RuntimeTraceStatus.STARTED,
    metadata: { sessionId }
  })

  const response = realtimeStreamResponse({
    workspaceId: avatarRow.workspaceId,
    avatarId,
    conversationId: session.conversationId,
    sessionId,
    run: async send => {
      await send({ type: "avatar.status", status: "thinking", message: "Thinking" })
      try {
        const result = await processWidgetMessage(avatarId, request, {
          message: payload.message,
          conversationId: session.conversationId ?? "",
          visitorId: session.visitorId ?? "",
          outputMode: payload.outputMode
        })

        await updateRealtimeSessionState({
          sessionId,
          workspaceId: avatarRow.workspaceId,
          status: RealtimeSessionStatus.ACTIVE,
          conversationId: result.conversationId
        })

        await send({ type: "user.transcript.final", text: payload.message })
        await send({
          type: "avatar.answer.final",
          messageId: result.avatarMessage.id,
          text: result.avatarMessage.content,
          runtimeStatus: result.avatarMessage.runtimeStatus
        })

        if (result.avatarMessage.audioUrl) {
          await send({ type: "avatar.audio.ready", messageId: result.avatarMessage.id, audioUrl: result.avatarMessage.audioUrl })
        }

        if (result.avatarMessage.videoUrl) {
          await send({ type: "avatar.video.ready", messageId: result.avatarMessage.id, videoUrl: result.avatarMessage.videoUrl })
        }

        if (result.avatarMessage.leadCapture.required) {
          await send({
            type: "lead.capture.requested",
            fields: result.avatarMessage.leadCapture.fields,
            promptText: result.avatarMessage.leadCapture.promptText
          })
        }

        await send({ type: "avatar.status", status: "waiting", message: "Waiting" })
        await recordRealtimeTrace({
          workspaceId: avatarRow.workspaceId,
          avatarId,
          conversationId: result.conversationId,
          eventType: "realtime.message.received",
          status: RuntimeTraceStatus.SUCCESS,
          metadata: { sessionId }
        })
      } catch (error) {
        if (error instanceof WidgetPublicError) {
          await recordRealtimeTrace({
            workspaceId: avatarRow.workspaceId,
            avatarId,
            conversationId: session.conversationId,
            eventType: "realtime.fallback_used",
            status: RuntimeTraceStatus.FAILURE,
            metadata: {
              sessionId,
              reason: error.code
            }
          })
          await send({
            type: "error",
            code: error.code,
            message: error.message
          })
          return
        }

        throw error
      }
    }
  })

  for (const [key, value] of Object.entries(buildWidgetCorsHeaders(origin))) {
    response.headers.set(key, value)
  }

  return response
}
