# AvatarKit AI - Detailed Software Specification Document

# 1. Product Overview

AvatarKit AI is a multi-tenant SaaS platform that lets a business create a talking AI avatar, configure its personality, connect it to approved business knowledge, publish it as an embeddable website/kiosk assistant, and review conversations, leads, safety events, and usage.

The product should feel Apple-inspired in the avatar creation experience, but the first build should be practical and production-focused. The initial avatar engine can use commercial providers, while the architecture must leave room for future self-hosted Python/GPU avatar engines.

The product is not a generic "make any photo talk" app. It is a controlled business avatar system with consent, safety, knowledge grounding, runtime monitoring, and embeddable deployment.

---

# 2. Primary Product Promise

AvatarKit AI lets businesses launch a talking AI front desk without building:

- avatar generation
- voice pipeline
- knowledge ingestion
- conversation engine
- website widget
- lead capture
- usage tracking
- safety controls
- transcript analytics
- realtime media infrastructure

The product should let a user go from:

"business photo + FAQs"

to:

"working talking avatar embedded on a website"

in less than 10 minutes.

---

# 3. Target Users

## 3.1 Business Owner

A small business owner, consultant, real estate agent, clinic manager, course creator, agency owner, or SaaS founder who wants a talking assistant on their website.

Needs:

- simple avatar creation
- no technical setup
- easy knowledge upload
- lead capture
- conversation review
- ability to embed on website

## 3.2 Agency / Freelancer

A developer or agency building AI avatar assistants for clients.

Needs:

- multiple workspaces
- reusable templates
- API keys
- embeddable widget
- white-label options
- client-specific dashboards

## 3.3 Developer

A technical user who wants to integrate AvatarKit into their app.

Needs:

- widget script
- React SDK
- API keys
- docs
- webhooks
- domain allowlist

## 3.4 Visitor

The end user interacting with the avatar on a website or kiosk.

Needs:

- fast answers
- natural conversation
- text and voice input
- clear trust boundaries
- easy lead/contact handoff

---

# 4. Product Principles

## 4.1 Safety First

No avatar can be published without a consent record.

The product must prevent or discourage:

- unauthorized impersonation
- public figure impersonation
- fake endorsements
- medical diagnosis
- legal advice
- financial promises
- harmful instructions
- adult/abusive avatar usage

## 4.2 Business Knowledge First

The avatar should answer business-specific questions from approved knowledge.

It should not invent:

- prices
- availability
- legal terms
- service guarantees
- medical claims
- policy details
- team member statements

When knowledge is weak, the avatar should ask for contact details or offer handoff.

## 4.3 Provider-Agnostic Avatar Engine

The product must not be tightly coupled to one avatar provider.

The platform should support:

- commercial avatar engine for v1
- alternate provider later
- self-hosted Python/GPU avatar engine later
- mock provider for tests and development

## 4.4 Smooth UX Over Raw Feature Count

The avatar creation flow should feel guided, visual, and premium.

Avoid:

- long raw forms
- technical jargon
- confusing provider details
- unpolished upload flows
- hidden safety requirements

## 4.5 Multi-Tenant From Day One

Every major entity must belong to a workspace.

No avatar, conversation, knowledge source, lead, usage event, or API key should exist without workspace ownership.

---

# 5. System Modules

The product contains these modules:

1. Marketing website
2. Authentication
3. Workspace and team management
4. Avatar Studio
5. Consent and safety
6. Voice library
7. Knowledge base
8. Conversation runtime
9. Avatar media engine
10. Embeddable widget
11. React SDK
12. Conversations dashboard
13. Leads dashboard
14. Usage and billing foundation
15. Admin and observability
16. Future self-hosted media engine

---

# 6. High-Level Architecture

## 6.1 TypeScript Responsibilities

TypeScript should own:

- Next.js web app
- dashboard UI
- public marketing site
- authentication UI
- workspace routing
- avatar configuration screens
- widget runtime
- React SDK
- public API gateway
- permission checks
- domain allowlist
- conversation persistence
- lead persistence
- usage events
- billing integration later

## 6.2 Python Responsibilities

Python should own:

- AI conversation orchestration
- knowledge retrieval
- prompt assembly
- safety evaluation
- speech-to-text
- text-to-speech
- avatar provider orchestration
- media processing
- ingestion workers
- future GPU/self-hosted avatar experiments

## 6.3 Data Storage

Primary database:

- PostgreSQL

Cache and queues:

- Redis

File/media storage:

- S3-compatible storage, Cloudflare R2, Supabase Storage, or equivalent

Vector search:

- pgvector for v1
- Qdrant optional later

---

# 7. Core Domain Entities

## 7.1 User

Represents an authenticated account.

Must support:

- email
- display name
- created timestamp
- workspace memberships

## 7.2 Workspace

Represents a business, agency client, or project.

Must support:

- name
- slug
- owner
- members
- avatars
- knowledge sources
- conversations
- leads
- API keys
- allowed domains
- usage events

## 7.3 Workspace Member

Represents a user's role inside a workspace.

Roles:

- Owner
- Admin
- Operator
- Viewer

Permission rules:

- Owner can manage billing, delete workspace, manage members.
- Admin can manage avatars, knowledge, widget settings, and leads.
- Operator can review conversations, leads, handoffs, and improve knowledge.
- Viewer can view dashboards but cannot mutate important configuration.

## 7.4 Avatar

Represents a business avatar.

Fields conceptually required:

- workspace ownership
- name
- public display name
- role
- description
- status
- engine
- photo asset
- voice
- language
- personality/instruction profile
- safety profile
- publish status
- created timestamp
- updated timestamp

Avatar statuses:

- Draft
- Processing
- Ready
- Published
- Suspended
- Failed

## 7.5 Avatar Asset

Represents uploaded and generated avatar media.

Asset types:

- source photo
- cropped photo
- preview video
- generated speech audio
- generated response video
- thumbnail
- future 3D model

Each asset must track:

- storage URL
- MIME type
- file size
- owner workspace
- avatar
- safety/validation status

## 7.6 Consent Record

Represents proof that the user accepted avatar identity usage terms.

Must track:

- avatar
- workspace
- user who accepted
- accepted terms version
- accepted timestamp
- IP address when available
- user agent when available
- consent type
- declared permission basis

Consent types:

- owner self-image
- business-owned brand character
- authorized staff member
- licensed synthetic avatar

No avatar can be published without a valid consent record.

