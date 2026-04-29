import {
  PublicApiError,
  authenticatePublicApiRequest,
  getPublicAvatarConfig
} from "@/lib/public-api"
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
    const context = await authenticatePublicApiRequest(request, "avatars:read")
    await assertRateLimit(rateLimitPolicies.publicApiConfig, [
      context.workspaceId,
      context.apiKeyPrefix,
      avatarId,
      getRequestIp(request)
    ])
    const avatar = await getPublicAvatarConfig(context, avatarId)
    return jsonResponse({ status: "ok", avatar }, 200)
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return jsonResponse(rateLimitErrorPayload(error), 429)
    }

    if (error instanceof PublicApiError) {
      return jsonResponse({
        status: "error",
        code: error.code,
        message: error.message
      }, error.statusCode)
    }

    return jsonResponse({
      status: "error",
      code: "avatar_config_failed",
      message: "Avatar config could not be loaded."
    }, 500)
  }
}
