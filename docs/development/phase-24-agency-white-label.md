# Phase 24 Agency and White-Label Features

Phase 24 adds agency-oriented workspace operations without weakening workspace isolation or copying private client data across boundaries.

## Scope

Phase 24 adds:

- `WorkspaceBranding` schema for workspace-level widget brand settings
- `WorkspaceClientProfile` schema for client handoff metadata and checklist state
- `/dashboard/agency`
- agency workspace overview across workspaces the current user belongs to
- white-label widget configuration for the active workspace
- plan-gated AvatarKit branding removal for Agency and Enterprise plans
- custom widget brand name, logo URL, and accent color
- safe avatar template duplication between authorized workspaces
- client handoff checklist and exportable setup instructions

Phase 24 does not add:

- custom domains
- billing checkout or automatic plan changes
- agency-wide global admin roles
- cross-workspace search outside current memberships
- copying source photos
- copying consent records
- copying knowledge sources
- copying conversations, leads, widget settings, or kiosk settings
- CRM sync
- notifications
- contract generation

## Agency Dashboard

The dashboard route is:

```text
/dashboard/agency
```

The page shows:

- all workspaces where the user has membership
- active client profile
- active workspace branding
- avatar counts and published-avatar counts
- handoff checklist progress
- safe duplication form
- handoff instruction export text

Workspace switching still uses existing workspace membership checks. Opening a different client workspace requires the user to already belong to that workspace.

## White-Label Widget Settings

Workspace branding supports:

- brand name
- custom logo URL
- widget accent color
- hide AvatarKit branding

Hiding AvatarKit branding is available only when the workspace billing plan is `AGENCY` or `ENTERPRISE`. The public widget config defensively enforces that plan gate even if stale database state has the flag enabled.

The widget displays workspace branding from public widget config. It does not expose private workspace internals.

## Safe Avatar Duplication

The duplication flow requires:

- membership in the source workspace
- `OPERATOR` or higher role in the target workspace
- explicit source workspace
- explicit source avatar
- explicit target workspace
- new avatar name and display name

The duplicated avatar is always created as `DRAFT`.

Copied:

- role
- use case
- language
- tone
- answer style
- engine
- lead capture preference
- handoff preference
- optional voice selection
- optional behavior instructions

Never copied:

- source photo assets
- consent records
- generated media
- conversations
- leads
- knowledge sources
- widget settings
- kiosk settings
- publish state

This keeps templates useful while preventing accidental consent reuse and knowledge leakage across clients.

## Manual Approval Checklist

Before approving Phase 24 manually:

1. Generate Prisma client and create/apply the migration for `WorkspaceBranding` and `WorkspaceClientProfile`.
2. Open `/dashboard/agency` as OWNER, ADMIN, OPERATOR, and VIEWER.
3. Confirm viewer roles cannot save branding, client profile, or duplicate avatars.
4. Save brand name, logo URL, and accent color for an active workspace.
5. Confirm AvatarKit branding can be hidden only on Agency or Enterprise plans.
6. Open a widget for a published avatar and confirm branding is reflected in public widget config and UI.
7. Duplicate an avatar into the same workspace and into another workspace where the user has Operator access.
8. Confirm duplicated avatars are drafts and do not copy source photos, consent records, knowledge, conversations, leads, widget settings, kiosk settings, or publish state.
9. Save handoff checklist state and confirm exported setup instructions reflect the active workspace.

No automated verification was run for this implementation pass per the current instruction.