## 7.7 Voice

Represents a selectable TTS voice.

Must track:

- provider
- provider voice ID
- display name
- language
- style
- preview URL
- active/inactive status

Voice cloning should not be part of v1 unless verified consent and extra safety flows are implemented.

## 7.8 Knowledge Source

Represents uploaded or manually entered business knowledge.

Types:

- FAQ
- manual text
- website URL
- PDF
- document
- pricing note
- policy note

Statuses:

- Pending
- Ingesting
- Ready
- Failed
- Archived

## 7.9 Knowledge Chunk

Represents searchable extracted content.

Must track:

- workspace
- source
- content
- embedding reference
- source metadata
- section/page if available
- created timestamp

## 7.10 Conversation

Represents one visitor/avatar session.

Channels:

- widget
- dashboard preview
- kiosk
- API

Statuses:

- Active
- Ended
- Handoff requested
- Failed

Must track:

- workspace
- avatar
- visitor ID
- summary
- lead status
- timestamps

## 7.11 Message

Represents individual conversation messages.

Roles:

- visitor
- avatar
- system
- operator

Must track:

- conversation
- text
- audio URL
- video URL
- metadata
- timestamps

## 7.12 Lead

Represents a captured business lead.

Fields:

- name
- email
- phone
- message
- source conversation
- status
- assigned operator later
- created timestamp

Statuses:

- New
- Contacted
- Qualified
- Closed
- Spam

## 7.13 Usage Event

Represents metered usage.

Event types:

- LLM input tokens
- LLM output tokens
- STT seconds
- TTS characters
- avatar video seconds
- avatar streaming seconds
- knowledge embeddings
- widget sessions
- messages
- storage bytes

## 7.14 Runtime Trace

Represents observability events inside a runtime flow.

Examples:

- session started
- user message received
- transcription started
- transcription completed
- retrieval started
- retrieval completed
- LLM started
- LLM completed
- safety check completed
- TTS started
- TTS completed
- avatar render started
- avatar render completed
- response delivered
- fallback triggered

---

# 8. Product Phases

# Phase 0 - Project Foundation

## Objective

Create the repository foundation, product structure, architecture boundaries, and shared conventions.

## Scope

This phase should not build product features deeply. It should establish the foundation required for the rest of the system.

## Required Deliverables

- Monorepo initialized.
- Web app created.
- API service created or selected.
- Python AI runtime service created.
- Shared package structure created.
- Database schema foundation prepared.
- Environment variable structure documented.
- Local development scripts prepared.
- Docker Compose prepared for Postgres and Redis.
- Basic health checks added for TypeScript API and Python service.
- Basic CI pipeline created.

## Implementation Details

The repository should separate:

- dashboard/marketing web app
- backend API
- widget package
- SDK package
- shared UI package
- shared types package
- Python AI runtime
- Python ingestion worker
- Python media worker

The first service boundary must be clear:

- TypeScript handles product/business/application logic.
- Python handles AI/media/retrieval orchestration.

Do not put AI provider logic directly inside frontend routes.

Do not put workspace permissions inside Python.

Python should trust only signed internal service requests from the TypeScript API.

## Acceptance Criteria

- Developer can start the web app locally.
- Developer can start the API locally.
- Developer can start the Python AI runtime locally.
- Database can be migrated locally.
- Redis can run locally.
- Health check endpoint works for all services.
- Shared types are importable by web/API/widget packages.
- CI can run lint, typecheck, and tests.

---

# Phase 1 - Authentication, Workspace, and Dashboard Shell

## Objective

Build the basic SaaS shell so every future feature belongs to a workspace.

## User Stories

- As a user, I can sign up.
- As a user, I can log in.
- As a user, I can create a workspace.
- As a user, I can switch workspaces.
- As a workspace owner, I can see a dashboard shell.
- As a user, I cannot access another workspace's data.

## Required Screens

### Auth Screens

- Sign in
- Sign up
- Magic link or email OTP screen
- Auth callback screen
- Session loading screen

### Workspace Screens

- Workspace creation
- Workspace selector
- Workspace settings placeholder
- Dashboard overview placeholder

## Required Data

- User
- Workspace
- Workspace Member

## Required Permissions

Workspace role enforcement must exist from this phase.

Every dashboard route should require:

- authenticated user
- active workspace
- valid membership

## UI Requirements

Dashboard layout should include:

- left sidebar
- top workspace selector
- user menu
- primary content area
- empty states
- loading states
- error states

Sidebar navigation placeholders:

- Overview
- Avatars
- Knowledge
- Conversations
- Leads
- Embed
- Usage
- Settings

## Edge Cases

- User has no workspace.
- User has multiple workspaces.
- User tries to access deleted or missing workspace.
- User loses session.
- User opens dashboard before auth resolves.
- User tries to access workspace they are not a member of.

## Acceptance Criteria

- A user can register and create a workspace.
- A user can view dashboard shell.
- Workspace membership controls all dashboard access.
- Unauthorized workspace access is blocked.
- Empty dashboard state explains next step: create first avatar.

---

# Phase 2 - Avatar Studio Foundation

## Objective

Build the core avatar creation flow without media generation yet.

## User Stories

- As a business user, I can create an avatar draft.
- As a business user, I can name the avatar.
- As a business user, I can define avatar role and purpose.
- As a business user, I can choose avatar language.
- As a business user, I can save progress and return later.
- As a business user, I can see avatar setup completion status.

## Required Screens

### Avatar List

Shows:

- avatar name
- status
- engine
- language
- last updated
- quick actions

Actions:

- create avatar
- edit avatar
- preview avatar
- duplicate avatar later
- delete draft avatar

### Avatar Studio

Step-based flow:

1. Basics
2. Photo
3. Consent
4. Voice
5. Behavior
6. Knowledge
7. Preview
8. Publish

In this phase, only Basics and Behavior are functional. Other steps can exist as locked or pending states.

## Avatar Basics Fields

- avatar name
- public display name
- business role
- primary language
- use case
- avatar description

Use case options:

- real estate assistant
- clinic front desk
- law intake assistant
- coaching assistant
- SaaS onboarding assistant
- course tutor
- custom business assistant

## Behavior Fields

- avatar greeting
- tone
- answer length preference
- business instructions
- fallback message
- lead capture preference
- handoff preference

Tone options:

- warm and professional
- friendly and casual
- formal
- luxury/premium
- energetic
- calm and supportive

