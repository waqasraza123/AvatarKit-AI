# AvatarKit AI Plan v1

Below is a serious product plan for building an Apple-inspired avatar product that is difficult to build even with AI coding.

The goal is not to make a cheap "upload photo and generate video" toy. The goal is to build a real avatar infrastructure product that businesses can use to create, control, embed, and operate talking AI avatars.

# Product Name

## AvatarKit AI

### Positioning

> Apple-inspired talking avatar infrastructure for businesses. Create a lifelike AI avatar, give it business knowledge, let visitors talk to it in real time, and embed it anywhere.

### One-line pitch

> AvatarKit AI turns a business photo, brand character, or digital persona into a real-time talking AI assistant for websites, kiosks, onboarding, sales, support, and education.

---

# 1. Product Vision

Most avatar products are either:

- simple talking photo generators
- video generation tools
- chatbot widgets
- closed API demos
- deepfake-like toys

AvatarKit AI should be different.

It should be a complete business avatar operating system:

```text
Create avatar
-> verify consent
-> add business knowledge
-> choose voice/personality
-> test live conversation
-> embed on website/kiosk
-> capture leads
-> review transcripts
-> improve answers
-> monitor usage/cost/safety
```

The "Apple-like" part should come from the experience quality, not only the face model:

- guided avatar creation
- polished capture flow
- realistic preview
- privacy-first UX
- smooth voice interaction
- high-quality animations
- natural turn-taking
- premium UI
- strong safety layer
- simple business deployment

Apple's Persona flow is built around guided capture, edit controls, and privacy/security around the generated persona, so AvatarKit AI should also treat capture, consent, identity, and quality control as first-class parts of the system. ([NVIDIA Docs][1])

---

# 2. Best Market Angle

Do not sell it as:

> Upload any photo and make it talk.

That sounds like a deepfake app and invites abuse.

Sell it as:

> AI video front desk for businesses.

Or:

> Avatar infrastructure for companies that want human-like AI support, sales, training, and onboarding.

## Best customer niches

Start with niches where the value is obvious:

### 1. Real estate

Avatar explains listings, qualifies buyers, books property calls.

### 2. Clinics

Avatar answers service/appointment questions and captures patient requests. It should not diagnose.

### 3. Law firms

Avatar collects intake details and explains service areas. It should not give legal advice.

### 4. Coaches and consultants

Avatar explains offers, answers FAQs, and books calls.

### 5. SaaS onboarding

Avatar guides users through setup.

### 6. Education/training

Avatar explains course material and answers lesson-specific questions.

### 7. Kiosks

Avatar runs on a touchscreen in clinics, exhibitions, hotels, offices, malls, or universities.

For portfolio and Upwork, the strongest demo niche is:

# AI Video Front Desk for Service Businesses

It is visual, useful, and easy for clients to understand.

---

# 3. Product Shape

AvatarKit AI should have four main products inside it.

## A. Avatar Studio

Business owner creates and configures the avatar.

Features:

- upload face photo or brand character
- optional guided webcam capture
- face quality check
- consent confirmation
- crop/lighting validation
- choose voice
- choose language
- define role/personality
- add business instructions
- add knowledge sources
- preview responses
- publish avatar

## B. Realtime Avatar Runtime

This is the actual talking avatar experience.

Features:

- visitor speaks or types
- system detects speech
- converts speech to text
- retrieves business knowledge
- generates safe answer
- converts answer to speech
- animates avatar face/lips
- streams response back
- handles interruptions
- saves transcript

D-ID offers real-time video streaming APIs for talking-head avatars, while Tavus provides real-time conversational video interfaces where an AI replica can see, hear, and respond through video. These are good commercial engines for the first functional version. ([D-ID][2])

## C. Embeddable Widget / SDK

Businesses can embed the avatar on any website.

Example:

```html
<script
  src="https://avatarkit.ai/widget.js"
  data-avatar-id="av_123"
  data-mode="floating">
</script>
```

React SDK:

