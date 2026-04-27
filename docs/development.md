# Development

## Phase 0 Foundation (completed baseline)

- Monorepo scaffold, Next.js web shell, API/AI service entrypoints, Postgres/Redis compose setup, CI baseline, and Prisma client wiring.
- Phase 0 intentionally omitted product feature code (no auth UI, no workspace shell, no avatar modules).

## Phase 1 - Authentication, Workspace, and Dashboard Shell

### Implemented this phase

- Auth foundation is local credentials (email/password) using Prisma-backed users and server cookie sessions.
- Workspace membership model and roles are present:
  - `OWNER`
  - `ADMIN`
  - `OPERATOR`
  - `VIEWER`
- First workspace onboarding flow exists for new users.
- Dashboard shell routes and placeholders are implemented and gated by workspace context.

### Phase 1 routing

- `GET /sign-in`
- `GET /sign-up`
- `GET /auth/callback`
- `POST` action routes:
  - `signInAction`
  - `signUpAction`
  - `signOutAction`
  - `createWorkspaceAction`
  - `activateWorkspaceAction`
  - `createOrActivateWorkspaceAction`
- `GET /onboarding/workspace`
- `GET /dashboard`
- `GET /dashboard/avatars`
- `GET /dashboard/knowledge`
- `GET /dashboard/conversations`
- `GET /dashboard/leads`
- `GET /dashboard/embed`
- `GET /dashboard/usage`
- `GET /dashboard/settings`

### Auth and workspace behavior in Phase 1

- Signed-in user identity uses session cookies and `Session` rows.
- Signed-out requests to dashboard routes are redirected to `/sign-in`.
- Dashboard shell reads active workspace from cookie and validates membership for every request.
- Users without a workspace are redirected to onboarding.
- Workspace switching is limited to memberships the current user belongs to.
- Selected role is surfaced in context and shown on settings placeholder screens.
- No avatar creation, consent, widget, runtime, lead, billing, or knowledge behavior is implemented in this phase.

### Manual verification paths for Phase 1

1. Signed-out dashboard protection  
   Path: open `/dashboard`  
   Expected: redirect to `/sign-in` (or `/sign-in?next=/dashboard`).

2. Sign-in flow  
   Path: open `/sign-in` and submit valid credentials  
   Expected: user lands on `/onboarding/workspace` if no workspace exists, otherwise lands on `/dashboard` (or `next` when supplied).

3. Sign-up flow  
   Path: open `/sign-up` and create a valid account  
   Expected: session is created, user lands on `/onboarding/workspace`.

4. No-workspace onboarding  
   Path: signed-in user with no workspace visits `/dashboard`  
   Expected: redirects to `/onboarding/workspace`.

5. Workspace creation  
   Path: open `/onboarding/workspace`, submit a workspace name  
   Expected: workspace is created, slug is generated safely, membership role is `OWNER`, and app lands on `/dashboard`.

6. Dashboard shell rendering  
   Path: `/dashboard`  
   Expected: sidebar + top bar + workspace name/slug area + shell placeholder sections render.

7. Placeholder routes  
   Paths: `/dashboard/avatars`, `/dashboard/knowledge`, `/dashboard/conversations`, `/dashboard/leads`, `/dashboard/embed`, `/dashboard/usage`, `/dashboard/settings`  
   Expected: each route renders placeholder UI only.

8. Unauthorized workspace access  
   Path: open any dashboard route with `workspaceId` that user is not a member of  
   Expected: access is blocked and a workspace permission error is surfaced; membership is resolved to an authorized workspace.

### Commands to run manually