## Status Logic

New avatar starts as Draft.

Avatar setup completion should calculate:

- basics complete
- photo uploaded
- consent accepted
- voice selected
- behavior configured
- knowledge added
- preview tested
- published

## Edge Cases

- Missing avatar name.
- Duplicate avatar names in same workspace.
- User leaves mid-flow.
- User changes workspace mid-flow.
- User tries to publish incomplete avatar.

## Acceptance Criteria

- User can create avatar draft.
- User can edit avatar basics.
- User can edit avatar behavior.
- Avatar list updates correctly.
- Avatar setup status is displayed.
- Publish is blocked until future required steps are complete.

---

# Phase 3 - Avatar Photo Upload and Validation

## Objective

Add photo upload, storage, validation, cropping, and preview foundation.

## User Stories

- As a user, I can upload an avatar photo.
- As a user, I can crop the photo.
- As a user, I can see quality feedback.
- As a user, I can replace the photo.
- As a user, I can remove the photo from a draft avatar.

## Required Screens

### Avatar Studio: Photo Step

Contains:

- drag-and-drop upload area
- file picker
- upload progress
- uploaded photo preview
- crop interface
- validation feedback panel
- replace photo action
- delete photo action

## Accepted File Types

- JPG
- PNG
- WEBP

## File Limits

Define configurable limits:

- maximum file size
- minimum image dimensions
- maximum image dimensions
- accepted aspect ratios

## Validation Requirements

Initial validation can be basic:

- file type valid
- file size valid
- image readable
- minimum resolution met

Advanced validation later:

- one visible face
- face centered
- no heavy blur
- no sunglasses
- no extreme angle
- sufficient lighting

## Storage Requirements

Uploads must use private object storage.

Photo asset should be associated with:

- workspace
- avatar
- uploader
- asset type
- validation status

Public widget should never expose raw private source photo unless the provider requires a secure temporary URL.

## Security Requirements

- Do not accept direct arbitrary remote image URLs in v1.
- Use signed upload flow or secure backend upload.
- Validate MIME type server-side.
- Reject suspicious file extensions.
- Store metadata.
- Allow deletion.

## Edge Cases

- Upload interrupted.
- User uploads huge file.
- User uploads unsupported type.
- User uploads corrupt image.
- User uploads image but leaves before saving.
- Storage upload succeeds but database write fails.
- Database write succeeds but storage upload fails.

## Acceptance Criteria

- User can upload a valid photo.
- Invalid files are rejected with clear messages.
- User can crop or adjust preview.
- Uploaded photo is visible inside Avatar Studio.
- Avatar setup status marks photo complete.
- Photo asset is stored with workspace ownership.

---

# Phase 4 - Consent and Identity Safety

## Objective

Require consent before avatar publication and create the product's safety foundation.

## User Stories

- As a user, I must confirm I have rights to use the avatar image.
- As a user, I can see what is allowed and not allowed.
- As a platform, no avatar can be published without consent.
- As an operator, I can audit consent details.

## Required Screens

### Avatar Studio: Consent Step

Contains:

- avatar photo preview
- consent explanation
- checkbox statements
- forbidden use notice
- accepted terms version
- confirmation button
- consent timestamp after acceptance

## Required Consent Statements

User must confirm:

- they own the image or have permission
- they will not impersonate a public figure
- they will not create fake endorsements
- they will not use the avatar for fraud or deception
- they understand generated avatar responses are AI-generated
- they accept avatar identity usage terms

## Consent Record Requirements

Store:

- workspace
- avatar
- user
- timestamp
- terms version
- declared consent type
- IP if available
- user agent if available

## Publish Gate

Avatar cannot be published unless:

- consent record exists
- photo exists
- avatar is not suspended
- avatar safety status is not blocked

## UI Requirements

Consent step should feel professional, not scary.

Use trust-focused copy:

- "Protect your business and your visitors"
- "Only publish avatars you are authorized to use"
- "You stay in control and can delete this avatar anytime"

## Edge Cases

- User changes photo after consent.
- Consent should become invalid when source photo changes.
- User deletes consent.
- Terms version changes later.
- Workspace admin tries to publish avatar created by another member.

## Acceptance Criteria

- Consent can be accepted and stored.
- Changing avatar source photo resets consent status.
- Publish is blocked without valid consent.
- Consent details can be viewed in avatar settings.
- Suspended avatars cannot be published.

---

# Phase 5 - Voice Library and Avatar Behavior

## Objective

Let users choose how the avatar sounds and behaves.

## User Stories

- As a user, I can select a voice.
- As a user, I can preview a voice.
- As a user, I can choose the avatar's language.
- As a user, I can define the avatar's business behavior.
- As a user, I can set fallback and handoff rules.

## Required Screens

### Avatar Studio: Voice Step

Contains:

- voice list
- language filter
- voice preview button
- selected voice card
- fallback voice notice

### Avatar Studio: Behavior Step

Contains:

- greeting message
- role instruction
- tone
- answer style
- fallback message
- lead capture behavior
- handoff triggers

## Voice Requirements

Each voice should include:

- display name
- language
- tone/style label
- preview sample
- provider reference
- active status

## Behavior Configuration

Must support:

- avatar role
- business instruction
- answer style
- prohibited topics
- fallback response
- escalation behavior
- lead capture preferences

## Handoff Trigger Settings

Examples:

- visitor asks for human
- avatar confidence is low
- topic is outside knowledge
- legal/medical/financial sensitive question
- visitor shows high buying intent
- visitor is angry or dissatisfied

## Lead Capture Settings

Options:

- never capture automatically
- capture after buying intent
- capture when avatar cannot answer
- capture after configurable number of messages
- capture on explicit visitor request

## Edge Cases

- Selected voice becomes inactive.
- Language mismatch between avatar and voice.
- User leaves behavior fields empty.
- Avatar prompt becomes too long.
- User enters unsafe instructions.

## Acceptance Criteria

- User can select and preview a voice.
- User can configure avatar behavior.
- Behavior is saved per avatar.
- Unsafe behavior instructions are rejected or flagged.
- Setup status marks voice and behavior complete.

---

# Phase 6 - Knowledge Base v1

## Objective

Allow businesses to provide approved knowledge the avatar can use to answer.

## User Stories

- As a user, I can add manual FAQs.
- As a user, I can add business information text.
- As a user, I can see knowledge ingestion status.
- As a user, I can edit or delete knowledge.
- As a user, I can test whether the avatar uses my knowledge.

