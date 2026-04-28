import { MessageRole, RealtimeSessionChannel, RealtimeSessionStatus, RuntimeTraceStatus, WorkspaceRole } from "@prisma/client"
import { sendAvatarPreviewMessageAction } from "@/app/actions/avatars"
import {
  fetchActiveRealtimeSession,
  parseRealtimeMessagePayload,
  realtimeStreamResponse,
  recordRealtimeTrace,
  updateRealtimeSessionState
} from "@/lib/realtime"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"

export const dynamic = "force-dynamic"

type RouteParams = Promise<{ sessionId: string }>

function parseLeadCapture(metadata: Record<string, unknown> | null | undefined): { required: boolean; fields: string[]; promptText: string | null } {
  const leadCapture = metadata?.leadCapture
  if (!leadCapture || typeof leadCapture !== "object" || Array.isArray(leadCapture)) {
    return { required: false, fields: [], promptText: null }
  }

  const candidate = leadCapture as { required?: unknown; fields?: unknown; promptText?: unknown }
  return {
    required: candidate.required === true,
    fields: Array.isArray(candidate.fields) ? candidate.fields.map(item => String(item)).filter(Boolean) : [],
    promptText: typeof candidate.promptText === "string" ? candidate.promptText : null
  }
}

export async function POST(
  request: Request,
  { params }: { params: RouteParams }
) {
  const { sessionId } = await params
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard" })
  if (!context) {
    return Response.json({ status: "error", message: "Authentication is required." }, { status: 401 })
  }

  if (!hasWorkspaceRole(context.workspaceMembership.role, WorkspaceRole.OPERATOR)) {
    return Response.json({ status: "error", message: "Viewer roles cannot send realtime preview messages." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ status: "error", message: "Request body must be valid JSON." }, { status: 400 })
  }

  const payload = parseRealtimeMessagePayload(body)
  if (payload.message.length < 2) {
    return Response.json({ status: "error", message: "Enter at least two characters." }, { status: 400 })
  }

  const session = await fetchActiveRealtimeSession({
    workspaceId: context.workspace.id,
    sessionId,
    channel: RealtimeSessionChannel.DASHBOARD_PREVIEW
  })

  if (!session) {
    return Response.json({ status: "error", message: "Realtime session is not active." }, { status: 404 })
  }

  await recordRealtimeTrace({
    workspaceId: context.workspace.id,
    avatarId: session.avatarId,
    conversationId: session.conversationId,
    eventType: "realtime.message.received",
    status: RuntimeTraceStatus.STARTED,
    metadata: { sessionId }
  })

  return realtimeStreamResponse({
    workspaceId: context.workspace.id,
    avatarId: session.avatarId,
    conversationId: session.conversationId,
    sessionId,
    run: async send => {
      await send({ type: "avatar.status", status: "thinking", message: "Thinking" })

      const formData = new FormData()
      formData.set("avatarId", session.avatarId)
      formData.set("inputText", payload.message)
      formData.set("outputMode", payload.outputMode)
      if (session.conversationId) {
        formData.set("conversationId", session.conversationId)
      }

      const result = await sendAvatarPreviewMessageAction({
        status: "idle",
        conversation: null
      }, formData)

      const conversation = result.conversation ?? null
      const avatarMessage = conversation?.messages
        .filter(message => message.role === MessageRole.AVATAR)
        .at(-1) ?? null

      if (result.status === "error") {
        await recordRealtimeTrace({
          workspaceId: context.workspace.id,
          avatarId: session.avatarId,
          conversationId: conversation?.conversationId ?? session.conversationId,
          eventType: "realtime.fallback_used",
          status: RuntimeTraceStatus.FAILURE,
          metadata: {
            sessionId,
            reason: "dashboard_preview_message_failed"
          }
        })
        await send({
          type: "error",
          code: "dashboard_realtime_message_failed",
          message: result.message ?? "Realtime preview message failed."
        })
      }

      if (conversation?.conversationId) {
        await updateRealtimeSessionState({
          sessionId,
          workspaceId: context.workspace.id,
          status: RealtimeSessionStatus.ACTIVE,
          conversationId: conversation.conversationId
        })
      }

      await send({ type: "user.transcript.final", text: payload.message })
      await send({
        type: "avatar.answer.final",
        messageId: avatarMessage?.id ?? null,
        text: avatarMessage?.content ?? result.message ?? "",
        runtimeStatus: typeof avatarMessage?.metadata?.runtimeStatus === "string" ? avatarMessage.metadata.runtimeStatus : result.status
      })

      if (avatarMessage?.audioUrl) {
        await send({ type: "avatar.audio.ready", messageId: avatarMessage.id, audioUrl: avatarMessage.audioUrl })
      }

      if (avatarMessage?.videoUrl) {
        await send({ type: "avatar.video.ready", messageId: avatarMessage.id, videoUrl: avatarMessage.videoUrl })
      }

      const leadCapture = parseLeadCapture(avatarMessage?.metadata)
      if (leadCapture.required) {
        await send({
          type: "lead.capture.requested",
          fields: leadCapture.fields,
          promptText: leadCapture.promptText
        })
      }

      await send({ type: "avatar.status", status: "waiting", message: "Waiting" })
      await recordRealtimeTrace({
        workspaceId: context.workspace.id,
        avatarId: session.avatarId,
        conversationId: conversation?.conversationId ?? session.conversationId,
        eventType: "realtime.message.received",
        status: RuntimeTraceStatus.SUCCESS,
        metadata: { sessionId }
      })
    }
  })
}
