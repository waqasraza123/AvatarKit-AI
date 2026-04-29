# Manual Verification Checklist

These checks are for the human owner. Codex did not run them.

## Phase 27 Data Governance

1. Data governance access
   Path/action: open `/dashboard/settings/data` as a workspace member.
   Expected: retained record counts render for the active workspace only.

2. Export creation
   Path/action: create an export as `OWNER` or `ADMIN`.
   Expected: export history row appears with `COMPLETED` status and a download link.

3. Export download
   Path/action: download the export JSON.
   Expected: JSON includes workspace-owned data and excludes password hashes, sessions, raw API keys, API key hashes, webhook secret hashes, provider secrets, and environment values.

4. Export role gates
   Path/action: try export creation as `OPERATOR` or `VIEWER`.
   Expected: creation is blocked.

5. Cross-workspace export isolation
   Path/action: try opening an export download URL from a user without membership in that export workspace.
   Expected: request is rejected.

6. Deletion request confirmation
   Path/action: request deletion as `OWNER` without typing the workspace slug, then with the correct slug.
   Expected: incorrect confirmation is rejected; correct confirmation records a pending request.

7. Deletion request cancellation
   Path/action: cancel a pending deletion request as `OWNER`.
   Expected: request status becomes `CANCELED`.

8. Deletion role gates
   Path/action: try deletion request or cancellation as non-owner.
   Expected: mutation is blocked.

9. Audit coverage
   Path/action: inspect `/dashboard/operations/audit-log` after export/deletion actions.
   Expected: `data_export.created`, `workspace_deletion.requested`, and `workspace_deletion.canceled` events appear with safe metadata.

10. Non-goal protection
    Path/action: inspect code and UI.
    Expected: no automatic destructive deletion, background export queue, object-storage export delivery, CRM deletion, billing cancellation, legal hold automation, or compliance-certification claim exists.

Suggested owner commands after reviewing Phase 27:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm prisma generate
pnpm build
python -m pytest
python -m compileall services
git status --short
```

## Phase 26 Durable Controls

1. Platform admin access
   Path/action: configure `User.isPlatformAdmin` or `PLATFORM_ADMIN_EMAILS` according to docs and open `/admin/audit-log`.
   Expected: platform admin can access; normal workspace owner cannot unless also platform admin.

2. Non-admin blocked
   Path/action: normal workspace user opens `/admin` or `/admin/audit-log`.
   Expected: access is blocked or redirected safely.

3. Audit log creation for API key
   Path/action: create and revoke API key from `/dashboard/developers`.
   Expected: `AuditLog` entries are created with safe metadata and no raw key/hash.

4. Audit log creation for avatar publish/suspend
   Path/action: publish/unpublish/suspend/unsuspend avatar.
   Expected: `AuditLog` entries are created with safe actor/target metadata.

5. Audit log creation for branding
   Path/action: update white-label branding from `/dashboard/agency`.
   Expected: `AuditLog` entry is created without leaking private values or secrets.

6. Audit log UI
   Path/action: open `/admin/audit-log` as platform admin or `/dashboard/operations/audit-log` as workspace owner/admin.
   Expected: logs render with action, actor, target, timestamp, workspace, and safe metadata summary.

7. Audit redaction
   Path/action: inspect audit metadata after API key, webhook, auth, provider, and branding actions.
   Expected: no raw API keys, hashes, tokens, provider secrets, webhook secrets, hidden prompts, or large unsafe payloads appear.

8. Rate limit public API
   Path/action: manually exceed public API message policy.
   Expected: `rate_limited` response appears with safe message and `retryAfterSeconds` if available.

9. Rate limit widget
   Path/action: manually exceed widget message policy.
   Expected: widget shows friendly rate limit fallback.

10. Rate limit lead submission
    Path/action: manually exceed lead submit policy.
    Expected: lead submit is blocked with safe rate limit error.

11. Redis missing fallback
    Path/action: run without Redis REST env in local manual test.
    Expected: in-memory limiter is used or documented fallback behavior occurs.

12. Redis configured path
    Path/action: configure Redis REST env manually.
    Expected: Redis-backed limiter is selected according to docs after human verification.

13. Operations readiness
    Path/action: open `/dashboard/operations`.
    Expected: readiness indicators show configured/missing/warning/optional states using env variable names only.

14. Storage readiness
    Path/action: inspect operations readiness and docs.
    Expected: local storage warning and cloud storage configuration guidance appear.

15. Public endpoint privacy
    Path/action: inspect public API/widget/kiosk payloads.
    Expected: no private source photo paths, secrets, hidden prompts, or unsafe metadata are exposed.

16. Workspace isolation
    Path/action: attempt cross-workspace access after Phase 26 changes.
    Expected: access remains blocked.

17. Existing manual checks regression
    Path/action: run existing Phase 0-25 manual checks as needed.
    Expected: no intentional behavior regression.

18. Documentation
    Path/action: read audit-logging, rate-limiting, deployment-readiness, and security docs.
    Expected: Phase 26 behavior, limitations, and manual checks are documented.

19. Non-goal protection
    Path/action: inspect Phase 26 output.
    Expected: no new avatar engine, no billing checkout, no CRM integration, no broad rewrite, no commits/pushes.

Suggested owner commands after reviewing Phase 26:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm prisma generate
pnpm build
python -m pytest
python -m compileall services
git status --short
```