## Required Screens

### Knowledge Sources List

Shows:

- title
- type
- status
- last updated
- chunk count if available
- actions

### Add Knowledge Source

Types:

- FAQ entry
- manual text
- website URL placeholder
- PDF placeholder

For v1, FAQ and manual text should be fully functional. Website/PDF can be added in later phases if needed.

### Knowledge Source Detail

Shows:

- source title
- source content
- ingestion status
- extracted chunks
- errors
- re-ingest action

## Required Knowledge Types in v1

### FAQ

Fields:

- question
- answer
- category optional
- active/inactive

### Manual Text

Fields:

- title
- content
- category optional

## Ingestion Requirements

When knowledge is added:

- create knowledge source
- split into chunks
- generate embeddings
- store chunk metadata
- mark source ready

## Retrieval Requirements

Avatar runtime should retrieve relevant chunks by:

- workspace
- avatar access scope
- semantic similarity
- active source status

## Avatar Knowledge Scope

Initially, each avatar can use all workspace knowledge.

Later, add per-avatar knowledge source selection.

## Edge Cases

- Empty source content.
- Very long manual text.
- Duplicate FAQ.
- Failed embedding generation.
- Source deleted while conversation is active.
- Knowledge updated after avatar is published.

## Acceptance Criteria

- User can add FAQ knowledge.
- User can add manual text knowledge.
- Knowledge becomes searchable.
- Runtime can retrieve matching knowledge.
- Deleted knowledge is no longer used.
- Failed ingestion shows clear error.

---

# Phase 7 - Python AI Runtime: Text Conversation

## Objective

Build the first real AI conversation flow using text input and text output.

## User Stories

- As a user, I can test my avatar by asking a text question.
- As a user, I receive an answer based on my business knowledge.
- As a user, I see when the avatar does not know.
- As a system, every conversation and message is saved.
- As a system, runtime events are traced.

## Required Flow

Dashboard preview sends:

- workspace ID
- avatar ID
- optional conversation ID
- user message
- requested output mode: text

TypeScript API should:

- validate user permission
- validate avatar ownership
- create conversation if missing
- save visitor message
- call Python runtime
- save avatar message
- return response

Python runtime should:

- load avatar configuration
- retrieve knowledge chunks
- assemble prompt
- generate structured answer
- apply safety check
- return answer, lead capture decision, handoff decision, usage metadata

## Output Requirements

Every AI response should include:

- answer text
- confidence signal internally
- intent label internally
- lead capture decision
- handoff decision
- source chunk references internally
- usage metadata

## Answer Rules

The avatar must:

- answer briefly unless configured otherwise
- use business knowledge
- not invent facts
- ask for contact details when uncertain
- offer human handoff when needed
- avoid sensitive advice
- keep tone consistent with configuration

## Runtime Trace Requirements

For each message, save traces for:

- message received
- retrieval started
- retrieval completed
- LLM started
- LLM completed
- safety checked
- response saved
- response returned

## Edge Cases

- No knowledge exists.
- Retrieval returns weak matches.
- LLM fails.
- Python service unavailable.
- Safety check blocks answer.
- Message is empty.
- User asks out-of-scope question.
- User asks for illegal/harmful content.
- Avatar is draft or suspended.

## Acceptance Criteria

- Dashboard preview can send text question.
- Python runtime returns structured answer.
- Answer uses configured avatar behavior.
- Unknown questions trigger fallback.
- Conversation and messages are saved.
- Runtime traces are created.
- Errors return safe user-facing messages.

---

# Phase 8 - Conversation Dashboard

## Objective

Let businesses review avatar conversations and understand what visitors asked.

## User Stories

- As a user, I can view all conversations.
- As a user, I can open a conversation.
- As a user, I can read full transcript.
- As a user, I can see lead capture and handoff status.
- As a user, I can identify unanswered questions.

## Required Screens

### Conversations List

Filters:

- avatar
- status
- date range
- has lead
- handoff requested
- unresolved
- channel

Columns:

- visitor/session label
- avatar
- latest message preview
- status
- lead status
- created time
- duration if available

### Conversation Detail

Shows:

- full transcript
- avatar messages
- visitor messages
- source references internally
- lead panel
- handoff status
- runtime traces summary
- safety events
- mark resolved action
- create lead action

## Conversation Summary

After a conversation ends, system should optionally generate:

- short summary
- visitor intent
- lead quality
- unanswered questions
- recommended follow-up

This can be added in this phase or later.

## Edge Cases

- Conversation has no avatar response because runtime failed.
- Conversation deleted or archived.
- Conversation contains unsafe content.
- Conversation has multiple lead capture attempts.
- User has viewer role only.

## Acceptance Criteria

- Conversations are listed correctly.
- User can open transcript.
- Messages are ordered correctly.
- Workspace isolation is enforced.
- Handoff and lead statuses are visible.
- Empty state explains no conversations yet.

---

# Phase 9 - Text-to-Speech and Audio Response

## Objective

Add voice output so the avatar can speak answers as audio.

## User Stories

- As a user, I can preview the avatar speaking an answer.
- As a visitor, I can hear the avatar's response.
- As a system, generated audio is saved.
- As a system, TTS usage is metered.

## Required Flow

When output mode is audio:

- runtime generates text answer
- TTS provider generates audio
- audio is uploaded to object storage
- avatar message stores audio URL
- response returns audio URL
- UI plays audio

## TTS Requirements

TTS provider must support:

- selected voice
- language
- text input
- audio output
- error handling
- usage reporting

## UI Requirements

Dashboard preview should show:

- response text
- audio player
- replay button
- loading state while audio generates
- fallback to text if audio fails

Widget should later support:

- autoplay behavior only when allowed by browser
- click-to-play fallback
- muted mode option

## Edge Cases

- TTS provider fails.
- Selected voice unavailable.
- Text is too long.
- Browser blocks autoplay.
- Audio upload fails.
- Audio generated but message save fails.

## Acceptance Criteria

- Avatar can generate audio response.
- Audio is stored and linked to message.
- Preview page can play audio.
- Usage event records TTS cost unit.
- Text fallback still works if audio fails.

---

# Phase 10 - Avatar Video Generation v1

## Objective

Add first talking avatar video output using a commercial provider through an internal provider abstraction.

## User Stories