```tsx
<AvatarKitProvider apiKey={process.env.NEXT_PUBLIC_AVATARKIT_KEY}>
  <TalkingAvatar avatarId="av_123" />
</AvatarKitProvider>
```

This is what makes it feel like infrastructure instead of a normal app.

## D. Business Dashboard

Business owner sees what the avatar is doing.

Features:

- conversations
- leads
- unanswered questions
- top user intents
- failed responses
- usage minutes
- estimated cost
- safety incidents
- conversion rate
- export transcripts
- improve knowledge base

---

# 4. Core User Journey

## Business owner journey

```text
Sign up
-> create workspace
-> create avatar
-> upload/capture photo
-> confirm consent
-> choose voice/language
-> add business knowledge
-> test avatar
-> publish
-> copy embed code
-> review conversations/leads
```

## Visitor journey

```text
Open business website
-> avatar greets visitor
-> visitor asks by text or voice
-> avatar answers with voice/video
-> avatar offers next step
-> captures lead
-> optionally hands off to human
```

## Admin/operator journey

```text
Review transcripts
-> see failed questions
-> update knowledge
-> mark bad answers
-> tune avatar instructions
-> monitor usage and safety
```

---

# 5. Technical Architecture

## Recommended v1 stack

Frontend:

```text
Next.js App Router
TypeScript
Tailwind CSS
Framer Motion
React Query
Zustand or Jotai
WebRTC/video player layer
Audio recorder component
Embeddable widget bundle
```

Backend:

```text
NestJS or Fastify
PostgreSQL/Supabase
Prisma
Redis
BullMQ or similar queue
S3/R2/Supabase Storage
WebSockets
Webhook processor
Rate limiting
Audit logs
```

AI/media services:

```text
LLM: OpenAI / Anthropic
STT: Whisper / Deepgram
TTS: ElevenLabs / OpenAI TTS / Azure TTS
Avatar engine v1: D-ID / Tavus / Simli
Knowledge search: pgvector / Qdrant
Moderation: OpenAI moderation or custom classifier
```

Future self-hosted avatar layer:

```text
MediaPipe Face Landmarker
MuseTalk / SadTalker / LivePortrait
NVIDIA Audio2Face-3D
Three.js / React Three Fiber
GPU worker queue
```

MediaPipe Face Landmarker is useful for detecting face landmarks and blendshapes in images/video, which makes it suitable for guided capture, quality checks, and avatar control. NVIDIA Audio2Face-3D is relevant for a serious 3D path because it converts speech into ARKit blendshapes with emotional expression. ([NVIDIA Docs][1])

---

# 6. System Flow

## Text conversation flow

```text
Visitor types question
-> API receives message
-> load avatar config
-> load workspace safety policy
-> retrieve relevant knowledge chunks
-> generate answer
-> verify answer against policy
-> generate TTS audio
-> send text + audio to avatar engine
-> avatar engine returns video/stream
-> frontend plays response
-> save message/transcript/usage
```

## Voice conversation flow

```text
Visitor speaks
-> browser records audio
-> STT converts audio to text
-> intent and language detection
-> knowledge retrieval
-> LLM generates answer
-> safety guard validates answer
-> TTS creates voice
-> avatar engine animates face/lips
-> response streams to visitor
-> transcript saved
```

## Realtime advanced flow

```text
Mic stream
-> voice activity detection
-> partial transcription
-> turn-taking engine
-> LLM streaming response
-> sentence-level TTS
-> avatar streaming
-> interrupt handling
-> transcript + event logging
```

The advanced flow is where the product becomes genuinely difficult.

---

# 7. Product Modules

## Module 1: Workspace and Auth

Build proper SaaS foundation.

Features:

- email/password or magic link auth
- workspace creation
- team members
- roles: owner, admin, operator, viewer
- API keys
- billing plan
- usage limits

Tables:

```text
users
workspaces
workspace_members
api_keys
billing_plans
usage_events
```

---

## Module 2: Avatar Studio

This is the premium creation flow.

