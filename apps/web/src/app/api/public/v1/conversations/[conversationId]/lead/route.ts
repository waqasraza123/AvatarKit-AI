import { revalidatePath } from "next/cache"
import {
  PublicApiError,
  authenticatePublicApiRequest,
  submitPublicApiLead
} from "@/lib/public-api"

export const dynamic = "force-dynamic"

type RouteParams = Promise<{ conversationId: string }>

function jsonResponse(payload: unknown, status: number) {
  return Response.json(payload, { status })
}

export async function POST(
  request: Request,
  { params }: { params: RouteParams }
) {
  const { conversationId } = await params
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
    const context = await authenticatePublicApiRequest(request, "leads:write")
    const lead = await submitPublicApiLead(context, conversationId, body)
    revalidatePath("/dashboard/leads")
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return jsonResponse({ status: "ok", ...lead }, 200)
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
      code: "lead_submit_failed",
      message: "Lead details could not be saved."
    }, 500)
  }
}
