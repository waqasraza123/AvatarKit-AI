# Data Governance

Phase 27 adds workspace data-governance records and dashboard workflows for export, retention inventory, and deletion-request scheduling.

## Surfaces

- `/dashboard/settings` links to data governance.
- `/dashboard/settings/data` shows workspace-scoped retained record counts.
- `/dashboard/settings/data` lets owners and admins create authenticated JSON exports.
- `/dashboard/settings/data` lets owners create and cancel workspace deletion requests.
- `/api/dashboard/data-exports/[exportId]/download` returns an authenticated JSON attachment for a valid, unexpired export.

## Data Model

- `WorkspaceDataExport` records export requests, scope, manifest, status, completion time, and expiration time.
- `WorkspaceDeletionRequest` records owner-requested deletion intent, status, reason, scheduled deletion time, cancellation, and completion fields.
- `WorkspaceExportStatus` is intentionally small: `COMPLETED`, `EXPIRED`, `FAILED`.
- `WorkspaceDeletionRequestStatus` is intentionally small: `PENDING`, `CANCELED`, `COMPLETED`.
- `AuditLogTargetType` includes `DATA_EXPORT` and `DELETION_REQUEST`.

## Roles

- `OWNER` and `ADMIN` can create and download workspace exports.
- `OWNER` can request and cancel workspace deletion.
- `OPERATOR` and `VIEWER` can view retained data counts through normal workspace access but cannot create exports or deletion requests.
- All reads remain scoped through workspace membership.

## Export Scope

Exports include:

- workspace identity
- members with user email/display name
- avatars, voices, safe asset metadata, and consent records
- knowledge sources and chunks
- conversations, messages, and runtime traces
- leads
- usage events
- safety events
- knowledge gaps
- realtime sessions
- widget, kiosk, domain, branding, client profile, and billing account settings
- API key prefix/name/scope metadata
- webhook endpoint URL/event/prefix metadata
- audit log metadata already sanitized by the audit layer

Exports do not include:

- password hashes
- session tokens
- API key hashes or raw keys
- webhook signing secret hashes or raw secrets
- provider secrets
- environment values
- private server-side runtime configuration

## Deletion Requests

Deletion requests do not delete data automatically in this phase.

The request records a scheduled deletion timestamp seven days out, captures an optional reason, and creates audit coverage. Actual destructive deletion requires a future approved worker or manual operator procedure after backup, legal hold, and billing/account-owner review.

## Limitations

- Export generation is synchronous and database-backed.
- Export files are not copied to object storage.
- Expiration is enforced at download time.
- There is no background job yet to mark expired exports or execute deletion requests.
- This is a product data-governance foundation, not a full compliance automation claim.

## Manual Verification

Owner should review schema changes, generate Prisma client, apply migration, and then verify:

- owner/admin can create an export from `/dashboard/settings/data`
- export downloads as JSON and omits secrets/hashes/tokens
- operator/viewer cannot create exports
- owner can request deletion by typing the workspace slug
- owner can cancel a pending deletion request
- admin/operator/viewer cannot request deletion
- audit log records export and deletion-request events
- cross-workspace export download attempts are blocked