Screens:

1. Create Avatar
2. Upload/Capture
3. Quality Check
4. Consent
5. Voice
6. Personality
7. Knowledge
8. Preview
9. Publish

Avatar creation should feel like a guided Apple-style setup, not a boring form.

### Capture checks

Check:

- one visible face
- face centered
- minimum resolution
- no heavy blur
- no extreme angle
- decent lighting
- no sunglasses
- face not too small
- file size/type
- consent recorded

### Avatar table

```text
avatars
- id
- workspace_id
- name
- display_name
- role
- status
- engine
- photo_url
- preview_video_url
- voice_id
- language
- personality_prompt
- safety_profile_id
- consent_record_id
- published_at
- created_at
- updated_at
```

---

## Module 3: Consent and Safety

This must be part of v1.

Features:

- "I own this image or have permission"
- no public figure / celebrity impersonation
- no political impersonation
- no adult/abusive use
- consent record saved
- image source saved
- audit log
- delete avatar
- report abuse
- watermark free videos

Tables:

```text
consent_records
- id
- workspace_id
- avatar_id
- consent_type
- accepted_by_user_id
- accepted_ip
- accepted_user_agent
- terms_version
- created_at

safety_events
- id
- workspace_id
- avatar_id
- conversation_id
- event_type
- severity
- input
- output
- decision
- created_at
```

This makes the product credible. Clients will trust it more.

---

## Module 4: Voice System

For v1, avoid default voice cloning. Use selectable voices.

Features:

- choose voice
- choose language
- preview sentence
- voice speed
- tone style
- fallback voice

Later:

- verified custom voice
- voice consent
- voice sample upload
- multilingual voice profiles

Tables:

```text
voices
- id
- provider
- provider_voice_id
- name
- language
- gender_style
- preview_url
- status
```

---

## Module 5: Knowledge Base

This turns the avatar into a business assistant.

Knowledge sources:

- manual FAQs
- website URL
- PDFs
- docs
- pricing text
- service pages
- business policies
- opening hours
- booking instructions

Features:

- upload PDF
- add website URL
- add manual text
- chunk content
- embed chunks
- search relevant chunks
- cite source internally
- mark stale content
- re-ingest source

Tables:

```text
knowledge_sources
- id
- workspace_id
- type
- title
- source_url
- file_url
- status
- last_ingested_at

knowledge_chunks
- id
- source_id
- workspace_id
- content
- embedding
- metadata
```

Important: The avatar should answer from approved business knowledge, not random internet knowledge.

---

## Module 6: Conversation Engine

This is the brain.

Inputs:

- visitor question
- avatar personality
- workspace knowledge
- previous messages
- safety rules
- lead capture goals
- escalation rules

Outputs:

- answer text
- suggested next action
- should_capture_lead
- should_handoff
- safety_status
- source references

Use structured output:

```json
{
  "answer": "Yes, we can help with property valuation...",
  "intent": "service_inquiry",
  "confidence": 0.82,
  "leadCapture": {
    "required": true,
    "fields": ["name", "phone", "preferred_time"]
  },
  "handoff": {
    "required": false,
    "reason": null
  },
  "sources": ["src_123", "src_456"]
}
```

Tables:

```text
conversations
- id
- workspace_id
- avatar_id
- visitor_id
- channel
- status
- lead_status
- summary
- created_at
- ended_at

messages
- id
- conversation_id
- role
- content
- audio_url
- video_url
- metadata
- created_at
```

---

## Module 7: Avatar Media Engine

In v1, create a provider abstraction.

```text
AvatarEngine
- createAvatar()
- generateSpeechVideo()
- startRealtimeSession()
- endRealtimeSession()
- getSessionStatus()
```

Provider options:

```text
D-ID Provider
Tavus Provider
Simli Provider
Mock Provider
Future Self-Hosted Provider
```

This abstraction is important. It prevents the product from becoming only a D-ID/Tavus wrapper.

