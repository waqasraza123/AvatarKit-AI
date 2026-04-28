# Self-Hosted Avatar Engine Research

Phase 22 creates a technical path toward a defensible self-hosted avatar engine while keeping MVP production behavior on the existing provider abstraction.

## Decision Summary

AvatarKit should keep the self-hosted engine behind the Python avatar media provider interface:

```text
AvatarMediaProvider.generate_video(payload: AvatarMediaInput) -> AvatarMediaOutput
```

The TypeScript product, dashboard, widget, SDK, public API, billing, and operations surfaces should not call self-hosted model code directly. They should continue to request `outputMode=video` through the existing runtime boundary.

The Phase 22 implementation adds a disabled-by-default `SELF_HOSTED` provider prototype with two explicit research modes:

- `STATIC_VIDEO`: returns a configured video URL for end-to-end product contract testing.
- `HTTP`: posts the normalized provider payload to a local or private research service.

No self-hosted model is a production dependency in Phase 22.

## Research Tracks

### Track A - 2D Talking Head

Goal: generate a talking-head video from a source photo and speech audio.

Candidate requirements:

- accepts source portrait or cropped face
- accepts generated speech audio or text plus selected voice metadata
- produces MP4 or another browser-playable video
- preserves identity strongly enough for business usage
- completes within a predictable latency budget
- has a commercial-friendly license
- can run in a GPU worker without leaking provider-specific behavior into product code

Primary risks:

- weak identity preservation
- uncanny mouth movement
- poor head motion stability
- long cold starts
- high VRAM usage
- unclear model/data license
- poor failure diagnostics

Research verdict for Phase 22:

This is the most direct path for replacing commercial video providers. It should be evaluated first with short scripted prompts, existing generated TTS audio, and a small internal source-photo set.

### Track B - Realtime Lip Sync

Goal: drive mouth movement with low-latency audio.

Candidate requirements:

- accepts streaming or chunked audio
- outputs animation frames, blendshapes, or short video segments
- keeps end-to-end latency low enough for conversational UX
- tolerates noisy audio and silence
- supports interruption or restart in later realtime phases

Primary risks:

- latency too high for realtime UX
- drift between audio and mouth movement
- quality drops under noisy audio
- complex browser/network transport
- GPU scheduling contention with batch renders

Research verdict for Phase 22:

Do not bind the MVP to realtime lip sync yet. Treat this as a separate engine capability behind future realtime media events. The current request/response media provider contract can carry prototype outputs but should not pretend to be full realtime streaming.

### Track C - 3D Avatar Mode

Goal: support browser-rendered avatars with face validation and blendshape animation.

Candidate requirements:

- validates face/photo suitability before avatar setup completion
- extracts neutral face or avatar rig references
- maps audio or phonemes to blendshapes
- renders efficiently in browser
- supports fallback to 2D/provider-hosted video

Primary risks:

- asset pipeline complexity
- inconsistent browser performance
- hard art-direction and rigging work
- large model/runtime footprint
- more product surface area than the MVP can absorb safely

Research verdict for Phase 22:

3D mode remains a long-term track. The product can keep `AvatarEngine.SELF_HOSTED` as an internal selection value, but no dashboard/user-facing 3D controls should be added in this phase.

## Prototype Provider Contract

Set:

```text
AI_RUNTIME_AVATAR_MEDIA_PROVIDER=SELF_HOSTED
```

Default behavior:

```text
AI_RUNTIME_SELF_HOSTED_AVATAR_MODE=DISABLED
```

Disabled mode returns a structured `provider_unavailable` error. This keeps production safe even if someone selects the provider name without a prototype mode.

### Static Video Mode

```text
AI_RUNTIME_SELF_HOSTED_AVATAR_MODE=STATIC_VIDEO
AI_RUNTIME_SELF_HOSTED_AVATAR_VIDEO_URL=https://example.com/internal-prototype.mp4
AI_RUNTIME_SELF_HOSTED_AVATAR_DURATION_SECONDS=3
```

Static mode is for exercising product storage, trace, usage, and playback paths without running model inference.

