import { AvatarStatus, RealtimeSessionChannel } from "@prisma/client"
import { fetchAvatarByIdAndWorkspace, isAvatarPublicRuntimeEligible } from "@/lib/avatar"
import {
  WidgetPublicError,
  assertWidgetDomainAllowed,
  buildWidgetCorsHeaders
} from "@/lib/widget"
import { prisma } from "@/lib/prisma"
import { startRealtimeSession } from "@/lib/realtime"

export const dynamic = "force-dynamic"

type RouteParams = Promise<{ avatarId: string }>

function jsonResponse(payload: unknown, status: number, origin: string | null) {
  return Response.json(payload, {
    status,
    headers: buildWidgetCorsHeaders(origin)
  })
}

function parseVisitorId(value: unknown): string | null {
  const visitorId = String(value ?? "").trim()
  if (visitorId && visitorId.length <= 120 && /^[a-zA-Z0-9_-]+$/.test(visitorId)) {
    return visitorId
  }

  return null
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
  const { avatarId } = await params
  const origin = request.headers.get("origin")
  let body: unknown = {}

  try {
    body = await request.json()
  } catch {
    body = {}
  }

  try {
    const avatarRow = await prisma.avatar.findUnique({
      where: { id: avatarId },
      select: { workspaceId: true }
    })

    if (!avatarRow) {
      throw new WidgetPublicError(404, "avatar_not_found", "Avatar was not found.")
    }

    const domainAccess = await assertWidgetDomainAllowed(avatarRow.workspaceId, request)
    const avatar = await fetchAvatarByIdAndWorkspace(avatarRow.workspaceId, avatarId)
    if (!avatar || !isAvatarPublicRuntimeEligible(avatar) || avatar.status === AvatarStatus.SUSPENDED) {
      throw new WidgetPublicError(404, "avatar_unavailable", "Avatar is not available for public widget use.")
    }

    const payload = body && typeof body === "object" ? body as Record<string, unknown> : {}
    const visitorId = parseVisitorId(payload.visitorId)
    const session = await startRealtimeSession({
      workspaceId: avatar.workspaceId,
      avatarId: avatar.id,
      channel: RealtimeSessionChannel.WIDGET,
      visitorId,
      metadata: {
        domain: domainAccess.domain,
        allowedByDevelopmentLocalhost: domainAccess.allowedByDevelopmentLocalhost
      }
    })

    return jsonResponse({
      status: "ok",
      sessionId: session.id,
      conversationId: session.conversationId,
      visitorId
    }, 200, origin)
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
      code: "realtime_session_failed",
      message: "Realtime widget session could not be started."
    }, 500, origin)
  }
}
