import { revalidatePath } from "next/cache"
import { submitWidgetLead } from "@/lib/lead"
import {
  WidgetPublicError,
  buildWidgetCorsHeaders,
  getPublicWidgetConfig
} from "@/lib/widget"

export const dynamic = "force-dynamic"

type RouteParams = Promise<{ avatarId: string }>

function jsonResponse(payload: unknown, status: number, origin: string | null) {
  return Response.json(payload, {
    status,
    headers: buildWidgetCorsHeaders(origin)
  })
}

export async function OPTIONS(
  request: Request,
  { params }: { params: RouteParams }
) {
  const { avatarId } = await params
  const origin = request.headers.get("origin")
  try {
    await getPublicWidgetConfig(avatarId, request)
    return new Response(null, {
      status: 204,
      headers: buildWidgetCorsHeaders(origin)
    })
  } catch (error) {
    const status = error instanceof WidgetPublicError ? error.statusCode : 403
    return new Response(null, {
      status,
      headers: buildWidgetCorsHeaders(origin)
    })
  }
}

export async function POST(
  request: Request,
  { params }: { params: RouteParams }
) {
  const { avatarId } = await params
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

  try {
    const result = await submitWidgetLead(avatarId, request, body)
    const payload = body && typeof body === "object" ? body as Record<string, unknown> : {}
    const conversationId = String(payload.conversationId ?? "").trim()
    revalidatePath("/dashboard/leads")
    if (conversationId) {
      revalidatePath(`/dashboard/conversations/${conversationId}`)
    }
    return jsonResponse({
      status: "ok",
      ...result
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
      code: "lead_submit_failed",
      message: "Lead details could not be saved."
    }, 500, origin)
  }
}
