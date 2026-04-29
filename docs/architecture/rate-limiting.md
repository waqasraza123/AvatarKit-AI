# Rate Limiting

Phase 26 centralizes rate limiting in:

- `apps/web/src/lib/rate-limit.ts`
- `apps/web/src/lib/rate-limit-policies.ts`

## Provider Behavior

`RATE_LIMIT_PROVIDER=memory` uses an in-process memory provider. This is suitable for local/manual checks and single-process development only.

`RATE_LIMIT_PROVIDER=redis-rest`, `redis`, or `upstash` selects Redis REST only when one of these pairs is configured:

- `REDIS_REST_URL` and `REDIS_REST_TOKEN`
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

If Redis REST configuration is missing or a Redis REST request fails, the helper falls back to memory. The app does not perform fake Redis verification or claim live connectivity.

Rate-limit results include:

- `allowed`
- `limit`
- `remaining`
- `resetAt`
- optional `retryAfterSeconds`
- internal `provider`

The provider is not exposed to public users.

## Public Error Shape

Public rate-limit failures use:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Too many requests. Please try again shortly.",
    "retryAfterSeconds": 30
  }
}
```

Widget and kiosk clients read the nested error message and display friendly fallback copy.

## Policies

Phase 26 defines moderate defaults for:

- `publicApiConfig`
- `publicApiConversation`
- `publicApiMessage`
- `publicApiLeadSubmit`
- `widgetConfig`
- `widgetMessage`
- `widgetLeadSubmit`
- `widgetRealtimeSessionStart`
- `kioskConfig`
- `kioskSessionStart`
- `kioskMessage`
- `kioskLeadSubmit`
- `authAttempt`
- `apiKeyCreate`

Primary env overrides:

- `RATE_LIMIT_PUBLIC_API_MESSAGE_MAX`
- `RATE_LIMIT_PUBLIC_API_MESSAGE_WINDOW_MS`
- `RATE_LIMIT_WIDGET_MESSAGE_MAX`
- `RATE_LIMIT_WIDGET_MESSAGE_WINDOW_MS`
- `RATE_LIMIT_LEAD_SUBMIT_MAX`
- `RATE_LIMIT_LEAD_SUBMIT_WINDOW_MS`
- `RATE_LIMIT_REALTIME_SESSION_MAX`
- `RATE_LIMIT_REALTIME_SESSION_WINDOW_MS`

Additional policy-specific envs are listed in `.env.example`.

## Applied Surfaces

Rate limits are applied to:

- public API avatar config
- public API conversation start/status
- public API conversation messages
- public API lead submission
- widget config
- widget messages
- widget lead submission
- widget realtime session start
- kiosk config
- kiosk session start
- kiosk messages
- kiosk lead submission
- sign-in/sign-up attempts
- API key creation

## Non-Goals

Phase 26 does not add distributed queueing, bot detection, CAPTCHA, hard billing enforcement, global abuse dashboards, provider health probes, or Redis connectivity verification.