D-ID supports talking avatars from images/text/audio and real-time streaming use cases, while Tavus offers an end-to-end conversational video interface API. Build the product so either can be swapped underneath. ([D-ID][3])

---

## Module 8: Embeddable Widget

This is a major product differentiator.

Widget modes:

```text
floating bubble
full-screen assistant
inline website section
kiosk mode
voice-only mode
video-only mode
```

Widget features:

- load avatar config
- show greeting
- text input
- voice input
- video player
- lead capture card
- handoff button
- fallback chat
- session tracking
- error fallback

Embed code:

```html
<script
  src="https://cdn.avatarkit.ai/widget.js"
  data-avatar-id="av_123"
  data-theme="light"
  data-position="bottom-right">
</script>
```

React package:

```tsx
<TalkingAvatar
  avatarId="av_123"
  mode="floating"
  theme="light"
  enableVoice
  enableLeadCapture
/>
```

---

## Module 9: Analytics Dashboard

Businesses need proof that the avatar is useful.

Show:

- total conversations
- total avatar minutes
- leads captured
- average session length
- top questions
- unanswered questions
- handoff requests
- conversion rate
- cost per conversation
- language breakdown
- safety events
- failed render events

Screens:

- Overview
- Conversations
- Leads
- Knowledge Gaps
- Avatar Usage
- Safety Logs
- Billing/Usage

This is what makes it a SaaS, not just a demo.

---

# 8. UI/UX Direction

Make it light, premium, animated, and futuristic.

Avoid a generic dark AI dashboard.

## Visual style

Use:

- off-white background
- soft gradients
- glass panels
- blue/violet/lime accents
- rounded cards
- animated waveform
- floating avatar preview
- smooth motion
- large clean typography
- fewer words
- more interactive visuals

## Homepage sections

### Hero

Headline:

> Create talking AI avatars for your business.

Subheadline:

> Upload a photo, add your business knowledge, and launch a real-time video assistant that answers visitors, captures leads, and works anywhere.

Hero visual:

- avatar face card
- audio waveform
- chat bubbles
- lead captured card
- embed code card
- "Live now" badge

### Problem

Cards:

- Visitors leave before talking to staff
- Chatbots feel cold
- Video support is expensive
- Business knowledge is scattered
- Leads are missed after hours

### Solution

Cards:

- Talking avatar
- Business knowledge
- Voice conversation
- Lead capture
- Human handoff
- Embed anywhere

### Live demo

Let user try:

```text
Choose business type
-> ask avatar a question
-> see avatar answer
-> lead capture appears
```

### Developer section

Show SDK snippet and embed snippet.

### Safety section

Show consent, control, delete, audit log, moderation.

### Pricing section

Plans:

- Starter
- Growth
- Agency
- Enterprise

---

# 9. MVP Scope

## MVP should include

Build this first:

### Public website

- landing page
- live interactive demo
- pricing-style section
- docs preview

### SaaS app

- auth
- workspace
- create avatar
- upload photo
- consent checkbox
- choose voice
- add FAQs
- preview avatar response
- publish avatar
- copy embed code

### Runtime

- text input
- AI answer
- TTS
- talking avatar response through commercial provider
- transcript saved

### Dashboard

- conversations list
- message transcript
- leads list
- usage count

### Widget

- floating website widget
- text chat
- avatar response video
- lead capture form

This MVP is already impressive.

## MVP should not include yet

Avoid in first release:

- custom ML model training
- real 3D head reconstruction
- voice cloning
- mobile apps
- full kiosk device management
- complicated billing
- many avatar engines
- public marketplace
- celebrity avatar generation

---

# 10. Advanced Roadmap

## Phase 1: Showy API-powered MVP

Goal: build a beautiful working product.

Build:

- landing page
- Avatar Studio
- D-ID/Tavus integration
- knowledge FAQ
- text-to-avatar response
- conversation dashboard
- embeddable widget

Acceptance criteria:

```text
A business can create an avatar.
A visitor can ask a question.
The avatar can answer in a video/voice response.
The conversation is saved.
The business can copy an embed script.
```

