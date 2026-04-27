# Project State

## Product

AvatarKit AI is planned as Apple-inspired talking avatar infrastructure for businesses: create a lifelike AI avatar, give it business knowledge, let visitors talk to it in real time, and embed it anywhere.

The durable product plan is `docs/product/plan_v1.md`. It defines the v1 product as a business avatar front desk, starting with a polished real estate demo that answers service/property questions, captures buyer/seller leads, and can be embedded on a website.

The durable implementation plan is `docs/architecture/avatar-kit-ai-technical-design.md`. It defines implementation plan v1: a hybrid TypeScript + Python architecture with Next.js web, TypeScript API/BFF, embeddable widget, React SDK, Python FastAPI AI runtime, Python media/ingestion workers, Postgres, Redis, object storage, and pgvector/Qdrant.

The phased development specification is `docs/specifications/avatar-kit-ai-software-specification.md`. It is the execution plan to follow during development: use one phase per Codex task and do not jump ahead.

The current workspace at `/Users/mc/development/AI/AvatarKit-AI` is initialized as the local checkout for `waqasraza123/AvatarKit-AI`. It contains planning/context docs but still has no product source files, package metadata, migrations, or application code.

## Current Architecture

- Top-level context files are being established before application code is present.
- `AGENTS.md` is the durable instruction entry point for Codex.
- `docs/project-state.md` is durable repo memory intended to be committed once this directory becomes or is restored as the project repository.
- `docs/product/plan_v1.md` is the durable product plan for AvatarKit AI v1.
- `docs/architecture/avatar-kit-ai-technical-design.md` is the durable implementation plan for AvatarKit AI v1.
- `docs/specifications/avatar-kit-ai-software-specification.md` is the durable phased software specification for development execution.
- `docs/_local/current-session.md` is local working memory and must remain uncommitted.
- No framework, runtime, package manager, database, deployment target, or migration system is visible in the current workspace.
- GitHub repository: `https://github.com/waqasraza123/AvatarKit-AI`.

## Non-Negotiable Rules

- Read `docs/project-state.md` before implementation decisions.
- Read `docs/_local/current-session.md` if it exists before starting work.
- Do not invent product architecture when the repo does not provide evidence.
- Do not store secrets in `AGENTS.md`, `docs/project-state.md`, or `docs/_local/current-session.md`.
- Keep durable memory high-signal: exact constraints, decisions, changed files, next steps, and verification commands.
- Update `docs/project-state.md` only for long-term architecture, roadmap, constraints, or important decisions.
- Update `docs/_local/current-session.md` at the end of every meaningful task.
- Preserve existing repository conventions once source files are available.
- Use `docs/product/plan_v1.md` as the source of truth for product direction until superseded by a newer plan.
- Use `docs/architecture/avatar-kit-ai-technical-design.md` as the source of truth for implementation architecture until superseded by a newer design.
- Use `docs/specifications/avatar-kit-ai-software-specification.md` as the source of truth for phase order, acceptance criteria, feature dependencies, and Codex execution strategy.
- Implement one phase per Codex task unless explicitly instructed otherwise.
- Do not jump ahead into future phases.
- Do not add comments in code.
- Use descriptive and consistent names.
- Prefer reusable modules and components over large multi-purpose files.
- Write production-grade code with maintainable structure, strong typing, validation, and error handling.
- Do not guess missing requirements; state assumptions explicitly when needed.
- Avoid hardcoded values, hacks, and tightly coupled logic.
- Keep code modular, testable, and scalable.
- Keep commit messages under 140 characters.

## Current Roadmap