- As a user, I can generate a talking avatar preview.
- As a visitor, I can watch the avatar speak.
- As a system, provider details are hidden behind a stable interface.
- As a system, failed video generation falls back to audio/text.

## Required Flow

When output mode is video:

- runtime generates answer text
- runtime generates audio if required
- avatar provider receives photo/audio/text
- provider creates video or returns job ID
- system polls or receives provider completion
- generated video is saved or referenced
- avatar message stores video URL
- UI displays video

## Provider Abstraction Requirements

The internal avatar engine interface must support:

- generate video from avatar configuration and answer
- start stream later
- check job status
- normalize errors
- report usage seconds
- return provider metadata internally

The rest of the product should not care whether the provider is D-ID, Tavus, Simli, mock, or self-hosted.

## UI Requirements

Dashboard preview should show:

- avatar video card
- loading state
- render progress if known
- fallback text/audio
- retry button if failed

Video card should include:

- avatar image placeholder before video
- waveform or speaking animation while generating
- final video player
- "render failed" message with fallback

## Render State Requirements

Avatar response generation can be:

- synchronous for short provider responses
- asynchronous for long render jobs

If asynchronous:

- initial response returns processing status
- UI polls message status or listens for event
- final video appears when ready

## Edge Cases

- Provider API timeout.
- Provider returns job but never completes.
- Provider rejects photo.
- Provider rejects text/audio.
- Provider rate limit.
- Video URL expires.
- Video generated but storage copy fails.
- User sends another message while previous video is processing.

## Acceptance Criteria

- Avatar can produce a video response in dashboard preview.
- Video response is saved to the message.
- Provider-specific logic is isolated.
- Failed video generation falls back gracefully.
- Usage event records video generation unit.
- Mock provider exists for tests and local development.

---

# Phase 11 - Avatar Publish Flow

## Objective

Allow a complete avatar to be published for external widget usage.

## User Stories

- As a user, I can see whether my avatar is ready to publish.
- As a user, I can publish my avatar.
- As a user, I can unpublish my avatar.
- As a system, incomplete avatars cannot be published.
- As a system, public runtime only works for published avatars.

## Publish Requirements

Avatar can be published only if:

- basics complete
- photo exists
- valid consent exists
- voice selected
- behavior configured
- at least one knowledge source exists or fallback behavior explicitly allows no knowledge
- preview test completed successfully
- avatar is not suspended
- workspace is active

## Publish Screen

Shows:

- setup checklist
- missing requirements
- final preview
- safety notice
- publish button
- public status
- unpublish action

## Status Behavior

Published avatar:

- can be loaded by widget
- can receive public conversations
- can be embedded

Unpublished avatar:

- can only be used in dashboard preview
- cannot be loaded by public widget

Suspended avatar:

- cannot be previewed publicly
- cannot be published
- requires admin/operator action

## Edge Cases

- User removes photo after publish.
- User changes behavior after publish.
- User deletes knowledge after publish.
- Consent invalidated after publish.
- Provider configuration fails after publish.
- Workspace becomes inactive.

## Acceptance Criteria

- Avatar publish is gated by checklist.
- Published avatar can be accessed by public runtime.
- Unpublished avatar cannot be loaded by widget.
- Unpublish immediately disables public usage.
- Setup checklist is accurate.

---

# Phase 12 - Embeddable Widget v1

## Objective

Create a website widget that lets external visitors talk to a published avatar.

## User Stories

- As a business user, I can copy an embed script.
- As a website visitor, I can open the avatar widget.
- As a visitor, I can ask a text question.
- As a visitor, I can receive a video/audio/text response.
- As a business, I can see widget conversations in dashboard.

## Required Widget Modes

For v1:

- floating launcher
- expanded chat/avatar panel

Later:

- inline embed
- full-screen kiosk
- voice-only mode

## Widget UI Requirements

Closed state:

- floating button
- avatar thumbnail
- optional greeting bubble

Open state:

- header with avatar name
- avatar video area
- transcript area
- text input
- send button
- lead capture card if requested
- fallback state if avatar unavailable

## Widget Runtime Requirements

Widget should:

- load avatar public config
- create conversation session
- send visitor message
- show loading state
- display response
- save messages through runtime API
- handle errors gracefully

## Widget Security Requirements

- Widget should only load published avatars.
- Widget requests should validate domain if domain allowlist is configured.
- Widget should not expose private API keys.
- Widget should use avatar public ID or safe token.
- Widget should not expose internal provider metadata.

## Embed Settings Screen

Shows:

- avatar status
- allowed domains
- embed script
- widget theme settings
- position settings
- test embed preview

## Widget Theme Settings

V1 settings:

- light theme
- position bottom-right or bottom-left
- greeting enabled/disabled
- primary color
- avatar display name

## Edge Cases

- Avatar unpublished after widget loaded.
- Visitor sends empty message.
- Runtime fails.
- Video generation is slow.
- Browser blocks video autoplay.
- Client website has conflicting CSS.
- Domain not allowed.
- Network request blocked.
- Multiple widgets on same page.

## Acceptance Criteria

- User can copy embed script.
- Widget loads on external/local test page.
- Visitor can send text question.
- Avatar response appears.
- Conversation is visible in dashboard.
- Widget does not break host page styling.
- Invalid domain is blocked if allowlist enabled.

---

# Phase 13 - Lead Capture

## Objective

Turn avatar conversations into business leads.

## User Stories

- As a business, I can configure when the avatar should ask for lead details.
- As a visitor, I can submit my contact details.
- As a business, I can view captured leads.
- As a business, I can open the conversation behind each lead.

## Lead Capture Triggers

Supported triggers:

- visitor explicitly asks to be contacted
- visitor asks for pricing
- visitor asks to book
- visitor asks for quote
- avatar confidence is low
- avatar cannot answer
- configured message count reached
- manual button in widget

## Lead Fields

V1 fields:

- name
- email
- phone
- message

Workspace-level configuration should determine required fields.

## Widget Lead Capture UI

When lead capture is requested:

- show short explanation
- display form fields
- allow submit
- show success message
- continue conversation after submit

## Dashboard Leads Screen

Shows:

- lead name
- email/phone
- source avatar
- source conversation
- status
- created date
- message preview

Lead detail shows:

- contact fields
- conversation transcript
- source message
- recommended follow-up
- status actions

## Edge Cases

- Visitor submits invalid email.
- Visitor refuses lead capture.
- Duplicate lead in same conversation.
- Lead capture requested too early.
- Lead form submit fails.
- Spam/abusive input.