---

## Phase 2: Real-time Voice Avatar

Goal: make it feel alive.

Build:

- microphone input
- STT
- voice activity detection
- streaming response
- turn-taking
- interruption handling
- WebRTC provider integration
- fallback to text mode

Acceptance criteria:

```text
Visitor can talk by voice.
Avatar replies with voice/video.
System handles silence and failed audio.
Conversation remains saved and reviewable.
```

---

## Phase 3: Business Intelligence Layer

Goal: make it useful for businesses.

Build:

- lead capture rules
- top questions
- unanswered questions
- knowledge gap detection
- conversation summary
- CRM webhook
- email notification
- human handoff

Acceptance criteria:

```text
Avatar can capture lead details.
Business can see why visitors contacted the avatar.
Admin can improve knowledge from failed answers.
```

---

## Phase 4: Developer SDK

Goal: make it infrastructure.

Build:

- widget CDN
- React SDK
- API keys
- docs
- webhooks
- usage events
- sandbox mode

Acceptance criteria:

```text
A developer can embed avatar using a script tag.
A React app can use the SDK component.
API keys and usage limits work.
```

---

## Phase 5: Self-hosted Avatar Engine

Goal: make it technically deep.

Build:

- GPU worker queue
- render job system
- provider abstraction
- MuseTalk/SadTalker/LivePortrait experiments
- media storage pipeline
- quality scoring
- render monitoring

Acceptance criteria:

```text
Product can generate avatar output without depending only on commercial APIs.
Render jobs are queued, monitored, retried, and stored.
```

---

## Phase 6: Apple-inspired 3D Mode

Goal: create serious moat.

Build:

- guided face capture
- MediaPipe face landmark validation
- 3D avatar rig
- ARKit blendshape pipeline
- NVIDIA Audio2Face-3D integration
- Three.js/R3F renderer
- emotion controls
- idle expressions

NVIDIA's Audio2Face-3D path is particularly relevant because it outputs ARKit blendshapes from speech and includes emotional expression, which fits a 3D avatar runtime. ([NVIDIA Docs][1])

Acceptance criteria:

```text
Avatar can render as a controllable 3D face/body.
Speech drives facial blendshapes.
Browser runtime can display animated avatar.
```

---

# 11. Data Model

Core tables:

```text
users
workspaces
workspace_members
avatars
avatar_assets
voices
knowledge_sources
knowledge_chunks
conversations
messages
leads
consent_records
safety_profiles
safety_events
render_jobs
avatar_sessions
usage_events
api_keys
webhooks
billing_customers
billing_subscriptions
```

## Example entity relationships

```text
workspace
  has many avatars
  has many knowledge_sources
  has many conversations
  has many leads
  has many api_keys

avatar
  belongs to workspace
  has one consent_record
  has many avatar_assets
  has many conversations
  has one voice

conversation
  belongs to workspace
  belongs to avatar
  has many messages
  may create lead
```

---

# 12. API Design

## Avatar APIs

```text
POST   /api/avatars
GET    /api/avatars
GET    /api/avatars/:id
PATCH  /api/avatars/:id
DELETE /api/avatars/:id

POST   /api/avatars/:id/photo
POST   /api/avatars/:id/consent
POST   /api/avatars/:id/preview
POST   /api/avatars/:id/publish
```

## Knowledge APIs

```text
POST   /api/knowledge/sources
GET    /api/knowledge/sources
POST   /api/knowledge/sources/:id/ingest
DELETE /api/knowledge/sources/:id
```

## Conversation APIs

```text
POST   /api/conversations
GET    /api/conversations
GET    /api/conversations/:id
POST   /api/conversations/:id/messages
POST   /api/conversations/:id/lead
POST   /api/conversations/:id/handoff
```

## Runtime APIs

```text
POST   /api/runtime/:avatarId/message
POST   /api/runtime/:avatarId/voice
POST   /api/runtime/:avatarId/session
DELETE /api/runtime/sessions/:sessionId
```