- Restore or confirm the actual project checkout for `AvatarKit-AI`.
- Re-inspect source code, package scripts, docs, migrations, and deployment configuration once available.
- Replace this bootstrap state with concrete product and architecture notes after real project files are present.
- Keep `docs/_local/current-session.md` ignored while committing durable context files.
- Build toward `docs/product/plan_v1.md`, starting with AvatarKit AI - Business Avatar Front Desk for real estate.
- Follow `docs/specifications/avatar-kit-ai-software-specification.md` in order.
- Current next phase is Phase 0 - Project Foundation.
- Phase 0 deliverables: initialize monorepo, web app, API service, Python AI runtime service, shared packages, database foundation, env documentation, local scripts, Docker Compose for Postgres/Redis, service health checks, and basic CI.

## Completed Major Slices

- Established a simple repo-driven context system:
  - `AGENTS.md`
  - `docs/project-state.md`
  - `docs/_local/current-session.md`
  - `.gitignore` entry for `docs/_local/`
- Saved AvatarKit AI product plan v1 in `docs/product/plan_v1.md`.
- Saved AvatarKit AI implementation plan v1 in `docs/architecture/avatar-kit-ai-technical-design.md`.
- Saved AvatarKit AI phased software specification in `docs/specifications/avatar-kit-ai-software-specification.md`.
- Initialized the GitHub repository and pushed the planning/context baseline to `main`.

## Important Decisions

- The memory system should be file-based and repo-driven so Codex can recover without chat history.
- Durable memory belongs in `docs/project-state.md`.
- Local session memory belongs in `docs/_local/current-session.md` and should not be committed.
- Current product and architecture details are intentionally limited because the inspected workspace is empty and not a git repository.
- Repository coding standards are durable project rules and are recorded in `AGENTS.md` and `docs/project-state.md`.
- The v1 product should be infrastructure, not a generic photo-to-video toy: Avatar Studio, realtime avatar runtime, embeddable widget/SDK, and business dashboard.
- Consent, safety, knowledge grounding, usage/cost tracking, and provider abstraction are first-class product requirements.
- Default first niche is real estate because it is visual, easy to demo, lead-oriented, and safer than healthcare/law.
- v1 implementation should use clean boundaries: no provider logic in route handlers, no avatar provider calls from React components, no business logic in UI components, no unvalidated request payloads, no public widget calls without domain checks, no generated avatar without consent, no answer generation without workspace/avatar lookup, no uploads without signed URL and content validation, no long-running media task in the frontend request lifecycle, and no provider-specific fields in public SDK contracts.
- Development should follow the phased spec: workspace before avatars, avatars before photo upload, photo upload before consent, consent before publish, knowledge before grounded answers, text runtime before TTS, TTS before video, publish before widget, conversations before leads, and basic request/response before realtime.

## Deferred / Not Yet Implemented

- Package manager and verification workflow.
- Database or migration notes.
- Deployment notes.
- Test strategy beyond context-file sanity checks.

## Risks / Watchouts

- There is no application code to validate against, so future sessions must avoid treating this bootstrap state as product architecture.
- If real project files are restored, immediately refresh `docs/project-state.md` from the actual repo instead of preserving these minimal bootstrap notes.
- `docs/_local/current-session.md` is intentionally ignored and will not travel with the repo.
- Local `gh` authentication is currently invalid; use git remote operations or re-authenticate `gh` before GitHub CLI PR workflows.
- Current baseline commit: `ec8daae` (`Add AvatarKit planning docs`).

## Standard Verification

Use these commands for the current bootstrap state:

```bash
pwd
ls -la
find . -maxdepth 3 -type f | sort
test -f AGENTS.md
test -f docs/project-state.md
test -f docs/product/plan_v1.md
test -f docs/architecture/avatar-kit-ai-technical-design.md
test -f docs/specifications/avatar-kit-ai-software-specification.md
test -f docs/_local/current-session.md
grep -n "docs/_local/" .gitignore
grep -n "AvatarKit AI" docs/product/plan_v1.md
grep -n "Technical Implementation Documentation" docs/architecture/avatar-kit-ai-technical-design.md
grep -n "Final Build Sequence" docs/specifications/avatar-kit-ai-software-specification.md
git status --short
```
