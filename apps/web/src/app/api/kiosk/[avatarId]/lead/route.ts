import { revalidatePath } from "next/cache"
import { submitKioskLead } from "@/lib/lead"
import { KioskPublicError } from "@/lib/kiosk"
import {
  RateLimitExceededError,
  assertRateLimit,
  getRequestIp,
  rateLimitErrorPayload,
  rateLimitPolicies
} from "@/lib/rate-limit-policies"

export const dynamic = "force-dynamic"

type RouteParams = Promise<{ avatarId: string }>

function jsonResponse(payload: unknown, status: number) {
  return Response.json(payload, { status })
}

export async function POST(
  request: Request,
  { params }: { params: RouteParams }
) {
  const { avatarId } = await params
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
    await assertRateLimit(rateLimitPolicies.kioskLeadSubmit, [
      avatarId,
      getRequestIp(request)
    ])
    const result = await submitKioskLead(avatarId, request, body)
    const payload = body && typeof body === "object" ? body as Record<string, unknown> : {}
    const conversationId = String(payload.conversationId ?? "").trim()
    revalidatePath("/dashboard/leads")
    if (conversationId) {
      revalidatePath(`/dashboard/conversations/${conversationId}`)
    }
    return jsonResponse({
      status: "ok",
      ...result
    }, 200)
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return jsonResponse(rateLimitErrorPayload(error), 429)
    }

    if (error instanceof KioskPublicError) {
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
