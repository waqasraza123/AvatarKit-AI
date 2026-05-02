# Conversation Intelligence

Phase 28 adds a deterministic conversation-intelligence foundation for workspace dashboards.

## Scope

- `/dashboard/analytics` summarizes workspace-owned conversations.
- Analytics derive from existing conversations, messages, leads, safety events, and knowledge gaps.
- Conversation detail pages show a summary, primary intent, outcome, counts, and review highlights.
- The dashboard includes:
  - period filtering for 7 days, 30 days, 90 days, and all time
  - conversation, visitor-message, lead-conversion, handoff, failure, and review-signal metrics
  - intent mix
  - outcome mix
  - channel performance
  - repeated visitor questions
  - per-avatar performance
  - recent deterministic conversation summaries

## Intent Classification

Intent classification is deterministic keyword classification. It is intentionally simple and reviewable.

Current intent buckets:

- Pricing
- Booking
- Availability
- Location
- Support
- Sales
- Contact
- Policy
- Product
- Knowledge gap
- General

Knowledge gaps take priority when a conversation has linked knowledge-gap records.

## Outcome Classification

Outcomes are derived from persisted state in this order:

1. Lead captured
2. Handoff requested
3. Knowledge gap
4. Safety review
5. Failed
6. Resolved
7. Active

This keeps operational review signals visible before generic active or resolved states.

## Summary Generation

Phase 28 does not call an LLM for summaries. Summaries use:

- `Conversation.summary` when already present
- first visitor message
- latest avatar response
- deterministic intent and outcome labels

This avoids new provider cost, background jobs, prompt storage, or moderation obligations.

## Data Boundaries

- Analytics are workspace-scoped.
- The dashboard caps analytics reads to the latest 500 conversations for responsiveness.
- The implementation does not add new schema or migrations.
- No transcript content is sent to external analytics providers.
- Private source photo paths, provider secrets, raw API keys, webhook secrets, session tokens, and hidden prompts are not surfaced.

## Non-Goals

Phase 28 does not add:

- LLM-generated summaries
- semantic clustering
- embeddings
- external BI exports
- CRM sync
- email notifications
- lead scoring automation
- visitor identity resolution
- cross-workspace analytics
- background analytics jobs
- billing enforcement
