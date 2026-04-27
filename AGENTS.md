# Agent Instructions

This file is the durable instruction entry point for future Codex sessions in this project.

- Always read `docs/project-state.md` before making implementation decisions.
- Read `docs/_local/current-session.md` if it exists before starting work.
- Treat `docs/project-state.md` as durable repo memory.
- Treat `docs/_local/current-session.md` as local working memory.
- Update `docs/project-state.md` only when long-term architecture, roadmap, constraints, or important decisions change.
- Update `docs/_local/current-session.md` at the end of every meaningful task.
- Never store secrets, credentials, tokens, private keys, or environment values in these files.
- Keep these files concise and useful.
- Prefer exact next steps, constraints, changed files, and verification commands over long prose.
- Follow existing repository architecture and conventions.
- Avoid noisy, speculative, or stale notes.
- Keep this `AGENTS.md` small and durable.

## Coding Rules

- Do not add comments in code.
- Use descriptive and consistent names.
- Prefer reusable modules and components over large multi-purpose files.
- Write production-grade code with maintainable structure, strong typing, validation, and error handling.
- Do not guess missing requirements; state assumptions explicitly when needed.
- Avoid hardcoded values, hacks, and tightly coupled logic.
- Keep code modular, testable, and scalable.
- Keep commit messages under 140 characters.
