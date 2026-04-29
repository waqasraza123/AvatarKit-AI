import { KioskPublicError, startKioskSession } from "@/lib/kiosk"
import {
  RateLimitExceededError,
  rateLimitErrorPayload
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
  let body: unknown = {}

  try {
    const text = await request.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return jsonResponse({
      status: "error",
      code: "invalid_json",
      message: "Request body must be valid JSON."
    }, 400)
  }

  try {
    const result = await startKioskSession(avatarId, request, body)
    return jsonResponse(result, 200)
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
      code: "kiosk_session_failed",
      message: "Kiosk session could not be started."
    }, 500)
  }
}
