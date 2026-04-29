import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitPolicyFromEnv,
  type RateLimitPolicy,
  type RateLimitResult
} from "@/lib/rate-limit"

export class RateLimitExceededError extends Error {
  result: RateLimitResult

  constructor(result: RateLimitResult) {
    super("Too many requests. Please try again shortly.")
    this.result = result
  }
}

export const rateLimitPolicies = {
  publicApiConfig: rateLimitPolicyFromEnv("publicApiConfig", { limit: 120, windowMs: 60_000 }, "RATE_LIMIT_PUBLIC_API_CONFIG"),
  publicApiConversation: rateLimitPolicyFromEnv("publicApiConversation", { limit: 40, windowMs: 60_000 }, "RATE_LIMIT_PUBLIC_API_CONVERSATION"),
  publicApiMessage: rateLimitPolicyFromEnv("publicApiMessage", { limit: 60, windowMs: 60_000 }, "RATE_LIMIT_PUBLIC_API_MESSAGE"),
  publicApiLeadSubmit: rateLimitPolicyFromEnv("publicApiLeadSubmit", { limit: 20, windowMs: 60_000 }, "RATE_LIMIT_LEAD_SUBMIT"),
  widgetConfig: rateLimitPolicyFromEnv("widgetConfig", { limit: 120, windowMs: 60_000 }, "RATE_LIMIT_WIDGET_CONFIG"),
  widgetMessage: rateLimitPolicyFromEnv("widgetMessage", { limit: 30, windowMs: 60_000 }, "RATE_LIMIT_WIDGET_MESSAGE"),
  widgetLeadSubmit: rateLimitPolicyFromEnv("widgetLeadSubmit", { limit: 20, windowMs: 60_000 }, "RATE_LIMIT_LEAD_SUBMIT"),
  widgetRealtimeSessionStart: rateLimitPolicyFromEnv("widgetRealtimeSessionStart", { limit: 20, windowMs: 60_000 }, "RATE_LIMIT_REALTIME_SESSION"),
  kioskConfig: rateLimitPolicyFromEnv("kioskConfig", { limit: 120, windowMs: 60_000 }, "RATE_LIMIT_KIOSK_CONFIG"),
  kioskSessionStart: rateLimitPolicyFromEnv("kioskSessionStart", { limit: 30, windowMs: 60_000 }, "RATE_LIMIT_KIOSK_SESSION"),
  kioskMessage: rateLimitPolicyFromEnv("kioskMessage", { limit: 60, windowMs: 60_000 }, "RATE_LIMIT_KIOSK_MESSAGE"),
  kioskLeadSubmit: rateLimitPolicyFromEnv("kioskLeadSubmit", { limit: 20, windowMs: 60_000 }, "RATE_LIMIT_LEAD_SUBMIT"),
  authAttempt: rateLimitPolicyFromEnv("authAttempt", { limit: 20, windowMs: 60_000 }, "RATE_LIMIT_AUTH_ATTEMPT"),
  apiKeyCreate: rateLimitPolicyFromEnv("apiKeyCreate", { limit: 10, windowMs: 60_000 }, "RATE_LIMIT_API_KEY_CREATE")
} satisfies Record<string, RateLimitPolicy>

export function getRequestIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
}

export async function assertRateLimit(policy: RateLimitPolicy, parts: Array<string | number | null | undefined>): Promise<RateLimitResult> {
  const result = await consumeRateLimit(policy, buildRateLimitKey([policy.name, ...parts]))
  if (!result.allowed) {
    throw new RateLimitExceededError(result)
  }

  return result
}

export function rateLimitErrorPayload(error: RateLimitExceededError) {
  return {
    error: {
      code: "rate_limited",
      message: "Too many requests. Please try again shortly.",
      retryAfterSeconds: error.result.retryAfterSeconds ?? Math.max(1, Math.ceil((error.result.resetAt.getTime() - Date.now()) / 1000))
    }
  }
}
