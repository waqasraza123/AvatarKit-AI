# Security

This document describes the Phase 26 security model. It does not claim compliance certification.

## Auth And Sessions

AvatarKit AI uses local credential auth with cookie-backed sessions. Dashboard routes resolve the current user through the session cookie and require active workspace membership before rendering workspace data.

Session cookies are HTTP-only and secure in production. Active workspace selection is stored separately and is revalidated against current memberships.

## Workspace Isolation

Workspace data access is scoped through server-side membership checks. Avatar, knowledge, conversation, lead, usage, billing, operations, agency, widget settings, kiosk settings, API key, and webhook reads/mutations must use the current workspace or a trusted workspace derived from published avatar/API key/domain state.

Public routes must not trust `workspaceId` from request bodies.

## Roles

Workspace roles are:

- `OWNER`
- `ADMIN`
- `OPERATOR`
- `VIEWER`

Mutation access generally requires `OPERATOR` or higher. API keys and webhooks require `ADMIN` or higher. Avatar suspension from safety/operations requires `OWNER` or `ADMIN`.

## API Keys

Public API keys are workspace-scoped, prefix-identifiable, hashed at rest, revocable, and shown only once. Public API routes require Bearer authentication and enforce scopes.

API keys do not grant dashboard or admin route access.

## Platform Admin

Platform admin is explicit and server-side only:

- `User.isPlatformAdmin` is the durable flag.
- `PLATFORM_ADMIN_EMAILS` is an explicit bootstrap/fallback list.
- Workspace `OWNER` does not become platform admin automatically.
- Public API keys never grant platform-admin access.
- Platform-admin routes must use `requirePlatformAdmin` or `assertPlatformAdmin`.

## Public API Security

Public API v1 derives workspace from the authenticated API key. Avatar access requires a published and public-runtime-eligible avatar. Conversation and lead endpoints are scoped to API-channel conversations in that same workspace.

Public API errors should be structured and safe. Runtime/provider stack traces and secrets must not be returned.

## Widget Security

Widget config, message, lead, realtime, and media endpoints derive workspace from the requested avatar and enforce published-avatar eligibility. Widget requests require domain allowlist checks outside local development.

Public widget config exposes only safe display fields, supported output modes, and plan-gated branding fields.

## Domain Allowlist

Allowed domains are normalized hostnames and unique per workspace. Production widget requests require at least one configured domain and matching Origin/Referer hostname.

## Admin Access Model

Workspace operations remain workspace-scoped. Platform-admin access is separate and must not be inferred from workspace role.

## Storage Privacy

Source photos and raw voice input are private dashboard assets. Dashboard asset preview requires an authenticated user with workspace membership.

Public widget generated media uses per-message media tokens. Public kiosk config does not expose private source-photo preview URLs.

## Media Handling

Photo uploads validate MIME type, size, and image dimensions. Voice input validates MIME type, size, and duration. Storage keys are constrained to safe relative paths under the configured storage root.

Generated provider-hosted widget video URLs are not returned publicly unless the video is copied into controlled storage.

## Consent And Identity Safety

Publishing requires current-photo consent tied to the latest valid source photo. Replacing/removing a source photo invalidates checklist readiness for prior consent.

Safety rules block or hand off impersonation, fake endorsements, public-figure misuse, and unsupported sensitive advice.

## Safety Events

Runtime, setup, and lead safety events store safe excerpts and sanitized metadata. They must not store hidden prompts, provider secrets, raw API keys, or large unsafe payloads.

## Audit Logging

Phase 26 writes high-value mutation events to `AuditLog` and keeps `RuntimeTrace` continuity for existing `audit.*` traces. Audit metadata must not include raw API keys, key hashes, provider secrets, session tokens, webhook secrets, hidden prompts, private provider payloads, or large unsafe payloads.

Audit-log UI surfaces show safe summaries only:

- `/admin/audit-log`
- `/dashboard/operations/audit-log`

## Billing Boundaries

Billing foundation is workspace-scoped and static. Payment provider secrets must never appear in UI. Checkout and portal flows are not production-ready in Phase 25.

## Known Gaps

- AuditLog append-only behavior is enforced by app logic, not cryptographic immutability.
- Rate limiting falls back to in-memory when Redis REST is missing or unavailable.
- Local file storage is the default.
- Webhook delivery worker is not implemented.
- Stripe provider integration is placeholder.
