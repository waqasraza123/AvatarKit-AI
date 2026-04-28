# Phase 20 Billing Foundation

Phase 20 prepares AvatarKit for paid usage without adding payment processing, checkout, invoices, or hard billing enforcement.

## Scope

Phase 20 adds:

- billing account data model foundation
- static plan definitions and limit configuration
- `/dashboard/billing`
- current-month usage mapping to plan limits
- soft warnings when usage approaches or exceeds limits
- upgrade and billing history placeholders

Phase 20 does not add:

- Stripe or any other payment provider
- checkout sessions
- invoices
- payment methods
- customer portal links
- automatic plan changes
- hard runtime blocking
- plan-based feature gates

## Data Model

The Prisma schema now includes:

- `BillingAccount`
- `BillingPlan`
- `BillingStatus`

`BillingAccount` is workspace-scoped through a unique `workspaceId` relation. It stores the current plan, billing status, optional billing email, optional future provider identifiers, optional current period boundaries, and cancel-at-period-end state.

If a workspace has no `BillingAccount`, the application treats it as `FREE` and `ACTIVE`. This keeps existing workspaces functional until a migration/backfill creates explicit billing rows.

## Plan Configuration

Plan limits are defined in:

```text
apps/web/src/lib/billing.ts
```

Supported plans:

- `FREE`
- `STARTER`
- `GROWTH`
- `AGENCY`
- `ENTERPRISE`

Configured limits:

- avatars
- monthly conversations
- monthly video minutes
- monthly voice minutes
- knowledge sources
- team members
- widget domains
- API keys

`ENTERPRISE` uses `null` limits to represent custom contract limits.

## Usage Mapping

The billing dashboard maps live workspace data to limits:

- avatars: count of workspace avatars
- monthly conversations: count of conversations created in the current calendar month
- monthly video minutes: `avatar.video.seconds` usage events divided by 60
- monthly voice minutes: `stt.seconds` usage events divided by 60
- knowledge sources: non-archived knowledge sources
- team members: workspace members
- widget domains: allowed domains
- API keys: non-revoked API keys

The current billing period defaults to the current calendar month. If a future payment provider writes explicit period boundaries to `BillingAccount`, the dashboard uses those boundaries for usage mapping and display.

## Billing Screen

Route:

```text
/dashboard/billing
```

The page shows:

- current plan
- billing status
- current period
- current-month usage mapped to plan limits
- near-limit and over-limit warnings
- available plan comparison
- disabled upgrade placeholder
- billing history placeholder

All data is scoped to the active workspace through the existing dashboard workspace context.

## Soft Warnings

Limit rows have four states:

- `ok`
- `near_limit`
- `over_limit`
- `unlimited`

Usage at or above 80% of a finite limit is marked `near_limit`. Usage above the finite limit is marked `over_limit`.

Phase 20 only displays warnings. It does not block avatar creation, publish, runtime responses, media generation, or API access.

## Manual Approval Checklist

Before approving Phase 20 manually:

1. Generate Prisma client after applying the schema migration.
2. Create or backfill `BillingAccount` rows for existing workspaces if desired.
3. Open `/dashboard/billing` as a workspace member.
4. Confirm workspaces without a billing account show the Free plan.
5. Confirm current-month conversations and usage-derived minutes match dashboard usage data.
6. Confirm near-limit and over-limit rows display warnings only.
7. Confirm upgrade and billing history controls remain placeholders.

No automated verification was run for this implementation pass per the April 29, 2026 instruction.