## Acceptance Criteria

- Avatar can request lead capture.
- Widget can collect lead details.
- Lead is saved to workspace.
- Lead appears in dashboard.
- Lead links to source conversation.
- Lead status can be updated.

---

# Phase 14 - Voice Input v1

## Objective

Allow visitors and dashboard users to speak to the avatar using push-to-talk audio input.

## User Stories

- As a visitor, I can ask a question with my microphone.
- As a visitor, I can see transcription result.
- As a visitor, I can receive spoken/video response.
- As a system, audio input is transcribed and saved safely.

## Voice Interaction Mode

Use push-to-talk for v1.

Flow:

- user clicks microphone
- browser requests mic permission
- user records audio
- audio uploads to storage
- runtime transcribes audio
- transcribed text enters normal conversation flow
- avatar responds with configured output mode

## UI Requirements

Widget and preview should show:

- microphone button
- recording state
- stop recording action
- upload/transcribing state
- transcription preview
- error state for denied mic permission

## STT Requirements

Speech-to-text provider must return:

- transcript text
- language if available
- confidence if available
- duration

## Edge Cases

- User denies mic permission.
- Browser does not support recording.
- User records silence.
- Audio is too long.
- Upload fails.
- STT provider fails.
- Transcript is empty or low confidence.
- User speaks unsupported language.

## Acceptance Criteria

- User can record audio question.
- Audio is transcribed.
- Transcript is used as visitor message.
- Avatar response works after transcription.
- Failed voice input falls back to text input.
- STT usage is metered.

---

# Phase 15 - Usage Metering and Cost Control

## Objective

Track paid resource usage and prepare the product for billing.

## User Stories

- As a business, I can see usage.
- As a platform, I can track cost-driving events.
- As a platform, I can enforce usage limits later.
- As an operator, I can debug unusually expensive sessions.

## Usage Events

Track:

- widget sessions
- messages
- LLM input tokens
- LLM output tokens
- TTS characters
- STT seconds
- avatar video seconds
- avatar stream seconds
- storage bytes
- embedding operations

## Usage Dashboard

Shows:

- total conversations
- total messages
- avatar video minutes
- voice minutes
- estimated usage by avatar
- usage over time
- current plan placeholder
- limit warnings placeholder

## Usage Limits

V1 can show limits without hard enforcement.

Later enforce:

- monthly message limit
- video minute limit
- avatar count limit
- knowledge source limit
- team member limit

## Edge Cases

- Usage event write fails.
- Provider returns usage after response.
- Retry creates duplicate usage events.
- Conversation has partial failure.
- Free workspace exceeds soft limit.

## Acceptance Criteria

- Major runtime operations create usage events.
- Usage dashboard displays totals.
- Usage can be filtered by avatar.
- Duplicate usage events are avoided where possible.
- Usage system is ready for billing integration.

---

# Phase 16 - Safety Events and Moderation

## Objective

Add structured safety monitoring and runtime protection.

## User Stories

- As a platform, I can block unsafe avatar usage.
- As a business, I can see when the avatar refused or handed off.
- As a system, I can log safety incidents.
- As a visitor, I receive safe fallback messages instead of unsafe responses.

## Safety Checks

Run safety checks on:

- avatar behavior instructions
- user message
- generated answer
- uploaded avatar identity where possible
- lead capture input

## Safety Event Types

- unsafe user input
- unsafe avatar instruction
- unsupported medical request
- unsupported legal request
- financial advice request
- impersonation risk
- public figure risk
- abusive message
- self-harm or violence mention
- generated answer blocked
- handoff forced

## Safety Actions

Possible outcomes:

- allow
- allow with caution
- answer with fallback
- request human handoff
- block message
- suspend avatar
- flag workspace for review

## Dashboard Safety Screen

V1 can include safety events inside conversation detail.

Later add dedicated safety dashboard.

## Edge Cases

- False positive safety block.
- User tries prompt injection.
- Business config asks avatar to make illegal claims.
- Visitor asks for diagnosis/legal advice.
- Visitor asks avatar to pretend to be a real person.
- Avatar output includes unsupported claim.

## Acceptance Criteria

- Unsafe input can be detected.
- Unsafe output can be replaced with fallback.
- Safety events are logged.
- Safety events are visible in conversation detail.
- Avatar instructions are validated before publish.

---

# Phase 17 - Knowledge Gap Detection

## Objective

Help businesses improve avatar answers by identifying missing knowledge.

## User Stories

- As a business, I can see questions the avatar could not answer.
- As a business, I can convert unanswered questions into FAQs.
- As a business, I can improve avatar knowledge over time.

## Knowledge Gap Signals

Create a knowledge gap when:

- retrieval confidence is low
- avatar fallback is used
- handoff is requested due to missing knowledge
- visitor repeats question
- visitor says answer was not helpful
- operator marks answer as poor

## Knowledge Gaps Screen

Shows:

- unanswered question
- conversation link
- suggested FAQ draft
- frequency count
- last asked date
- status

Statuses:

- New
- In review
- Resolved
- Ignored

## Actions

- create FAQ from gap
- attach to existing source
- mark resolved
- ignore

## Edge Cases

- Similar questions create duplicates.
- Question is abusive or irrelevant.
- Question belongs to sensitive category.
- Suggested FAQ would be hallucinated.

## Acceptance Criteria

- Low-confidence interactions create knowledge gaps.
- User can see unresolved knowledge gaps.
- User can create FAQ from gap.
- Gap can be marked resolved.
- Updated knowledge improves future retrieval.

---

# Phase 18 - Realtime Streaming v1

## Objective

Move from request/response to a more natural realtime avatar interaction.

## User Stories

- As a visitor, I can start a live avatar session.
- As a visitor, I can receive partial response updates.
- As a visitor, I can see avatar preparing/speaking states.
- As a system, session state is tracked.

## Realtime Scope

V1 realtime does not need full interruption handling.

It should support:

- session start
- session end
- user text message
- partial answer event
- audio ready event
- video/stream ready event
- error event

## Runtime States

Session states:

- idle
- listening
- transcribing
- thinking
- speaking
- waiting
- failed
- ended

## UI Requirements

Widget should show:

- live status indicator
- "listening"
- "thinking"
- "speaking"
- graceful reconnect
- end session button

## Edge Cases

