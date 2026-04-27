# AvatarKit AI

[![CI](https://github.com/waqasraza123/AvatarKit-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/waqasraza123/AvatarKit-AI/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Product: Business Avatars](https://img.shields.io/badge/Product-Business%20Avatars-355cff.svg)](#product-vision)
[![Safety: Consent First](https://img.shields.io/badge/Safety-Consent%20First-0f5f2d.svg)](#implemented-capabilities)
[![Architecture: Workspace Scoped](https://img.shields.io/badge/Architecture-Workspace%20Scoped-1a2a4d.svg)](#repository-structure)
[![Status: Phase 4](https://img.shields.io/badge/Status-Phase%204%20Complete-854d0e.svg)](#current-status)

AvatarKit AI is a phase-driven SaaS foundation for business avatar infrastructure. It is designed to help teams create, verify, configure, and eventually publish talking AI avatars for websites, kiosks, onboarding, sales, support, education, and service workflows.

The product goal is not a generic photo-to-video toy. AvatarKit AI is being built as a controlled business avatar system with workspace isolation, consent, safety, business knowledge grounding, runtime monitoring, embeddable delivery, and a clean provider boundary for commercial or self-hosted avatar engines.

## Current Status

AvatarKit AI is currently implemented through Phase 4:

- Phase 0: monorepo foundation, service stubs, database wiring, Docker Compose, and CI baseline
- Phase 1: local auth, sessions, workspaces, roles, onboarding, and dashboard shell
- Phase 2: Avatar Studio foundation with avatar drafts, basics, behavior, checklist, and workspace-scoped CRUD
- Phase 3: avatar source photo upload, validation, private local storage, protected preview route, and photo checklist state
- Phase 4: consent records, identity-safety acceptance, current-photo consent validity, and consent checklist state

The next planned phase is Phase 5: Voice Library foundation.

## Product Vision

AvatarKit AI is intended to support this full creation and operating loop:

```text
Create avatar
-> verify consent
-> upload source photo
-> choose voice and language
-> configure personality and behavior
-> add approved business knowledge
-> test responses
-> publish as an embeddable avatar
-> review conversations, leads, safety events, and usage
```

## Repository Structure

```text
apps/web                 Next.js dashboard and product UI
apps/api                 TypeScript API service foundation
apps/widget              Embeddable widget package placeholder
packages/config          Shared configuration package
packages/types           Shared TypeScript contracts
packages/ui              Shared UI package
services/ai-runtime      Python FastAPI runtime foundation
services/ingestion       Python ingestion worker foundation
services/media-worker    Python media worker foundation
prisma                   Database schema
docs                     Product, architecture, phase, and development docs
```

## Implemented Capabilities

- Local email/password authentication with session cookies
- Workspace creation, active workspace switching, and role-aware access control
- Dashboard shell with workspace-aware route protection
- Avatar draft creation and workspace-scoped avatar list
- Avatar Studio with Basics, Photo, Consent, and Behavior steps
- Locked placeholders for future Voice, Knowledge, Preview, and Publish steps
- Source photo upload for draft/ready/failed avatars
- Server-side validation for JPG, PNG, and WEBP source photos
- Local private upload storage under `.data/uploads/avatar-assets`
- Protected dashboard-only photo preview endpoint
- Consent records tied to the current valid source photo
- Identity-safety consent acceptance for authorized workspace roles
- Setup checklist state for Basics, Photo, Consent, Behavior, and future setup milestones

## Intentional Non-Goals In Current Phase

The current implementation does not include:

- real voice provider integration
- voice cloning consent
- knowledge base ingestion
- AI runtime calls
- LLM, TTS, or STT calls
- avatar video generation
- embeddable public widget runtime
- publish flow
- lead capture workflow
- billing, metering, or subscription logic
- realtime streaming
- self-hosted avatar engine

These are planned later phases and should not be implemented ahead of the phase plan.

## Tech Stack

- TypeScript
- Next.js App Router
- React
- Prisma
- PostgreSQL
- Redis
- FastAPI service foundation
- pnpm workspaces
- Turborepo
- Docker Compose for local infrastructure

## Requirements

- Node.js 20+
- pnpm 10+
- Python 3.11+
- Docker and Docker Compose
- PostgreSQL and Redis via Docker Compose for local development

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm docker:up
pnpm db:generate
pnpm db:migrate
pnpm dev:web
```

Additional services can be started when needed:

```bash
pnpm dev:api
pnpm dev:ai-runtime
```

## Environment

Start from `.env.example`.

Important local values:

```text
DATABASE_URL=postgresql://avatarkit:avatarkit@localhost:5432/avatarkit
REDIS_URL=redis://localhost:6379
AVATAR_PHOTO_MAX_FILE_SIZE_BYTES=8388608
AVATAR_PHOTO_MIN_WIDTH=512
AVATAR_PHOTO_MIN_HEIGHT=512
AVATAR_PHOTO_MAX_WIDTH=6000
AVATAR_PHOTO_MAX_HEIGHT=6000
```

Local uploads are stored under:

```text
.data/uploads/avatar-assets
```

This directory is ignored by Git and is intended only for local development until a production object storage adapter is introduced.

## Development Commands

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm db:generate
pnpm db:migrate
pnpm docker:up
pnpm docker:down
```

See [docs/development.md](docs/development.md) for phase-specific manual verification paths.

## Architecture Principles

- TypeScript owns product, workspace, dashboard, API, widget, SDK, and permission boundaries.
- Python owns future AI orchestration, retrieval, ingestion, media, and GPU-oriented workloads.
- Every major business entity is workspace-scoped.
- Public widget access must not exist before publish flow exists.
- Avatar publish must eventually require valid consent.
- Avatar provider logic must stay behind internal boundaries.
- Do not implement future phases early.

Detailed architecture references:

- [Product plan](docs/product/plan_v1.md)
- [Technical design](docs/architecture/avatar-kit-ai-technical-design.md)
- [Software specification](docs/specifications/avatar-kit-ai-software-specification.md)
- [Phase guardrails](docs/architecture/phase-guardrails.md)
- [Project state](docs/project-state.md)

## Contributing

Contributions are welcome when they respect the phase plan and architecture guardrails. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

Please do not open public issues for sensitive vulnerabilities. See [SECURITY.md](SECURITY.md) for responsible disclosure guidance.

## License

AvatarKit AI is released under the [MIT License](LICENSE).
