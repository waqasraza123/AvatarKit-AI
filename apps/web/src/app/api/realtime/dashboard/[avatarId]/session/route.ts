import { AvatarStatus, RealtimeSessionChannel, WorkspaceRole } from "@prisma/client"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"
import { prisma } from "@/lib/prisma"
import { startRealtimeSession } from "@/lib/realtime"

export const dynamic = "force-dynamic"

type RouteParams = Promise<{ avatarId: string }>

export async function POST(
  _request: Request,
  { params }: { params: RouteParams }
) {
  const { avatarId } = await params
  const context = await getWorkspaceContextForRequest({
    nextPath: `/dashboard/avatars/${avatarId}/studio?step=preview`
  })

  if (!context) {
    return Response.json({ status: "error", message: "Authentication is required." }, { status: 401 })
  }

  if (!hasWorkspaceRole(context.workspaceMembership.role, WorkspaceRole.OPERATOR)) {
    return Response.json({ status: "error", message: "Viewer roles cannot start realtime preview sessions." }, { status: 403 })
  }

  const avatar = await prisma.avatar.findFirst({
    where: {
      id: avatarId,
      workspaceId: context.workspace.id
    },
    select: {
      id: true,
      status: true
    }
  })

  if (!avatar) {
    return Response.json({ status: "error", message: "Avatar does not exist in this workspace." }, { status: 404 })
  }

  if (avatar.status === AvatarStatus.SUSPENDED) {
    return Response.json({ status: "error", message: "Suspended avatars cannot start realtime sessions." }, { status: 400 })
  }

  const session = await startRealtimeSession({
    workspaceId: context.workspace.id,
    avatarId: avatar.id,
    channel: RealtimeSessionChannel.DASHBOARD_PREVIEW,
    metadata: {
      userId: context.user.id,
      role: context.workspaceMembership.role
    }
  })

  return Response.json({
    status: "ok",
    sessionId: session.id,
    conversationId: session.conversationId
  })
}
