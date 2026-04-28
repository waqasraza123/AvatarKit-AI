import {
  PublicApiError,
  authenticatePublicApiRequest,
  getPublicApiConversationStatus
} from "@/lib/public-api"

export const dynamic = "force-dynamic"

type RouteParams = Promise<{ conversationId: string }>

function jsonResponse(payload: unknown, status: number) {
  return Response.json(payload, { status })
}

export async function GET(
  request: Request,
  { params }: { params: RouteParams }
) {
  const { conversationId } = await params

  try {
    const context = await authenticatePublicApiRequest(request, "conversations:read")
    const conversation = await getPublicApiConversationStatus(context, conversationId)
    return jsonResponse({ status: "ok", conversation }, 200)
  } catch (error) {
    if (error instanceof PublicApiError) {
      return jsonResponse({
        status: "error",
        code: error.code,
        message: error.message
      }, error.statusCode)
    }

    return jsonResponse({
      status: "error",
      code: "conversation_status_failed",
      message: "Conversation status could not be loaded."
    }, 500)
  }
}
