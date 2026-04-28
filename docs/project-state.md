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
  - `Voice`
  - `VoiceProvider` enum
  - `VoiceStatus` enum
  - `KnowledgeSource`
  - `KnowledgeSourceType` enum
  - `KnowledgeStatus` enum
  - `KnowledgeChunk`
  - `Conversation`
  - `ConversationChannel` enum
  - `ConversationStatus` enum
  - `Message`
  - `MessageRole` enum
  - `RuntimeTrace`
  - `RuntimeTraceStatus` enum
  - `Lead`
  - `LeadStatus` enum
  - `LeadSource` enum
  - `AvatarAsset`
  - `AvatarAssetType` enum
  - `AvatarAssetValidationStatus` enum
  - `ConsentRecord`
  - `ConsentType` enum
  - `PermissionBasis` enum
  - `WidgetSettings`
  - `WidgetTheme` enum
  - `WidgetPosition` enum
  - `AllowedDomain`
- `apps/web` uses route-level server components and server actions for all auth/workspace flows.

## Current Phase

Phase 13 is now implemented pending manual approval: Lead Capture.

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
- Consent data model tied to the current valid source photo asset.
- Consent acceptance server action with workspace, role, source-photo, and suspended-avatar guards.
- Functional Avatar Studio Consent step with identity-safety statements and terms version display.
- Setup checklist and avatar cards now show valid current-photo consent state.
- Voice schema foundation with selectable active voice catalog.
- Static MOCK voice catalog and manual `pnpm db:seed` path.
- Functional Avatar Studio Voice step with language filtering, selected voice state, save/clear actions, and no-preview states.
- Voice selection server action with workspace, role, suspended-avatar, active-voice, and language compatibility guards.
- Setup checklist and avatar cards now show active selected voice state.
- Behavior configuration remains saved configuration only for greeting, tone, answer style, business instructions, fallback, lead capture preference, and handoff preference.
- Knowledge Base v1 data model with workspace-scoped sources and deterministic chunks.
- Functional FAQ and manual text knowledge source create/edit/archive flows.
- `/dashboard/knowledge`, `/dashboard/knowledge/new`, and `/dashboard/knowledge/[sourceId]` are real workspace-scoped pages.
- Avatar Studio Knowledge step is functional and shows workspace knowledge readiness.
- Setup checklist now marks Knowledge added complete when the active workspace has at least one READY knowledge source.
- Conversation dashboard list and detail pages are real and workspace-scoped.
- Conversation transcript rendering supports role differentiation, timestamps, safety/fallback metadata, and message metadata badges.
- Conversation runtime trace summary list supports event status, duration, timing, and error metadata.
- Conversation status actions are role-scoped to OWNER/ADMIN/OPERATOR roles.
- Avatar Studio and overview surfaces now link to conversation workflows.
- Python TTS provider abstraction supports MOCK, OPENAI, ELEVENLABS, and AZURE placeholder routing.
- Runtime output modes now include `text` and `audio`; audio mode returns text plus optional audio bytes or audio error metadata.
- Generated speech audio is stored through private avatar assets and linked from `Message.audioUrl`.
- Avatar Studio Preview supports Text only and Text + audio modes with selected voice display, audio playback, and audio fallback state.
- Conversation detail transcripts show audio players and audio metadata for avatar messages with audio.
- TTS usage metadata is stored on message metadata for Phase 9 instead of adding billing/usage tables before the billing phase.
- Runtime traces include `tts.started`, `tts.completed`, `tts.failed`, `audio.stored`, and `audio.failed`.
- Python avatar media provider abstraction supports `MOCK`, D-ID, Tavus placeholder, Simli placeholder, and self-hosted unavailable routing.
- Runtime output modes now include `text`, `audio`, and `video`; video mode returns text plus optional audio and normalized video output/error metadata.
- Generated video bytes can be stored through private avatar assets as `GENERATED_AVATAR_VIDEO` and linked from `Message.videoUrl`.
- Provider-hosted video URLs may be linked directly for internal dashboard preview when copying to controlled storage is not yet available.
- Avatar Studio Preview supports Text + avatar video with visible video preconditions, source photo preview, selected voice display, video loading, video playback, and fallback messaging.
- Conversation detail transcripts show video players and video response metadata for avatar messages with video.
- Runtime traces include `avatar_video.started`, `avatar_video.completed`, `avatar_video.failed`, `video.stored`, and `video.failed`.
- Video usage metadata is stored on message metadata for Phase 10 instead of adding billing/usage tables before the billing phase.
- Avatar publish readiness is centralized in `apps/web/src/lib/avatar.ts`.
- Publish readiness requires basics, valid current photo, consent for current photo, active voice, behavior, READY knowledge, successful preview, non-suspended avatar, and valid workspace context.
- Avatar Studio Publish step is functional and shows completed/missing requirements, blocking issues, preview summary, and publish/unpublish actions.
- `/dashboard/avatars` cards and Studio header/sidebar show setup incomplete, ready to publish, published, suspended, or failed publish state.
- Publish/unpublish actions are workspace-scoped and role-gated to OWNER/ADMIN/OPERATOR.
- `Avatar.publishedAt` stores the first-published timestamp.
- `/dashboard/embed` is a real Phase 12 embed management page for published avatars.
- Widget settings and allowed domains are workspace-scoped and role-gated.
- `/widget.js` serves the first browser widget script from the web app.
- Public widget config, message, and tokenized media endpoints exist under `/api/widget`.
- Widget conversations persist as `ConversationChannel.WIDGET` and appear in `/dashboard/conversations`.
- Lead capture is now implemented for widget conversations.
- Python runtime returns structured `leadCapture` objects plus `leadCaptureDecision` compatibility metadata.
- Widget lead capture card collects name, email, phone, and message, then submits to `/api/widget/[avatarId]/lead`.
- Leads are workspace-scoped, linked to one primary conversation, optionally linked to avatar, and prevent uncontrolled duplicates through unique `conversationId`.
- `/dashboard/leads` and `/dashboard/leads/[leadId]` are real lead review surfaces with status management.
- Conversation list/detail surfaces now show linked lead state.
- Dashboard overview shows real new and total lead counts.

