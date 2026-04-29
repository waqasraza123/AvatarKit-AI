# Deployment Readiness

Phase 26 extends production hardening with platform-admin readiness, first-class audit logging, centralized rate limits, storage readiness labels, and expanded operations indicators. Deployment has not been verified by Codex.

## Required Services

- PostgreSQL for Prisma data.
- Next.js web app for dashboard, widget script, route handlers, kiosk, and public API v1.
- Python AI runtime for private `/runtime/message` calls.
- Optional Redis REST service for shared rate-limit counters. Memory fallback is process-local.
- Private object storage before production media scale. Local `.data/uploads/avatar-assets` or `LOCAL_STORAGE_ROOT` is suitable only for local development.
- Optional provider accounts for OpenAI, Anthropic, ElevenLabs, Deepgram, D-ID, Tavus, and future storage/billing integrations.

## Environment Variables

Use `.env.example` as the owner-maintained checklist. Required production categories:

- Core app: `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `AI_RUNTIME_BASE_URL`, `AI_RUNTIME_SERVICE_TOKEN`.
- Platform admin: `PLATFORM_ADMIN_EMAILS` for explicit bootstrap fallback.
- Audit: `AUDIT_LOG_ENABLED`, `AUDIT_LOG_METADATA_MAX_LENGTH`.
- Storage: `STORAGE_PROVIDER`, `LOCAL_STORAGE_ROOT`, `AVATAR_ASSET_STORAGE_ROOT`, and future object-storage credentials.
- AI runtime: `AI_RUNTIME_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.
- TTS/STT: `AI_RUNTIME_TTS_PROVIDER`, `AI_RUNTIME_STT_PROVIDER`, provider keys.
- Avatar video: `AI_RUNTIME_AVATAR_MEDIA_PROVIDER`, `DID_API_KEY`, `TAVUS_API_KEY`, or mock video URL.
- Public surfaces: `NEXT_PUBLIC_WIDGET_SCRIPT_URL`, `NEXT_PUBLIC_PUBLIC_API_BASE_URL`.
- Rate limiting: `RATE_LIMIT_PROVIDER`, `RATE_LIMIT_PUBLIC_API_MESSAGE_*`, `RATE_LIMIT_WIDGET_MESSAGE_*`, `RATE_LIMIT_LEAD_SUBMIT_*`, `RATE_LIMIT_REALTIME_SESSION_*`, optional Redis REST vars.
- Billing placeholders: `BILLING_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

Never commit real secrets.

## Database Migration

Human owner should generate Prisma client and apply migrations after reviewing schema changes from Phase 24 and later phases.

Suggested owner commands:

```text
pnpm prisma generate
pnpm db:migrate
```

For production, use the deployment platform's controlled migration process rather than local dev migration prompts.

## Storage Checklist

- Keep source photos and raw voice inputs private.
- Ensure generated widget media is served only through public media tokens.
- Do not expose local filesystem paths in public API or widget payloads.
- Use object storage with private buckets before production scale.
- Document old/replaced asset retention and deletion policy before real customer data.
- Phase 26 recognizes `LOCAL`, `S3_COMPATIBLE`, `R2`, and `SUPABASE` storage labels for readiness only.
- Actual upload/read/write behavior remains local-only through the existing adapter unless a real cloud adapter is implemented later.

## Redis And Queues

Rate limiting now uses a central helper. Without Redis REST env, memory fallback is used and is not distributed. With Redis REST env, Redis-backed counters are selected by configuration; this page does not verify live Redis connectivity.

## AI Provider Setup

- Select providers explicitly through environment variables.
- Keep provider keys only on server/runtime services.
- React, widget, and SDK code must never call provider APIs directly.
- Mock providers are acceptable for local checks but are not production provider readiness.

## Avatar Provider Setup

- D-ID and Tavus adapters remain behind the Python provider interface.
- Self-hosted avatar mode is a Phase 22 research prototype only and must stay disabled for production.
- Provider-hosted widget video references are blocked from public widget output unless copied to controlled storage.

## Widget And Public URLs

- Configure `NEXT_PUBLIC_APP_URL`.
- Configure allowed domains per workspace before production widget use.
- Public widget requests require Origin/Referer and domain allowlist outside development localhost.
- Public API v1 requires Bearer API keys and workspace-scoped scopes.

## Billing Notes

Phase 20 billing is a foundation only. Do not present Stripe checkout, invoices, payment methods, or billing portal as production-ready until provider integration is implemented.

## Admin Setup

Platform admin is explicit through `User.isPlatformAdmin` or `PLATFORM_ADMIN_EMAILS` bootstrap fallback. Workspace owners/admins can manage workspace operations, but workspace ownership does not imply platform-admin access.

## Audit Logging

`AuditLog` is the durable app-level audit table for high-value mutations. Audit-log UI surfaces are:

- `/admin/audit-log` for platform admins
- `/dashboard/operations/audit-log` for workspace owners/admins

Audit metadata is sanitized and raw metadata blobs are not rendered.

## Manual Smoke Paths

Use `docs/architecture/manual-verification-checklist.md` after setup. Do not treat this document as verification evidence.

## Rollback Considerations

- Keep database migrations reversible where practical.
- Preserve old env values until replacement deploys are confirmed by the owner.
- If runtime providers fail, revert provider envs to `MOCK` or known-good provider settings.
- If widget domains are misconfigured, temporarily unpublish affected avatars or remove disallowed domains.

## Known Limitations

- Rate limiting falls back to in-memory when Redis REST is missing or unavailable.
- Audit logging is app-level append-only behavior, not cryptographic immutability or compliance certification.
- Storage is local by default and cloud storage labels are readiness-only until a real adapter exists.
- Billing provider integration is placeholder.
- Self-hosted avatar inference is not production-ready.

## Not Production-Ready Yet

- External object storage adapter.
- Webhook delivery worker.
- Stripe checkout and billing portal.
- Production self-hosted GPU rendering.
