# Contributing to AvatarKit AI

Thank you for your interest in contributing to AvatarKit AI. This project is built phase by phase, so good contributions should move the current phase forward without implementing future product surfaces early.

## Before You Start

Read these documents first:

- `docs/project-state.md`
- `docs/development.md`
- `docs/architecture/phase-guardrails.md`
- `docs/specifications/avatar-kit-ai-software-specification.md`

These files define the current product state, runnable workflow, architecture boundaries, and phase order.

## Development Setup

```bash
pnpm install
pnpm setup:githooks
cp .env.example .env
pnpm docker:up
pnpm db:generate
pnpm db:migrate
pnpm dev:web
```

Run additional services when your change needs them:

```bash
pnpm dev:api
pnpm dev:ai-runtime
```

## Safe Push Workflow

This repository uses versioned Git hooks from `.githooks`.

Set them up once per clone:

```bash
pnpm setup:githooks
```

Normal `git push` runs `.githooks/pre-push`, which delegates to `scripts/verify-push.sh`. The verifier blocks the push unless this command passes:

```bash
pnpm build
```

For automation and AI agents, use the explicit wrapper:

```bash
pnpm safe-push
```

`pnpm safe-push` runs the same verifier first, then executes `git push` with any extra arguments passed after the command.

To run the push verifier without pushing:

```bash
pnpm verify:push
```

## Contribution Rules

- Keep changes scoped to the current phase.
- Do not implement future phases early.
- Add validation at request, action, route, and persistence boundaries.
- Preserve workspace isolation for all user-owned data.
- Keep UI behavior honest; do not add fake AI, fake provider, fake upload, fake consent, or fake publish flows.
- Prefer small, focused modules over large multi-purpose files.
- Use strong TypeScript types and clear domain names.
- Avoid hardcoded product hacks.
- Do not commit secrets, local databases, generated build output, or local upload files.

## Current Phase Discipline

Completed phases are documented in `docs/development.md`.

When adding a feature:

- confirm it belongs to the active or requested phase
- update the relevant docs when behavior changes
- include manual verification paths for user-facing workflows
- keep non-goals explicit when a screen references future functionality

## Commit Style

Use concise, descriptive commit messages under 140 characters.

Examples:

```text
Add avatar source photo validation
Document Phase 3 upload verification paths
Guard avatar photo preview by workspace membership
```

## Pull Request Checklist

Before opening a pull request:

- confirm the change follows `docs/architecture/phase-guardrails.md`
- update docs for behavior, setup, or verification changes
- run the relevant commands locally when practical
- include manual verification notes for UI flows
- confirm no generated files or secrets are staged

Useful commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Security And Privacy

AvatarKit AI handles identity-adjacent media and business data. Treat this as sensitive by default.

- Do not expose private source photos through public routes.
- Do not bypass workspace membership checks.
- Do not accept arbitrary remote image URLs without a dedicated validation and fetch policy.
- Do not add publish or public runtime behavior before consent and safety phases are complete.

Report sensitive issues using the guidance in `SECURITY.md`.
