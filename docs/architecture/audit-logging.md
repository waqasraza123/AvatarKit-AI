# Audit Logging

Phase 26 adds a dedicated `AuditLog` model and sanitized audit helper for durable production controls. This is app-level append-only behavior: application code creates audit rows and does not expose update/delete audit-log actions.

## Platform Admin

- `User.isPlatformAdmin` is the durable platform-admin flag.
- `PLATFORM_ADMIN_EMAILS` is only a bootstrap/fallback for explicitly listed emails.
- Workspace `OWNER` does not imply platform-admin access.
- Public API keys do not grant platform-admin access.
- Platform-admin checks are server-side in `apps/web/src/lib/platform-admin.ts`.

## Model

`AuditLog` stores:

- optional `workspaceId`
- optional `actorUserId`
- `actorType`: `USER`, `PLATFORM_ADMIN`, `SYSTEM`, `API_KEY`
- `action`
- `targetType`: `WORKSPACE`, `AVATAR`, `CONVERSATION`, `MESSAGE`, `LEAD`, `SAFETY_EVENT`, `USAGE_EVENT`, `API_KEY`, `BILLING_SUBSCRIPTION`, `WEBHOOK`, `BRANDING`, `KIOSK_SETTINGS`, `DOMAIN_ALLOWLIST`, `ADMIN`, `SYSTEM`
- optional `targetId`
- optional sanitized `metadata`
- optional `ip`
- optional `userAgent`
- `createdAt`

## Helper Behavior

`apps/web/src/lib/audit.ts` provides:

- `recordAuditLog`
- `recordUserAuditLog`
- `recordPlatformAdminAuditLog`
- `recordApiKeyAuditLog`
- `recordMutationAuditEvent`
- `sanitizeAuditMetadata`

Normal user-flow audit writes fail safely and do not break the primary action. Platform-admin audit calls default to required writes. Existing mutation audit calls also keep `RuntimeTrace` continuity through `audit.*` trace events.

Metadata redaction removes or truncates values that look like raw API keys, key hashes, provider secrets, session tokens, webhook secrets, hidden prompts, credentials, cookies, signatures, or large unsafe payloads.

## Covered Paths

Phase 26 audit coverage includes:

- API key create and revoke
- webhook create and revoke
- avatar publish and unpublish
- avatar suspend and unsuspend from operations or safety
- avatar duplicate
- source photo upload/remove
- consent acceptance
- voice selection changes
- branding and white-label updates
- agency client profile updates
- kiosk settings enable/disable/update
- widget settings updates
- domain allowlist add/remove
- safety event review/status updates
- lead status updates

Deferred coverage:

- Billing checkout/subscription mutation audit remains deferred because production checkout and portal flows are not implemented.
- Webhook delivery attempt audit remains deferred because no delivery worker exists.

## UI

- `/admin/audit-log` is platform-admin only and can filter by action, actor type, target type, workspace, and recent window.
- `/dashboard/operations/audit-log` is workspace-scoped and available to workspace `OWNER` and `ADMIN`.
- Both surfaces show timestamp, action, actor type, actor user when available, target type/id, workspace context, and a safe metadata summary.
- Raw metadata blobs are not rendered.

## Non-Goals

Phase 26 does not add compliance certification, cryptographic immutability, external SIEM export, webhook delivery workers, billing checkout, custom domains, or future product modules.
