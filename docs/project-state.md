# Project State

## Product

AvatarKit AI is a phase-driven SaaS foundation for business avatar infrastructure:
auth, workspace isolation, dashboard shell, and future avatar/knowledge/runtime modules.

## Source-of-Truth Documents

- `docs/product/plan_v1.md` — product direction.
- `docs/architecture/avatar-kit-ai-technical-design.md` — implementation architecture.
- `docs/specifications/avatar-kit-ai-software-specification.md` — phase sequence and acceptance.
- `docs/architecture/phase-guardrails.md` — cross-phase constraints.
- `docs/development.md` — runnable setup and phase-specific verification paths.

## Current Architecture

- Repository now contains a working monorepo with web, api, worker, and Python runtime service stubs.
- Web app implements local auth, session, and workspace domain logic for Phase 1.
- Prisma schema includes:
  - `User`
  - `Session`
  - `Workspace`
  - `WorkspaceMember`
  - `WorkspaceRole` enum
- `Avatar`
- `AvatarStatus` enum
- `AvatarEngine` enum
- `apps/web` uses route-level server components and server actions for all auth/workspace flows.
- `AvatarAsset`
- `AvatarAssetType` enum
- `AvatarAssetValidationStatus` enum

## Current Phase

Phase 3 is now implemented: Avatar Photo Upload and Validation.

## Completed Major Slices

- Project scaffold and package/workspace wiring.
- Local credential auth flow with hashed passwords and session cookie storage.
- Workspace model and membership role utilities.
- Workspace onboarding and active workspace switching.
- Dashboard layout and shell placeholders for all required navigation routes.
- Route-level workspace access protection and redirection for unauthorized/no-workspace states.
- Phase 1 development docs and manual verification section.
- Avatar data foundation and enums for draft/processing/ready/published/suspended/failed states.
- Avatar creation, list, and studio routes.
- Basics and behavior editing surfaces in Avatar Studio.
- Server actions for avatar draft CRUD and validation.
- Avatar source photo data model, validation status tracking, and workspace-safe lookup.
- Avatar photo storage boundary and local upload adapter in web layer.
- Studio Photo step with upload, replace, remove, and validation UI.
- Protected server endpoint for photo preview delivery.
- Setup completion checklist foundation for future step tracking.
- Avatar list card photo state rendering for onboarding signal.

## Important Decisions

- Auth implementation choice for this repo is local credentials + cookie-backed sessions in Next.js (`apps/web`) for this phase.
- `WorkspaceRole` remains explicit and role checks are introduced through utility helpers for future RBAC.
- Workspace access is never granted for a `workspaceId` not present in memberships.
- Avatar operations are workspace scoped at every boundary, including by `avatarId` lookup.

## Non-Negotiable Rules (still active)

- Preserve existing architecture conventions and phase boundaries.
- Do not add production logic for future phases ahead of their designated order.
- Strong validation at request/action boundaries.
- No future feature flows (avatar, consent, voice, knowledge, runtime, billing, leads, widget, etc.) in this phase.

## Current Next Step

Phase 4: Consent and Identity Safety.

## Verification Commands (manual, user-run)

- `pnpm install`
- `cp .env.example .env`
- `pnpm docker:up`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm dev:web`
- `pnpm dev:api`
- `pnpm dev:ai-runtime`
- Execute the manual verification paths listed in `docs/development.md`.