## Auth And Workspace

- Path/action: sign up, sign in, sign out, switch workspace.
  Expected: session state is correct and workspace switching only allows memberships.
- Path/action: try dashboard route while signed out.
  Expected: redirect to sign in.
- Path/action: attempt cross-workspace access for avatars, knowledge, conversations, leads, usage, billing, agency settings.
  Expected: access blocked or redirected safely.

## Dashboard Shell

- Path/action: open `/dashboard`.
  Expected: active workspace, navigation, metrics, and empty states render without secret values.

## Avatar Studio

- Path/action: create and edit avatar basics/behavior.
  Expected: role checks and validation apply.
- Path/action: access another workspace avatar by URL.
  Expected: blocked.

## Photo Upload

- Path/action: upload invalid file type, oversized image, tiny image, and valid image.
  Expected: invalid files rejected safely; valid source photo remains private dashboard media.

## Consent

- Path/action: accept consent for current photo, replace photo, inspect consent state.
  Expected: consent ties to current valid source photo only.

## Voice

- Path/action: select active compatible voice, inactive voice, incompatible language.
  Expected: only valid selections save.

## Knowledge

- Path/action: create FAQ/TEXT source, archive source, inspect Avatar Studio knowledge state.
  Expected: workspace-scoped READY knowledge counts update.

## Preview Text Audio Video

- Path/action: send text/audio/video dashboard preview.
  Expected: safe answer or safe fallback; generated media remains authenticated dashboard media.
- Setup required: runtime service and relevant mock/provider envs.

## Conversations

- Path/action: open `/dashboard/conversations` and detail pages.
  Expected: workspace-scoped transcripts and safe metadata badges.

## Widget

- Path/action: load widget for published avatar on allowed domain.
  Expected: config loads and messages persist as widget conversations.
- Path/action: use draft, unpublished, suspended, or disallowed-domain avatar.
  Expected: safe blocked response.
- Path/action: inspect widget payloads and media URLs.
  Expected: no private source photo path or raw provider secret.

## Leads

- Path/action: submit widget/API/kiosk lead, duplicate lead, unsafe lead text.
  Expected: one primary lead per conversation, safety handling, no cross-workspace manipulation.

## Usage

- Path/action: open `/dashboard/usage` after runtime/storage/lead actions.
  Expected: workspace-scoped usage events and soft-limit warnings only.

## Safety

- Path/action: ask unsafe question such as prompt injection or unsupported medical/legal/financial advice.
  Expected: refusal/handoff and safety event.
- Path/action: review, dismiss, resolve, and suspend avatar from safety as appropriate roles.
  Expected: role gates apply.

## Knowledge Gaps

- Path/action: ask missing-knowledge questions and mark poor answers.
  Expected: trusted server-created gaps appear, dedupe, and convert to reviewed FAQ only after operator input.

## Realtime

- Path/action: start dashboard realtime and widget realtime sessions.
  Expected: session starts, messages stream final events, inactive sessions expire, fallback is safe.
- Setup required: browser and runtime availability.

## Public API And SDK

- Path/action: use missing, invalid, revoked, and unscoped API keys.
  Expected: consistent safe errors.
- Path/action: start API conversation, send message, submit lead.
  Expected: workspace derives from API key; published avatar required; no private data returned.

## Billing

- Path/action: open `/dashboard/billing` as each role.
  Expected: static plan data and soft warnings only; no checkout claims.
- Path/action: access billing as non-owner/non-admin where mutations later exist.
  Expected: mutations blocked or hidden.

## Admin Operations

- Path/action: open `/dashboard/operations` as owner/admin/operator/viewer.
  Expected: operator-or-higher access; owner/admin can suspend/unsuspend.
- Path/action: inspect readiness section.
  Expected: variable names and configured/unconfigured/warning states only; no secret values.

## Kiosk

- Path/action: configure kiosk, open `/kiosk/[avatarId]`, start session, wait/reset/end.
  Expected: transcript clears after inactivity/session reset and stale sessions reject messages.
- Path/action: inspect public kiosk config.
  Expected: no private source-photo preview URL.

## Agency White-Label

- Path/action: update branding/profile, duplicate avatar, export setup instructions.
  Expected: workspace membership and operator gates apply.
- Path/action: try hiding AvatarKit branding on a plan without permission.
  Expected: blocked or locked according to plan.

## Security

- Path/action: inspect admin/provider/audit/operations/conversation pages.
  Expected: no raw API keys, hashes, provider secrets, session tokens, hidden prompts, or webhook secrets appear.

## Storage

- Path/action: inspect public API/widget/kiosk payloads and media URLs.
  Expected: private source storage paths are not exposed.

## Deployment Readiness

- Path/action: read `.env.example`, deployment readiness, security, and runtime fallback docs.
  Expected: setup steps, variables, and limitations are clear with placeholders only.

## Regression Checks

- Path/action: confirm Phase 0-24 documented manual paths remain valid.
  Expected: no major product behavior removed except intentional Phase 25 public privacy hardening.

## Repo Hygiene

- Path/action: human owner runs `git status --short`.
  Expected: no `.DS_Store` files remain untracked; future `.DS_Store` files are ignored.

## Non-Goal Protection

- Path/action: inspect Phase 25 output.
  Expected: no self-hosted GPU implementation, CRM integration, billing checkout, major redesign, or future product module.