## Widget APIs

```text
GET    /api/widget/:avatarId/config
POST   /api/widget/:avatarId/session
POST   /api/widget/:avatarId/message
```

## Webhook events

```text
conversation.started
conversation.ended
lead.created
handoff.requested
avatar.failed
safety.flagged
usage.limit_reached
```

---

# 13. Difficult Parts That Create the Moat

This product becomes difficult if these are solved properly:

## 1. Latency

Users will not tolerate slow responses.

Target:

```text
Text response visible: < 2 seconds
Voice response start: < 3 seconds
Realtime avatar reply: as low as provider allows
```

## 2. Turn-taking

The avatar must know:

- when user finished speaking
- when to interrupt
- when to pause
- when to ask a follow-up
- when to stop talking

## 3. Fallbacks

If video fails:

```text
fallback to audio
fallback to text
fallback to contact form
fallback to human handoff
```

## 4. Knowledge grounding

Avatar must not invent services, prices, legal/medical advice, or policies.

Add:

- answer confidence
- source retrieval score
- refusal behavior
- escalation behavior

## 5. Abuse prevention

Need rules against:

- impersonation
- public figures
- harmful instructions
- sexual content
- fraud
- fake endorsements
- unauthorized face/voice use

## 6. Cost control

Avatar video and TTS can become expensive.

Track:

- message count
- video seconds
- TTS characters
- STT minutes
- LLM tokens
- render jobs
- failed jobs

## 7. SDK reliability

An embeddable widget must not break client websites.

Requirements:

- isolated CSS
- small bundle
- async loading
- graceful failure
- no global pollution
- secure API key handling
- domain allowlist

---

# 14. Security and Privacy

Must-have:

- signed upload URLs
- private media storage
- workspace-level access control
- domain allowlist for widgets
- API key rotation
- rate limits
- audit logs
- PII handling
- consent records
- deletion request flow
- transcript export/delete
- encrypted secrets
- webhook signature verification

Avatar media should be treated as sensitive identity data.

---

# 15. Testing Plan

## Unit tests

Test:

- prompt builders
- safety guards
- lead extraction
- avatar provider adapters
- billing usage counters
- permission checks

## Integration tests

Test:

- create avatar
- upload photo
- create knowledge source
- ask question
- generate response
- save transcript
- create lead

## E2E tests

With Playwright:

```text
sign up
create workspace
create avatar
add FAQ
preview avatar
publish avatar
open widget
ask question
see response
check dashboard transcript
```

## Media pipeline tests

Test:

- failed provider response
- timeout
- bad image
- missing voice
- STT failure
- TTS failure
- retry job
- fallback behavior

---

# 16. Pricing Model

Do not price only by user seats. Avatar products have usage cost.

## Starter

For small businesses.

```text
1 avatar
limited conversations
limited video minutes
basic widget
basic analytics
```

## Growth

For active websites.

```text
3 avatars
more video minutes
lead capture
knowledge ingestion
conversation summaries
custom branding
```

## Agency

For freelancers/agencies.

```text
multiple client workspaces
white-label widget
API access
webhooks
team members
```

## Enterprise

For clinics, schools, property groups, kiosks.

```text
SLA
custom avatar flow
private deployment
advanced safety
custom integrations
```

Usage metric:

```text
avatar video minutes
voice minutes
LLM messages
knowledge storage
number of avatars
```

---

# 17. First Build Version

The first serious version should be:

# AvatarKit AI v0.1

## Build these screens

### Public

1. Home page
2. Live demo page
3. Use cases page
4. Pricing page
5. Docs preview page

### App

1. Dashboard
2. Avatar Studio
3. Knowledge Base
4. Live Preview
5. Conversations
6. Leads
7. Embed Settings
8. Usage

## Build these backend features

1. Auth
2. Workspace
3. Avatar CRUD
4. Photo upload
5. Consent record
6. FAQ knowledge source
7. LLM answer generation
8. TTS generation
9. D-ID/Tavus avatar response
10. Conversation storage
11. Lead capture
12. Widget config API