- `cp .env.example .env`
- `pnpm install`
- `pnpm docker:up`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm dev:web`
- `pnpm dev:api`
- `pnpm dev:ai-runtime`
- Use the manual paths above in a browser and confirm each expected behavior.

## Phase 2 - Avatar Studio Foundation

### Implemented this phase

- Added core Avatar model and setup scaffolding:
  - `Avatar` table with required status and engine enums.
  - Avatar fields for name, display identity, role, use case, language, and behavior configuration.
  - Workspace relation with workspace-scoped queries.
- Added server actions for avatar lifecycle:
  - list by active workspace in dashboard views
  - create avatar draft
  - update avatar basics
  - update avatar behavior
  - delete avatar draft (draft-only guard)
  - get-by-id lookup with workspace enforcement
- Added role-aware route protection:
  - `OWNER`, `ADMIN`, `OPERATOR` can create/edit/delete.
  - `VIEWER` can open studio pages and list avatars but receives edit/delete restrictions.
- Added `/dashboard/avatars` as real avatar list and creation entry.
- Added `/dashboard/avatars/new` Phase 2 onboarding flow.
- Added `/dashboard/avatars/[avatarId]/studio` with step navigator:
  - `Basics` and `Behavior` editable.
  - `Photo`, `Consent`, `Voice`, `Knowledge`, `Preview`, `Publish` visible as future-step placeholders.
- Added setup checklist summary on avatar cards and studio header.
- Added schema-level defaults and validation boundaries for all phase-2 avatar form fields.
- No future provider/media/runtime/knowledge/voice/consent/publishing features are implemented in this phase.

### Phase 2 routes

- `GET /dashboard/avatars`
- `GET /dashboard/avatars/new`
- `GET /dashboard/avatars/[avatarId]/studio`

### Manual verification paths for Phase 2

1. Avatar list empty state  
   Path: sign in, create/select workspace, open `/dashboard/avatars`  
   Expected: page renders a polished empty state and create avatar action.

2. Create avatar draft  
   Path: open `/dashboard/avatars/new`, submit valid avatar basics  
   Expected: avatar draft is created in current workspace and app lands on Avatar Studio.

3. Create avatar validation  
   Path: submit create form with missing/invalid required fields  
   Expected: clear validation errors appear and no avatar is created.

4. Avatar Studio basics  
   Path: open `/dashboard/avatars/[avatarId]/studio`, go to Basics step and edit  
   Expected: avatar basics save successfully and setup checklist updates.

5. Avatar Studio behavior  
   Path: open `/dashboard/avatars/[avatarId]/studio`, go to Behavior step and edit  
   Expected: behavior config saves successfully and setup checklist updates.

6. Locked future steps  
   Path: open Photo, Consent, Voice, Knowledge, Preview, Publish steps  
   Expected: each step shows safe locked/upcoming placeholder state only.

7. Avatar list populated state  
   Path: return to `/dashboard/avatars` after creating an avatar  
   Expected: avatar card appears with `DRAFT` status and setup progress/checklist summary.

8. Workspace isolation  
   Path: attempt to access an avatar from another workspace  
   Expected: access is blocked and remains workspace scoped.

9. Viewer restrictions  
   Path: access Avatar Studio as `VIEWER` role  
   Expected: viewer can view cards and studio but cannot create/update/delete avatars.

10. Non-goal protection  
    Path: inspect UI for photo upload, voice provider, AI preview, publish, media generation  
    Expected: none of those future features are functional in Phase 2.

### Commands to run manually

 - `pnpm install`
 - `cp .env.example .env`
 - `pnpm docker:up`
 - `pnpm db:generate`
 - `pnpm db:migrate`
 - `pnpm dev:web`
- `pnpm dev:api`
- `pnpm dev:ai-runtime`

Use the paths above and verify each expected state with a browser.

## Phase 3 - Avatar Photo Upload and Validation

### Implemented this phase

- Added avatar source-photo persistence model and upload boundaries:
  - `AvatarAsset` table with enum-backed `type`, `validationStatus`, `validationIssues`, metadata, and workspace/avatar linkage.
- Added a storage abstraction for phase-3 assets in `apps/web/src/lib/avatar-asset-storage.ts`:
  - local disk adapter under `.data/uploads/avatar-assets`
  - safe storage key generation per workspace/avatar/asset
  - file read/write/delete helpers
  - non-public preview URL generation only for dashboard-controlled routes
- Added server-side avatar photo validation and metadata parsing in `apps/web/src/app/actions/avatars.ts`:
  - accepted MIME types: `image/jpeg`, `image/png`, `image/webp`
  - max file size check
  - min/max dimension checks
  - unreadable file detection
  - user-facing validation messages
- Added studio Photo step in `/dashboard/avatars/[avatarId]/studio`:
  - current photo preview
  - file picker (drag/drop panel style)
  - selected file name
  - upload and remove actions
  - loading and state messages
  - practical photo guidance
- Added checklist/state updates:
  - `Photo uploaded` becomes complete when a valid source photo exists
  - list cards now show source-photo state (`Photo added` / `Photo needed`) and thumbnail
- Added private source-photo preview endpoint:
  - `GET /api/avatar-assets/[avatarAssetId]/preview`
  - authenticated user + workspace-member required
  - only valid assets can be returned

### Phase 3 non-goals intentionally left off

- no face/quality AI checks
- no crop UI
- no consent flow
- no voice provider/library
- no knowledge upload
- no AI runtime/preview or publish flow
- no embeddable widget
- no media generation
- no billing or usage metering
- no self-hosted avatar engine

### Manual verification paths for Phase 3

1. Photo step availability  
   Path: sign in, create/select workspace, open `/dashboard/avatars/[avatarId]/studio`, click Photo  
   Expected: Photo step is now functional and no longer a locked placeholder.

2. Valid photo upload  
   Path: upload a valid JPG/PNG/WEBP image under max size and above minimum dimensions  
   Expected: upload succeeds, photo preview appears, setup checklist marks Photo uploaded complete.

3. Invalid file type  
   Path: upload a PDF/TXT/GIF/SVG or unsupported file  
   Expected: upload is rejected with clear validation error and no source photo is attached.

4. Oversized image  
   Path: upload an image above configured max size  
   Expected: upload is rejected with clear validation error.

5. Too-small image  
   Path: upload an image below minimum dimensions  
   Expected: upload is rejected with clear validation error.

6. Replace photo  
   Path: upload a valid photo, then upload a second valid photo  
   Expected: second upload becomes current source photo and checklist remains complete.

7. Remove photo  
   Path: remove the current source photo  
   Expected: preview disappears and setup checklist marks Photo uploaded incomplete.

8. Avatar list photo state  
   Path: return to `/dashboard/avatars` after upload/remove  
   Expected: avatar card shows correct photo added/photo needed state.

9. Workspace isolation  
   Path: attempt to access or mutate photo for an avatar in another workspace  
   Expected: access is blocked and/or redirected by workspace guard.

10. Viewer restrictions  
   Path: access as `VIEWER` role  
   Expected: viewer can see photo state but cannot upload, replace, or remove.

11. Published/suspended guard  
   Path: force avatar status to `PUBLISHED` or `SUSPENDED`, then attempt photo change  
   Expected: upload/remove is blocked.

12. Non-goal protection  
   Path: inspect UI after Phase 3  
   Expected: consent, voice, preview, publish, knowledge, provider integration, AI runtime, and media generation are still not functional.

### Avatar photo environment and storage behavior

- Storage root: `.data/uploads/avatar-assets`
- upload limits are read from env vars via `apps/web/src/lib/avatar-photo-upload-config.ts`
- default values:
  - `AVATAR_PHOTO_MAX_FILE_SIZE_BYTES=8388608`
  - `AVATAR_PHOTO_MIN_WIDTH=512`
  - `AVATAR_PHOTO_MIN_HEIGHT=512`
  - `AVATAR_PHOTO_MAX_WIDTH=6000`
  - `AVATAR_PHOTO_MAX_HEIGHT=6000`

### Commands to run manually

- `cp .env.example .env`
- `pnpm install`
- `pnpm docker:up`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm dev:web`
- `pnpm dev:api`
- `pnpm dev:ai-runtime`

Use the paths above and confirm each expected behavior in a browser.

## Phase Discipline

Use `docs/specifications/avatar-kit-ai-software-specification.md` as the execution sequence.
Implement one phase per task unless explicitly instructed otherwise.