- WebSocket disconnect.
- Visitor closes widget mid-session.
- Avatar response is still generating.
- Session expires.
- Multiple tabs open.
- Network reconnect duplicates message.

## Acceptance Criteria

- Widget can start a realtime session.
- Runtime sends status events.
- UI updates based on events.
- Session is persisted.
- Disconnects are handled gracefully.

---

# Phase 19 - Developer SDK and Public API

## Objective

Make AvatarKit usable by developers and agencies.

## User Stories

- As a developer, I can install a React SDK.
- As a developer, I can render a talking avatar component.
- As a developer, I can create sessions through API.
- As a developer, I can receive webhook events.
- As a developer, I can read documentation.

## SDK Features

V1 SDK should support:

- provider wrapper
- talking avatar component
- session hook
- message send function
- event callbacks
- theme options
- error callbacks

## Public API Features

Support:

- get avatar public config
- start conversation
- send message
- submit lead
- fetch conversation status if permitted

## API Key Requirements

Workspace owners/admins can create API keys.

API keys must:

- have a name
- show prefix only after creation
- store hash, not raw key
- be revocable
- support scopes later

## Webhook Events

Initial events:

- conversation started
- conversation ended
- lead created
- handoff requested
- avatar failed
- safety flagged

## Docs Pages

Docs should include:

- quickstart
- widget embed
- React SDK
- API authentication
- webhooks
- domain allowlist
- safety notes

## Edge Cases

- Invalid API key.
- Revoked API key.
- Webhook delivery fails.
- Duplicate webhook event.
- Developer uses unpublished avatar.
- SDK loaded without provider.

## Acceptance Criteria

- Developer can embed avatar via React SDK.
- API keys can be created/revoked.
- Public API respects workspace security.
- Webhooks are signed.
- Documentation explains basic integration.

---

# Phase 20 - Billing Foundation

## Objective

Prepare the product for paid usage without overbuilding billing early.

## User Stories

- As a business, I can see my plan.
- As a platform, I can define plan limits.
- As a platform, I can connect usage to billing later.
- As a user, I can upgrade later.

## Plan Concepts

Plans:

- Free
- Starter
- Growth
- Agency
- Enterprise

Limits:

- avatars
- monthly conversations
- monthly video minutes
- monthly voice minutes
- knowledge sources
- team members
- widget domains
- API keys

## Billing Screen

Shows:

- current plan
- usage this month
- plan limits
- upgrade placeholder
- billing history placeholder

## Enforcement

V1 can soft-enforce with warnings.

Hard enforcement later:

- block new avatar creation
- block publish
- block runtime responses after limit
- degrade video to text/audio fallback

## Edge Cases

- User exceeds free limit.
- Workspace owner removed.
- Payment integration not configured.
- Usage reset at month boundary.
- Enterprise custom limits.

## Acceptance Criteria

- Plan limits are represented in data model/config.
- Billing page displays current plan.
- Usage maps to plan limits.
- Soft warnings appear near limit.
- System can later integrate Stripe.

---

# Phase 21 - Admin, Operations, and Observability

## Objective

Make the product debuggable and operable.

## User Stories

- As an operator, I can inspect failed avatar responses.
- As an operator, I can see provider failures.
- As an operator, I can see runtime traces.
- As an operator, I can suspend abusive avatars.

## Admin Features

Internal admin should support:

- search workspace
- search avatar
- view avatar status
- view runtime traces
- view provider errors
- view safety events
- suspend avatar
- unsuspend avatar
- view usage spikes

## Observability Requirements

Track:

- request duration
- provider latency
- LLM latency
- TTS latency
- avatar render latency
- runtime failures
- queue failures
- widget error rate

## Edge Cases

- Provider outage.
- Repeated render failures.
- Abuse from one domain.
- Sudden usage spike.
- Queue backlog.
- Storage outage.

## Acceptance Criteria

- Runtime failures are traceable.
- Provider errors are stored.
- Avatar can be suspended.
- Suspended avatar stops public usage.
- Admin can inspect enough data to debug production issues.

---

# Phase 22 - Self-Hosted Avatar Engine Research

## Objective

Create a technical path toward a harder, more defensible avatar engine.

This phase should not block MVP launch.

## Goals

Explore:

- open-source talking-head generation
- realtime lip-sync
- MediaPipe face validation
- GPU worker queue
- 3D avatar blendshape pipeline
- browser-rendered avatar mode

## Research Tracks

### Track A - 2D Talking Head

Investigate:

- photo + audio to video
- render quality
- GPU requirements
- commercial license compatibility
- processing time
- failure modes

### Track B - Realtime Lip Sync

Investigate:

- audio-driven mouth movement
- latency
- streaming support
- quality under noisy audio
- deployment cost

### Track C - 3D Avatar Mode

Investigate:

- face capture validation
- blendshape extraction
- 3D head/character rendering
- audio-to-blendshape pipeline
- browser performance

## Architecture Requirement

Self-hosted engine must use same internal provider interface as commercial engines.

The rest of the product should not change when self-hosted engine is added.

## Edge Cases

- GPU unavailable.
- Model license not commercial-friendly.
- Render quality below commercial providers.
- Processing cost too high.
- Identity preservation weak.
- Output uncanny or unstable.

## Acceptance Criteria

- Research findings documented.
- One prototype provider can run behind internal provider interface.
- Product can select mock/commercial/self-hosted engine per avatar internally.
- No production dependency on experimental engine yet.

---

# Phase 23 - Kiosk Mode

## Objective

Adapt AvatarKit for physical touchscreen environments.

## User Stories

- As a business, I can run avatar in kiosk mode.
- As a visitor, I can interact with a full-screen avatar.
- As a business, I can configure kiosk greeting and idle behavior.
- As an operator, I can review kiosk conversations separately.

## Kiosk UI Requirements

- full-screen layout
- large avatar video
- large touch-friendly buttons
- voice-first interaction
- fallback text keyboard
- idle attract screen
- session reset after inactivity
- privacy timeout

## Kiosk Settings

- idle greeting
- inactivity timeout
- allowed language
- lead capture behavior
- QR code handoff
- staff call button

## Edge Cases

- Microphone unavailable.
- Visitor walks away mid-session.
- Public environment privacy concerns.
- Long idle time.
- Kiosk network disconnect.
- Browser refresh.

## Acceptance Criteria

- Avatar can run in full-screen kiosk mode.
- Session resets after inactivity.
- Kiosk conversations are tagged separately.
- UI is usable on touchscreen.

