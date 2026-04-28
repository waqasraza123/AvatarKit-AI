# Phase 23 Kiosk Mode

Phase 23 adapts published avatars for physical touchscreen environments without changing the private runtime boundary.

## Scope

Phase 23 adds:

- `KioskSettings` schema for one kiosk configuration per published avatar
- `/dashboard/kiosk` management for operator-or-higher roles
- public full-screen kiosk route at `/kiosk/[avatarId]`
- public kiosk API routes under `/api/kiosk`
- `ConversationChannel.KIOSK` persistence for separate review and reporting
- kiosk-specific runtime trace, usage, safety, and knowledge-gap source tagging
- inactivity idle screen and privacy timeout reset behavior
- kiosk lead capture submission when the runtime requests contact details
- QR handoff and staff-call links
- browser voice input when supported, with touch-friendly text fallback

Phase 23 does not add:

- WebRTC avatar calls
- continuous listening
- barge-in or interruption handling
- live staff chat
- kiosk hardware provisioning
- MDM or device management
- offline runtime
- custom kiosk lead forms
- payment, booking, or CRM integrations

## Dashboard Management

Operators, admins, and owners can manage kiosk settings at:

```text
/dashboard/kiosk
```

The dashboard only lists published avatars. Each selected avatar can be configured with:

- enabled state
- idle greeting
- inactivity timeout
- privacy timeout
- allowed language override
- lead capture toggle
- QR handoff URL
- staff call label and URL

Viewer roles can inspect settings but cannot update them.

## Public Runtime

The public kiosk screen is available at:

```text
/kiosk/[avatarId]
```

The route loads only safe public avatar display fields and enabled kiosk settings. The runtime rejects:

- unknown avatars
- unpublished avatars
- suspended or publish-ineligible avatars
- avatars without enabled kiosk settings
- expired conversations
- over-limit public message bursts

Messages are text runtime calls through the existing TypeScript-to-Python boundary. Browser speech recognition may fill the same text message path when the device supports it. If voice input is unavailable, the kiosk remains usable through the large text input.

## API Routes

Phase 23 adds:

```text
GET  /api/kiosk/[avatarId]/config
POST /api/kiosk/[avatarId]/session
POST /api/kiosk/[avatarId]/sessions/[conversationId]/message
POST /api/kiosk/[avatarId]/lead
POST /api/kiosk/[avatarId]/sessions/[conversationId]/end
```

The session route creates `ConversationChannel.KIOSK` conversations. The message route validates the active kiosk conversation, enforces the privacy timeout server-side, stores visitor and avatar messages, calls the existing runtime, and records safety events, knowledge gaps, runtime traces, and usage events. The lead route validates kiosk lead submissions, stores `LeadSource.KIOSK`, and reuses the existing lead safety checks.

## Privacy Behavior

The browser kiosk shell tracks last interaction time.

- Inactivity timeout returns the screen to the idle attract state.
- Privacy timeout ends the active conversation, clears transcript state, and returns to idle.
- The message API also expires conversations whose `updatedAt` exceeds the configured privacy timeout.
- Manual reset ends the active conversation and clears local transcript state.

## Manual Approval Checklist

Before approving Phase 23 manually:

1. Generate Prisma client and create/apply the migration for `KioskSettings` and enum additions.
2. Publish an avatar that remains public-runtime eligible.
3. Open `/dashboard/kiosk` as OWNER, ADMIN, OPERATOR, and VIEWER and confirm role behavior.
4. Enable kiosk mode for the published avatar and open `/kiosk/[avatarId]`.
5. Confirm idle screen, touch controls, message submit, reset, QR handoff, and staff call behavior.
6. Confirm a kiosk message creates a `ConversationChannel.KIOSK` conversation with persisted visitor/avatar messages.
7. Trigger a runtime lead-capture prompt and confirm submitting details creates or updates a `LeadSource.KIOSK` lead.
8. Confirm privacy timeout ends the session and a later message requires a fresh session.
9. Confirm safety events and knowledge gaps from kiosk runtime use kiosk-specific sources.

No automated verification was run for this implementation pass per the current instruction.
