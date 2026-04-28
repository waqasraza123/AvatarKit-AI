# Phase 19 Public API and SDK

Phase 19 exposes a developer-facing integration layer for published avatars.

## Setup

Generate Prisma client after applying the Phase 19 schema migration:

```bash
pnpm db:generate
pnpm db:migrate
```

The schema adds:

- `ApiKey`
- `WebhookEndpoint`
- API runtime safety source
- API runtime knowledge gap source

## Dashboard

Developer settings are available at:

```text
/dashboard/developers
```

Owners and admins can:

- create API keys
- revoke API keys
- register webhook endpoints
- revoke webhook endpoints

Viewers and operators can inspect developer settings but cannot create or revoke credentials.

API keys are shown once at creation. The database stores only:

- key prefix
- SHA-256 key hash
- scopes
- creation metadata
- revocation metadata
- last-used timestamp

Webhook signing secrets are also shown once. The database stores:

- endpoint URL
- selected events
- signing secret prefix
- signing secret hash
- creation metadata
- revocation metadata
- delivery timestamp placeholder

## Public API Authentication

Requests must include a Bearer token:

```http
Authorization: Bearer avk_live_<prefix>_<secret>
```

Invalid, malformed, revoked, or cross-workspace keys return structured errors:

```json
{
  "status": "error",
  "code": "invalid_api_key",
  "message": "API key is invalid or revoked."
}
```

Current scopes:

- `avatars:read`
- `conversations:write`
- `conversations:read`
- `leads:write`

Scopes are stored as an array so future least-privilege keys can be introduced without changing the route contract.

## Endpoints

### Get Avatar Config

```http
GET /api/public/v1/avatars/:avatarId/config
```

Returns safe public configuration for a published, runtime-eligible avatar in the API key workspace.

Phase 19 advertises `text` as the only public API output mode. Audio and video remain available through internal runtime paths until a media delivery contract is added to the public API.

### Start Conversation

```http
POST /api/public/v1/conversations
Content-Type: application/json
```

```json
{
  "avatarId": "avatar_id",
  "visitorId": "optional_external_user_id",
  "summary": "optional session note"
}
```

Creates a `ConversationChannel.API` conversation.

### Send Message

```http
POST /api/public/v1/conversations/:conversationId/messages
Content-Type: application/json
```

```json
{
  "message": "What services do you offer?",
  "outputMode": "text"
}
```

The route:

- validates workspace and conversation ownership
- persists visitor and avatar messages
- calls the existing private runtime path
- records usage events
- records runtime safety events
- records knowledge gaps when runtime output indicates missing knowledge
- records runtime traces

Phase 19 public API v1 returns text responses. The response shape includes `audioUrl` and `videoUrl` as nullable fields so future media-capable API responses can extend the behavior without changing the SDK contract.

### Fetch Conversation Status

```http
GET /api/public/v1/conversations/:conversationId
```

Returns status and message count for API-channel conversations owned by the key workspace.

### Submit Lead

```http
POST /api/public/v1/conversations/:conversationId/lead
Content-Type: application/json
```

```json
{
  "name": "Pat Smith",
  "email": "pat@example.com",
  "phone": "+15551234567",
  "message": "Please follow up tomorrow."
}
```

Lead submission reuses the central lead validation and safety checks. It creates or updates one primary lead for the conversation with `LeadSource.API`.

## SDK

The first React SDK package lives in:

```text
packages/sdk
```

Import shape:

```tsx
import { AvatarKitProvider, TalkingAvatar } from "@avatarkit/sdk"

export function Page() {
  return (
    <AvatarKitProvider apiBaseUrl="/api/avatar-proxy" credentials="include">
      <TalkingAvatar avatarId="avatar_id" />
    </AvatarKitProvider>
  )
}
```

Lower-level hook:

```tsx
const session = useAvatarSession("avatar_id")
await session.start()
await session.sendMessage("Hello")
await session.submitLead({ email: "pat@example.com" })
```

The SDK exposes `AvatarKitClient`, `AvatarKitProvider`, `useAvatarKit`, `useAvatarSession`, `TalkingAvatar`, and typed avatar config, conversation, message, lead, and error shapes.

Do not ship raw `avk_live_...` secrets to browsers. Use `apiKey` only from trusted server-side code, scripts, or private integration services. Browser React apps should point `apiBaseUrl` at an application-owned proxy that injects the API key server-side, or provide `authTokenProvider` only when it returns a short-lived server-issued token.

## Webhook Signing

Webhook endpoint registration is available in the dashboard.

Phase 19 defines initial event names:

- `conversation.started`
- `conversation.ended`
- `lead.created`
- `handoff.requested`
- `avatar.failed`
- `safety.flagged`

Webhook signatures use an HMAC-SHA256 format:

```text
x-avatarkit-signature: t=<unix_timestamp>,v1=<hex_digest>
```

The signed payload is:

```text
<unix_timestamp>.<raw_json_body>
```

Delivery workers are intentionally deferred; Phase 19 establishes endpoint registration, signing semantics, and data ownership.

## Security Boundaries

- API keys are workspace-scoped.
- API keys are never stored in plaintext.
- Public API routes only operate on published, runtime-eligible avatars.
- Public API routes do not bypass safety, usage, runtime trace, or knowledge gap recording.
- API conversations use `ConversationChannel.API`, not widget channels.
- Domain allowlists remain widget-specific.
- Provider credentials stay private to the runtime service path.

## Manual Review Checklist

- Create an API key as owner/admin and confirm the raw key is shown once.
- Confirm the key list only shows prefixes and metadata.
- Revoke the key and confirm API requests fail.
- Register a webhook endpoint and confirm the signing secret is shown once.
- Call the public config endpoint with a valid key.
- Start an API conversation for a published avatar.
- Send a message and confirm messages are visible in dashboard conversations.
- Submit a lead and confirm it appears in dashboard leads with source `API`.

## Non-Goals

- No billing enforcement.
- No public arbitrary avatar creation.
- No public knowledge source mutation.
- No webhook delivery worker.
- No CRM integration.
- No public media asset token service for API-channel media.
- No browser-safe public key mode; SDK keys must be treated as server-issued integration credentials in Phase 19.
