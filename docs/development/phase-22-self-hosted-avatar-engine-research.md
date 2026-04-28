# Phase 22 Self-Hosted Avatar Engine Research

Phase 22 creates a technical path toward a self-hosted avatar engine without making it a production dependency.

Detailed research findings live in:

```text
docs/research/self-hosted-avatar-engine.md
```

## Scope

Phase 22 adds:

- documented research tracks for 2D talking-head generation, realtime lip sync, and 3D avatar mode
- a disabled-by-default `SELF_HOSTED` avatar media provider prototype behind the existing Python provider interface
- static-video prototype mode for end-to-end product contract testing
- HTTP prototype mode for a private render service
- normalized self-hosted request/response payload documentation
- failure taxonomy and GPU worker queue direction

Phase 22 does not add:

- production self-hosted inference
- GPU worker queue
- customer-facing self-hosted controls
- browser-rendered 3D avatar mode
- WebRTC avatar calls
- realtime lip-sync transport
- model dependency installation
- new public API contracts

## Runtime Configuration

The provider remains selected through the existing variable:

```text
AI_RUNTIME_AVATAR_MEDIA_PROVIDER=SELF_HOSTED
```

By default the self-hosted provider is disabled:

```text
AI_RUNTIME_SELF_HOSTED_AVATAR_MODE=DISABLED
```

Disabled mode returns a structured `provider_unavailable` error.

### Static Prototype

```text
AI_RUNTIME_SELF_HOSTED_AVATAR_MODE=STATIC_VIDEO
AI_RUNTIME_SELF_HOSTED_AVATAR_VIDEO_URL=https://example.com/internal-prototype.mp4
AI_RUNTIME_SELF_HOSTED_AVATAR_DURATION_SECONDS=3
```

Static mode returns a configured video URL through the same `AvatarMediaOutput` path as commercial providers. It is useful for checking storage, usage, traces, and playback behavior without running model inference.

### HTTP Prototype

```text
AI_RUNTIME_SELF_HOSTED_AVATAR_MODE=HTTP
AI_RUNTIME_SELF_HOSTED_AVATAR_ENDPOINT=http://127.0.0.1:9010/render
AI_RUNTIME_SELF_HOSTED_AVATAR_TIMEOUT_SECONDS=60
```

HTTP mode posts a normalized render payload to a private research endpoint. The endpoint may return:

- completed hosted video URL
- completed base64 video bytes
- processing job id
- failed status with normalized code/message

Processing responses reuse the existing no-polling Phase 10 behavior.

## Product Boundary

The product boundary does not change:

```text
TypeScript dashboard/widget/public API -> Python runtime -> AvatarMediaProvider
```

React components, widget code, public API routes, and dashboard actions still never call model engines or provider APIs directly.

## Manual Approval Checklist

Before approving Phase 22 manually:

1. Review `docs/research/self-hosted-avatar-engine.md`.
2. Confirm `AI_RUNTIME_AVATAR_MEDIA_PROVIDER=SELF_HOSTED` with disabled mode returns a structured unavailable error.
3. Configure static mode and confirm the runtime can return the configured video URL.
4. Configure HTTP mode against a private prototype endpoint and confirm completed, processing, and failed responses normalize into existing runtime video output/error shapes.
5. Confirm Phase 21 operations can inspect provider failures from runtime traces.
6. Confirm no customer-facing self-hosted controls were added.

No automated verification was run for this implementation pass per the current instruction.
