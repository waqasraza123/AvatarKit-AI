import {
  PublicApiError,
  authenticatePublicApiRequest,
  startPublicApiConversation
} from "@/lib/public-api"

export const dynamic = "force-dynamic"

function jsonResponse(payload: unknown, status: number) {
  return Response.json(payload, { status })
}

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return jsonResponse({
      status: "error",
      code: "invalid_json",
      message: "Request body must be valid JSON."
    }, 400)
  }

  try {
    const context = await authenticatePublicApiRequest(request, "conversations:write")
    const conversation = await startPublicApiConversation(context, body)
    return jsonResponse({ status: "ok", conversation }, 201)
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
      code: "conversation_start_failed",
      message: "Conversation could not be started."
    }, 500)
  }
}
