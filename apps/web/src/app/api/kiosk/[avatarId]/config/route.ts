import { KioskPublicError, getPublicKioskConfig } from "@/lib/kiosk"
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

export async function GET(
  request: Request,
  { params }: { params: RouteParams }
) {
  const { avatarId } = await params

  try {
    await assertRateLimit(rateLimitPolicies.kioskConfig, [
      avatarId,
      getRequestIp(request)
    ])
    const config = await getPublicKioskConfig(avatarId)
    return jsonResponse(config, 200)
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
      code: "kiosk_config_failed",
      message: "Kiosk config could not be loaded."
    }, 500)
  }
}
