# Runtime Fallbacks

Phase 25 hardens fallback behavior with safe visitor-facing messages and operator-visible metadata. Verification is pending manual owner checks.

## Text Runtime

If the TypeScript-to-Python runtime request fails, times out, or is not configured, dashboard, widget, kiosk, and public API flows should persist a safe fallback answer and mark the runtime status as error/fallback in metadata.

## Knowledge Retrieval

If no READY knowledge is available or retrieval confidence is low, the runtime should use the avatar fallback message, request handoff when appropriate, and record knowledge gap metadata through trusted server code.

## LLM Failure

LLM failures should not expose provider responses, stack traces, keys, or hidden prompt details. Operators should inspect `RuntimeTrace`, `UsageEvent`, and `SafetyEvent` metadata.

## TTS Failure

Text answers should remain available when TTS fails. Audio-specific errors should be safe and visible in dashboard metadata without leaking provider raw responses.

## STT Failure

Voice preview transcription failure should not create empty visitor messages. The UI should offer text fallback.

## Avatar Video Failure

Video failure should preserve generated text/audio where available. Public widget video is returned only through controlled widget media tokens; provider-hosted widget URLs are blocked from public output.

## Widget Failure

Widget endpoints return structured `{ status, code, message }` errors and safe fallback messages. Domain allowlist, published status, and suspension checks must remain in place.

## Public API Failure Format

Public API v1 returns structured JSON errors. Runtime failures produce safe answer text and metadata; raw provider details are not part of public responses.

## Realtime Fallback

Realtime widget sessions reuse the standard widget message path. If realtime processing fails, the stream sends a safe `error` event and records realtime failure traces.

## Safety Fallback

Unsafe input or output should refuse, rewrite, or hand off according to the safety policy. Safety events store safe excerpts and sanitized metadata.

## Storage Failure

Media storage failures should not crash the primary text response. They should produce safe audio/video errors and storage failure traces.

## Usage And Audit Write Failure

Usage and mutation trace writes are non-blocking where the primary operation can safely continue. Missing usage/audit writes remain an operational gap to inspect manually.

## Operator Visibility

Operators should inspect:

- `/dashboard/operations`
- `/dashboard/conversations`
- `/dashboard/safety`
- `/dashboard/usage`
- Runtime trace rows for `runtime.failed`, provider failures, media failures, realtime failures, and `audit.*` mutation traces.