## Build this widget

1. Floating launcher
2. Avatar video card
3. Text input
4. Lead capture form
5. Fallback text answer
6. Session tracking

This is enough to show a client.

---

# 18. Suggested Repository Structure

```text
avatarkit-ai/
  apps/
    web/
      app/
      components/
      features/
      lib/
    api/
      src/
        auth/
        workspaces/
        avatars/
        knowledge/
        conversations/
        runtime/
        widget/
        billing/
        safety/
    widget/
      src/
        launcher/
        runtime/
        styles/
  packages/
    ui/
    types/
    sdk/
    avatar-engine/
    knowledge-core/
    safety-core/
    config/
  workers/
    media-worker/
    ingestion-worker/
  docs/
    architecture/
    api/
    product/
```

---

# 19. Build Milestones

## Milestone 1: Product shell

Deliver:

- landing page
- auth
- workspace dashboard
- empty Avatar Studio
- design system

## Milestone 2: Avatar creation

Deliver:

- photo upload
- consent
- avatar profile
- voice selection
- preview text

## Milestone 3: First talking response

Deliver:

- ask question
- LLM answer
- TTS
- D-ID/Tavus video response
- saved message

## Milestone 4: Knowledge grounding

Deliver:

- add FAQs
- retrieve relevant context
- answer based on business knowledge
- refusal when unknown

## Milestone 5: Embeddable widget

Deliver:

- script tag embed
- floating widget
- avatar config loading
- visitor conversation

## Milestone 6: Lead capture and dashboard

Deliver:

- capture name/email/phone
- lead dashboard
- conversation transcript
- summary

## Milestone 7: Realtime voice

Deliver:

- mic input
- STT
- voice conversation
- video/audio response
- fallback handling

## Milestone 8: SDK and docs

Deliver:

- React SDK
- API docs
- webhook docs
- example Next.js integration

## Milestone 9: Self-hosted engine experiment

Deliver:

- provider abstraction
- GPU worker skeleton
- one open-source avatar pipeline experiment

## Milestone 10: 3D avatar research path

Deliver:

- MediaPipe capture validation
- blendshape schema
- Three.js avatar prototype
- Audio2Face-3D experiment

---

# 20. The Exact MVP Definition

A good MVP is:

> A business can create an AI avatar, give it FAQs, embed it on a website, and visitors can ask questions and receive talking avatar responses while the business captures leads and reviews transcripts.

That is v1.

Everything else is roadmap.

---

# 21. Why This Product Is Hard Even With AI Coding

Because it is not a normal CRUD SaaS.

It combines:

```text
AI conversation
voice pipeline
video/avatar rendering
media storage
real-time streaming
business knowledge
safety policies
consent records
embeddable SDK
analytics
billing
multi-tenant architecture
```

AI coding can help build pieces, but the hard part is making the whole thing reliable, safe, fast, and beautiful.

That is where engineering taste and product ownership matter.

---

# 22. Best Next Step

Start with this exact version:

## AvatarKit AI - Business Avatar Front Desk

Build only one polished demo first:

> A real estate business avatar that answers property/service questions, captures buyer/seller leads, and can be embedded on a website.

Why real estate first?

- visual niche
- easy to understand
- strong Upwork relevance
- safe compared to healthcare/law
- good for lead capture
- avatar feels natural as a virtual agent

Once that works, duplicate the same system for clinics, law firms, coaches, and SaaS onboarding.

[1]: https://docs.nvidia.com/ace/audio2face-3d-microservice/latest/text/getting-started/overview.html?utm_source=chatgpt.com "Overview - Audio2Face-3D"
[2]: https://www.d-id.com/api/?utm_source=chatgpt.com "Generative AI API for Talking Head Video Creation"
[3]: https://docs.d-id.com/docs/quickstart?utm_source=chatgpt.com "Documentation - Quickstart - D-ID"
