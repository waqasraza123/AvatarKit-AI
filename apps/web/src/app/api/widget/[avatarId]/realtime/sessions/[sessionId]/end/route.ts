import { ConversationStatus, RealtimeSessionChannel, RealtimeSessionStatus, RuntimeTraceStatus } from "@prisma/client"
import { WidgetPublicError, assertWidgetDomainAllowed, buildWidgetCorsHeaders } from "@/lib/widget"
import { prisma } from "@/lib/prisma"
import {
  fetchActiveRealtimeSession,
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

    return jsonResponse({
      status: "error",
      code: "domain_check_failed",
      message: "Widget domain could not be validated."
    }, 403, origin)
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

  await updateRealtimeSessionState({
    sessionId,
    workspaceId: avatarRow.workspaceId,
    status: RealtimeSessionStatus.ENDED
  })

  if (session.conversationId) {
    await prisma.conversation.updateMany({
      where: {
        id: session.conversationId,
        workspaceId: avatarRow.workspaceId,
        status: ConversationStatus.ACTIVE
      },
      data: {
        status: ConversationStatus.ENDED,
        endedAt: new Date()
      }
    })
  }

  await recordRealtimeTrace({
    workspaceId: avatarRow.workspaceId,
    avatarId,
    conversationId: session.conversationId,
    eventType: "realtime.session.ended",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: { sessionId }
  })

  return jsonResponse({
    status: "ok",
    sessionId,
    realtimeStatus: "ended"
  }, 200, origin)
}
