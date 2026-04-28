import { ConversationStatus, RealtimeSessionChannel, RealtimeSessionStatus, RuntimeTraceStatus, WorkspaceRole } from "@prisma/client"
import {
  fetchActiveRealtimeSession,
  recordRealtimeTrace,
  updateRealtimeSessionState
} from "@/lib/realtime"
import { prisma } from "@/lib/prisma"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"

export const dynamic = "force-dynamic"

type RouteParams = Promise<{ sessionId: string }>

export async function POST(
  _request: Request,
  { params }: { params: RouteParams }
) {
  const { sessionId } = await params
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard" })
  if (!context) {
    return Response.json({ status: "error", message: "Authentication is required." }, { status: 401 })
  }

  if (!hasWorkspaceRole(context.workspaceMembership.role, WorkspaceRole.OPERATOR)) {
    return Response.json({ status: "error", message: "Viewer roles cannot end realtime preview sessions." }, { status: 403 })
  }

  const session = await fetchActiveRealtimeSession({
    workspaceId: context.workspace.id,
    sessionId,
    channel: RealtimeSessionChannel.DASHBOARD_PREVIEW
  })

  if (!session) {
    return Response.json({ status: "error", message: "Realtime session is not active." }, { status: 404 })
  }

  await updateRealtimeSessionState({
    sessionId,
    workspaceId: context.workspace.id,
    status: RealtimeSessionStatus.ENDED
  })

  if (session.conversationId) {
    await prisma.conversation.updateMany({
      where: {
        id: session.conversationId,
        workspaceId: context.workspace.id,
        status: ConversationStatus.ACTIVE
      },
      data: {
        status: ConversationStatus.ENDED,
        endedAt: new Date()
      }
    })
  }

  await recordRealtimeTrace({
    workspaceId: context.workspace.id,
    avatarId: session.avatarId,
    conversationId: session.conversationId,
    eventType: "realtime.session.ended",
    status: RuntimeTraceStatus.SUCCESS,
    metadata: { sessionId }
  })

  return Response.json({
    status: "ok",
    sessionId,
    realtimeStatus: "ended"
  })
}