### HTTP Prototype Mode

```text
AI_RUNTIME_SELF_HOSTED_AVATAR_MODE=HTTP
AI_RUNTIME_SELF_HOSTED_AVATAR_ENDPOINT=http://127.0.0.1:9010/render
AI_RUNTIME_SELF_HOSTED_AVATAR_TIMEOUT_SECONDS=60
```

The HTTP endpoint receives:

```json
{
  "workspaceId": "workspace_id",
  "avatarId": "avatar_id",
  "conversationId": "conversation_id",
  "messageId": "message_id",
  "text": "Avatar response text",
  "language": "en",
  "photo": {
    "assetId": "asset_id",
    "url": "https://...",
    "mimeType": "image/jpeg",
    "width": 1024,
    "height": 1024
  },
  "voice": {
    "id": "voice_id",
    "provider": "MOCK",
    "providerVoiceId": "mock-professional-english-female",
    "name": "Professional English Female",
    "language": "en",
    "style": "professional",
    "presentationStyle": "warm",
    "status": "ACTIVE"
  },
  "audio": {
    "audioBase64": null,
    "mimeType": null,
    "fileExtension": null,
    "url": null,
    "provider": null
  }
}
```

The endpoint can respond with a completed result:

```json
{
  "status": "completed",
  "providerJobId": "job_123",
  "videoUrl": "https://example.com/render.mp4",
  "durationSeconds": 4.2,
  "metadata": {
    "model": "research-model-name",
    "gpu": "prototype"
  }
}
```

Or with inline video bytes:

```json
{
  "status": "completed",
  "videoBase64": "base64-encoded-video",
  "mimeType": "video/mp4",
  "fileExtension": "mp4",
  "durationSeconds": 4.2
}
```

Or with a processing response:

```json
{
  "status": "processing",
  "providerJobId": "job_123"
}
```

Processing responses reuse the existing Phase 10 behavior: product records that generation is still processing and does not add polling in Phase 22.

Or with a failed response:

```json
{
  "status": "failed",
  "errorCode": "identity_preservation_failed",
  "errorMessage": "Face identity confidence was below threshold."
}
```

## GPU Worker Queue Direction

The self-hosted engine should eventually run as a private worker service:

```text
TypeScript app -> Python runtime -> AvatarMediaProvider(SELF_HOSTED) -> GPU render service -> object storage/media result
```

Queue requirements for a later implementation:

- job id
- workspace id
- avatar id
- source photo asset id
- voice/audio reference
- priority
- timeout
- retry count
- GPU model/version metadata
- failure reason
- storage location

Phase 22 does not add a queue. The HTTP prototype shape is designed so a future queue worker can preserve the same provider boundary.

## Face Validation Direction

MediaPipe or equivalent face validation should eventually run before publishing or before self-hosted generation:

- single face detected
- face not too small
- face not too rotated
- eyes and mouth visible
- minimum image resolution
- no obvious occlusion
- optional quality score

The existing source-photo validation boundary can absorb these checks in a future phase. Phase 22 only documents the path and keeps runtime generation gated by existing photo consent/readiness.

## Failure Taxonomy

Prototype failures should normalize into provider errors:

- `provider_not_configured`
- `dependency_missing`
- `provider_request_failed`
- `provider_unavailable`
- `self_hosted_generation_failed`
- `identity_preservation_failed`
- `face_validation_failed`
- `gpu_unavailable`
- `license_blocked`
- `timeout`

These failures should appear in existing runtime traces and Phase 21 operations views.

## Recommendation

Proceed in this order:

1. Use `STATIC_VIDEO` to confirm product contract compatibility.
2. Stand up a private HTTP render prototype that returns either `videoUrl` or `videoBase64`.
3. Evaluate 2D talking-head candidates against quality, latency, VRAM, license, and identity preservation.
4. Add face validation scoring before any self-hosted output is considered production eligible.
5. Add queue-backed job persistence only after a candidate can reliably produce acceptable short videos.

Do not expose self-hosted controls in customer UI until quality, licensing, safety, and operational cost are proven.