## Important Decisions

- Auth implementation choice for this repo is local credentials + cookie-backed sessions in Next.js (`apps/web`) for this phase.
- `WorkspaceRole` remains explicit and role checks are introduced through utility helpers for future RBAC.
- Workspace access is never granted for a `workspaceId` not present in memberships.
- Avatar operations are workspace scoped at every boundary, including by `avatarId` lookup.
- Consent validity is tied to `ConsentRecord.avatarAssetId` matching the latest valid `SOURCE_PHOTO` asset for the avatar.
- Photo replacement/removal invalidates consent for checklist and UI purposes without deleting prior consent records.
- Voice selection uses a first-class global `Voice` catalog and nullable `Avatar.voiceId` relation.
- The built-in MOCK catalog is available as a fallback and is persisted on first assignment if manual seeding has not been run.
- Phase 5 voice changes do not enable public runtime, generated speech, provider calls, or publishing behavior.
- Phase 6 uses all READY workspace knowledge for future avatar grounding; per-avatar knowledge source selection is deferred.
- Knowledge chunks are deterministic paragraph-based chunks with no embeddings or vector search in this phase.
- Archiving a knowledge source removes it from READY counts and setup completion without deleting stored rows.
- Phase 6 knowledge changes do not enable retrieval, LLM answer generation, citations, preview, runtime, or publishing behavior.
- Phase 7 adds text-only runtime preview flow under `ConversationChannel.DASHBOARD_PREVIEW` and `MessageRole.VISITOR`/`MessageRole.AVATAR`.
- Phase 7 adds `Conversation`, `Message`, and `RuntimeTrace` persistence for dashboard preview interactions.
- Phase 7 adds service-token-gated TypeScript-to-Python runtime calls with `AI_RUNTIME_PROVIDER` abstraction (`MOCK`, `OPENAI`, `ANTHROPIC`).
- Phase 8 adds dashboard-level conversation filters, transcript review, and safe status management.
- Phase 8 adds dashboard overview counts for preview and failed conversations.
- Phase 9 keeps audio preview authenticated and workspace-scoped; generated audio is not exposed through public runtime or widget routes.
- Phase 10 keeps video preview authenticated and workspace-scoped; generated/provider-hosted video is only linked to dashboard preview messages.
- Video generation requires the current valid source photo and consent record to match exactly; replacing/removing the source photo blocks video until consent is accepted again.
- `MOCK` avatar media provider does not need API keys but needs `AI_RUNTIME_MOCK_AVATAR_VIDEO_URL` to return a successful playable mock video reference.
- Phase 11 publish marks widget/public-runtime eligibility for Phase 12.
- `publishedAt` is historical first-published metadata and remains set after unpublish.
- Unpublish moves a published avatar to `READY` when setup remains complete and to `DRAFT` when setup is incomplete.
- Phase 12 public widget access requires `PUBLISHED` avatars that remain publish-ready and are not suspended.
- Production widget requests require at least one normalized allowed domain and must match request origin.
- Development localhost origins are allowed when `NODE_ENV` is not `production`.
- Public widget config exposes safe display and widget settings only; private source photo storage paths and provider metadata remain hidden.
- Public widget messages reuse the existing TypeScript-to-Python runtime pipeline and accept text only.
- Generated widget media stored as local `AvatarAsset` rows is served through per-message public media tokens.
- Phase 13 lead capture creates or updates one primary lead per conversation.
- Phase 13 lead submit endpoint reuses published-avatar eligibility and widget domain allowlist checks.
- Lead reads are available to workspace members; lead status updates are restricted to OWNER, ADMIN, and OPERATOR.
- Default Phase 13 lead fields are name, email, phone, and message. Empty submissions are rejected and invalid email/phone values are blocked server-side.

## Non-Negotiable Rules (still active)

- Preserve existing architecture conventions and phase boundaries.
- Do not add production logic for future phases ahead of their designated order.
- Strong validation at request/action boundaries.
- No future feature flows beyond Phase 13 lead capture: no STT, microphone input, billing, realtime streaming, public sharing, React SDK, inline widget, kiosk mode, operator handoff, CRM sync, notifications, webhooks, analytics, 3D rendering, or self-hosted avatar engine.

## Current Next Step

Phase 13 implementation is pending manual approval in `docs/development.md`.

## Verification Commands (manual, user-run)

- `pnpm install`
- `cp .env.example .env`
- `pnpm docker:up`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:seed`
- `pnpm dev:web`
- `pnpm dev:api`
- `pnpm dev:ai-runtime`
- Execute the manual verification paths listed in `docs/development.md`.
