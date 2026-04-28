# Phase 21 Admin Operations and Observability

Phase 21 makes AvatarKit easier to debug and operate in production without adding a separate platform-admin identity system.

## Scope

Phase 21 adds:

- workspace-scoped operations dashboard at `/dashboard/operations`
- operational metrics for runtime failures, provider failures, trace latency, safety events, widget failures, and usage spikes
- avatar search by name, display name, role, or use case
- avatar status filtering
- recent provider error trace inspection
- recent runtime failure inspection
- recent runtime trace inspection
- recent safety event inspection
- usage spike comparison against the previous matching time window
- owner/admin avatar suspend and unsuspend actions

Phase 21 does not add:

- global platform-admin accounts
- cross-workspace search
- provider retry queues
- queue infrastructure
- alert delivery
- webhooks for operational alerts
- external observability vendors
- hard billing or abuse enforcement

## Access Model

Operations data is available to workspace roles at or above `OPERATOR`.

Mutation actions are restricted:

- `OWNER` and `ADMIN` can suspend and unsuspend avatars.
- `OPERATOR` can inspect operations data but cannot suspend or unsuspend avatars.
- `VIEWER` cannot access operations data.

This follows the current workspace-scoped auth model. A later platform-admin phase can add cross-workspace operator identity if needed.

## Observability Source

Phase 21 uses existing durable tables:

- `RuntimeTrace`
- `SafetyEvent`
- `UsageEvent`
- `Avatar`
- `Conversation`

Provider errors are represented by failed `RuntimeTrace` rows that include provider-related event names or provider metadata. Existing runtime flows already store provider metadata for LLM, STT, TTS, and avatar video paths where available.

## Operations Dashboard

Route:

```text
/dashboard/operations
```

The page includes:

- summary metric cards
- search and filter controls
- avatar operational state table
- provider error table
- runtime failure table
- recent trace table
- safety event table
- usage spike list

Supported windows:

- `24h`
- `7d`
- `30d`

Usage spikes compare the selected current window with the immediately preceding same-length window. A spike appears when current usage is at least 2x the previous period or when a previously zero event type reaches meaningful activity.

## Avatar Suspension

Suspending an avatar from operations:

- requires `OWNER` or `ADMIN`
- reuses the safety suspension helper
- sets `Avatar.status = SUSPENDED`
- records a safety event
- records an operations runtime trace
- revalidates dashboard surfaces

Unsuspending an avatar:

- requires `OWNER` or `ADMIN`
- restores the most recent prior status captured in suspension metadata when available
- falls back to `DRAFT` when no restorable prior status exists
- records an operations runtime trace

Suspended avatars remain blocked by the existing public runtime eligibility checks.

## Manual Approval Checklist

Before approving Phase 21 manually:

1. Generate Prisma client if earlier schema phases have not been generated.
2. Open `/dashboard/operations` as `OWNER`, `ADMIN`, `OPERATOR`, and `VIEWER`.
3. Confirm `VIEWER` cannot access operations data.
4. Confirm `OPERATOR` can inspect but cannot suspend or unsuspend avatars.
5. Confirm `OWNER` or `ADMIN` can suspend an avatar.
6. Confirm a suspended avatar stops public usage through existing published-avatar checks.
7. Confirm unsuspend restores the prior status when suspension metadata exists.
8. Confirm runtime failures, provider errors, safety events, and usage spikes render from persisted data.

No automated verification was run for this implementation pass per the current instruction.