---

# Phase 24 - Agency and White-Label Features

## Objective

Make the product attractive to freelancers and agencies building avatars for clients.

## User Stories

- As an agency, I can manage multiple client workspaces.
- As an agency, I can duplicate avatar templates.
- As an agency, I can hide AvatarKit branding on higher plans.
- As an agency, I can export setup instructions for clients.

## Features

- workspace templates
- avatar duplication
- branded widget settings
- custom logo
- custom domain later
- client handoff checklist
- agency dashboard

## Edge Cases

- Agency member accidentally accesses wrong client workspace.
- Duplicated avatar carries old consent.
- White-label client changes domain.
- Template knowledge leaks across clients.

## Acceptance Criteria

- Avatar templates can be duplicated safely.
- Consent does not copy blindly across workspaces.
- White-label widget configuration exists.
- Agency can manage multiple workspaces cleanly.

---

# Phase 25 - Production Hardening

## Objective

Prepare the product for real users.

## Areas to Harden

### Security

- workspace isolation
- object storage privacy
- signed URLs
- API key hashing
- webhook signatures
- rate limits
- widget domain checks
- service-to-service auth
- input validation everywhere

### Reliability

- provider timeouts
- retry policies
- queue dead-letter handling
- fallback responses
- graceful degradation
- status polling
- media job recovery

### Performance

- widget bundle size
- dashboard loading
- vector retrieval latency
- LLM latency
- TTS latency
- avatar generation latency
- caching public avatar config

### Privacy

- transcript deletion
- avatar deletion
- lead deletion
- workspace export
- consent audit
- PII handling

### Testing

- unit tests
- integration tests
- E2E dashboard tests
- E2E widget tests
- provider mock tests
- queue failure tests

## Acceptance Criteria

- Production environment can be deployed.
- Smoke tests pass.
- Public widget works on allowed domain.
- Failure fallbacks work.
- No incomplete avatar can be publicly loaded.
- All major runtime operations are traceable.
- Sensitive data is not exposed publicly.

---

# 9. Feature Dependency Map

Build order should respect these dependencies:

1. Workspace before avatars.
2. Avatars before photo upload.
3. Photo upload before consent.
4. Consent before publish.
5. Voice and behavior before preview.
6. Knowledge before grounded answers.
7. Text runtime before TTS.
8. TTS before talking video.
9. Publish before widget.
10. Widget before public conversations.
11. Conversations before leads.
12. Usage tracking before billing.
13. Provider abstraction before multiple avatar engines.
14. Basic request/response before realtime streaming.
15. Commercial provider before self-hosted engine.

---

# 10. MVP Definition

The MVP is complete when this full flow works:

A user signs up, creates a workspace, creates an avatar, uploads a photo, accepts consent, selects a voice, configures avatar behavior, adds FAQs, tests a text question, receives a talking avatar response, publishes the avatar, copies an embed script, adds it to a website, receives a visitor question through the widget, responds with avatar video/audio/text, captures a lead, and reviews the conversation and lead inside the dashboard.

---

# 11. MVP Feature Checklist

## Must Have

- Auth
- Workspace
- Avatar draft creation
- Photo upload
- Consent
- Voice selection
- Behavior configuration
- Manual FAQ knowledge
- Text runtime
- Grounded answer generation
- TTS response
- Video avatar response through provider abstraction
- Conversation persistence
- Publish flow
- Widget embed
- Lead capture
- Conversation dashboard
- Usage events
- Basic safety checks

## Should Have

- Knowledge gap detection
- Conversation summaries
- Domain allowlist
- Widget theming
- Audio input
- Runtime traces dashboard
- API keys
- React SDK

## Could Have

- PDF ingestion
- Website crawling
- Realtime streaming
- Kiosk mode
- White-label mode
- Billing integration
- Self-hosted avatar engine

## Not For MVP

- full Apple-level 3D persona
- voice cloning
- celebrity avatar support
- mobile app
- public avatar marketplace
- custom model training
- complex CRM integrations
- full video call system

---

# 12. Important Product Rules for Codex

Codex should follow these rules while implementing:

1. Do not implement avatar generation directly inside UI components.
2. Do not hardcode provider-specific logic into product routes.
3. Do not allow public widget access to draft avatars.
4. Do not publish avatars without consent.
5. Do not store API keys in plaintext.
6. Do not expose private source photos publicly.
7. Do not allow cross-workspace data access.
8. Do not skip runtime tracing.
9. Do not skip fallback paths for AI/media failure.
10. Do not mix Python AI orchestration with TypeScript permission logic.
11. Do not build realtime before request/response runtime is stable.
12. Do not add voice cloning in v1.
13. Do not create fake "Apple clone" claims in UI.
14. Do not build a toy demo that cannot become a real SaaS.
15. Every feature must have loading, empty, error, and success states.

---

# 13. Recommended Codex Execution Strategy

Use one phase per Codex task.

Each Codex prompt should include:

- exact phase name
- scope boundaries
- files/modules to touch
- data model changes
- UI screens
- API behavior
- edge cases
- acceptance criteria
- verification commands
- instruction not to implement future phases

Codex should not jump ahead.

For example:

- Phase 1 prompt should not implement avatars.
- Phase 2 prompt should not implement media generation.
- Phase 7 prompt should not implement widget.
- Phase 12 prompt should not implement billing.
- Phase 22 prompt should not replace commercial provider path.

This keeps the system clean and prevents AI coding from creating tangled architecture.

---

# 14. Final Build Sequence

Recommended execution order:

1. Project Foundation
2. Auth, Workspace, Dashboard Shell
3. Avatar Studio Foundation
4. Photo Upload and Validation
5. Consent and Identity Safety
6. Voice Library and Behavior
7. Knowledge Base v1
8. Python AI Runtime: Text Conversation
9. Conversation Dashboard
10. Text-to-Speech
11. Avatar Video Generation
12. Publish Flow
13. Embeddable Widget
14. Lead Capture
15. Voice Input
16. Usage Metering
17. Safety Events
18. Knowledge Gap Detection
19. Realtime Streaming
20. Developer SDK and Public API
21. Billing Foundation
22. Admin and Observability
23. Self-Hosted Avatar Engine Research
24. Kiosk Mode
25. Agency and White-Label
26. Production Hardening

This sequence turns AvatarKit AI from a simple avatar demo into a serious, difficult, premium, AI-native SaaS product.
