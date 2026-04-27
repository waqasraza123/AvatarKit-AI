# Phase Guardrails

- TypeScript owns product, business, workspace, API, widget, SDK, and dashboard concerns.
- Python owns AI, media, retrieval, ingestion, and future GPU orchestration.
- React components must not call avatar providers directly.
- Product routes must not hardcode provider-specific logic.
- Public widget access must not exist before the publish flow exists.
- Future avatar publish must require valid consent.
- Cross-workspace data access is never allowed.
- Python services should trust only signed internal service requests from the TypeScript API.
- Do not implement future phases early.
- Every phase should account for loading, empty, error, and success states.
- Phase 0 is foundation only: no auth UI, avatar creation, upload, consent, voice, knowledge, AI runtime, provider integration, widget runtime, lead capture, billing, or realtime streaming.
- Phase 2 adds only workspace-scoped Avatar Studio foundations:
  - basic identity and behavior editing
  - setup checklist placeholders for future steps
  - no voice provider, media, knowledge runtime, preview publish, or provider API calls.
- Phase 3 adds workspace-scoped source photo upload for draft/ready/failed avatars:
  - upload is only through server actions in `apps/web/src/app/actions/avatars.ts`
  - source photo metadata and validation status are stored in `AvatarAsset`
  - local storage adapter lives in `apps/web/src/lib/avatar-asset-storage.ts`
  - uploads are written to `.data/uploads/avatar-assets`, outside source directories
  - source photo bytes are only served through dashboard-authenticated preview endpoint `/api/avatar-assets/[avatarAssetId]/preview`
- Source photos are private by default until media generation/public publish phases exist.
- Phase 4 adds workspace-scoped consent and identity safety for source photos:
  - consent records are stored in `ConsentRecord`
  - consent is valid only when tied to the current valid `SOURCE_PHOTO` asset
  - replacing or removing the current source photo makes prior consent incomplete for setup and future publish checks
  - `VIEWER` roles may view consent state but cannot accept consent
  - `OWNER`, `ADMIN`, and `OPERATOR` may accept source-photo consent
  - suspended avatars cannot accept consent
  - consent acceptance must not publish avatars or enable public runtime behavior
- Phase 4 must not add voice consent, voice cloning, public identity verification, celebrity detection, face recognition, moderation provider integration, publish flow, public runtime, widget behavior, or provider media generation.

## Phase 1 decisions (implemented)

- Authentication in this phase uses local credential sign-up/sign-in with password hashing and a server cookie session table in `apps/web`.
- Workspace membership is resolved server-side on every dashboard route using `getWorkspaceContextForRequest`.
- Active workspace selection persists in a signed cookie and is validated against current memberships.
- Workspace role constants are enforced via `WorkspaceRole` (`OWNER`, `ADMIN`, `OPERATOR`, `VIEWER`) for future RBAC.
