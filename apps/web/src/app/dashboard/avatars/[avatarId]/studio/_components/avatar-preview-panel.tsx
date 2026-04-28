"use client"

import { MessageRole } from "@prisma/client"
import { useActionState, useMemo, useState } from "react"
import Link from "next/link"
import type { AvatarPhotoAssetRecord, AvatarPreviewConversation, AvatarPreviewMessage } from "@/lib/avatar"
import { sendAvatarPreviewMessageAction } from "@/app/actions/avatars"

type AvatarPreviewPanelProps = {
  avatarId: string
  avatarName: string
  selectedVoiceName: string | null
  currentSourcePhoto: AvatarPhotoAssetRecord | null
  videoPreconditions: {
    hasPhoto: boolean
    hasConsent: boolean
    hasVoice: boolean
    isNotSuspended: boolean
  }
  previewReady: boolean
  missingRequirements: string[]
  canSend: boolean
  initialConversation: AvatarPreviewConversation | null
}

type PreviewState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: {
    avatarId?: string
    inputText?: string
    outputMode?: string
  }
  conversation?: AvatarPreviewConversation | null
}

type PreviewOutputMode = "text" | "audio" | "video"

const initialState: PreviewState = {
  status: "idle",
  conversation: null
}

function formatConversationTime(dateValue: string): string {
  const date = new Date(dateValue)
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : date.toLocaleString()
}

function messageRoleLabel(role: MessageRole): string {
  if (role === MessageRole.VISITOR) {
    return "You"
  }
  if (role === MessageRole.AVATAR) {
    return "Avatar"
  }
  if (role === MessageRole.OPERATOR) {
    return "Operator"
  }

  return "System"
}

function messageBubbleClass(role: MessageRole): string {
  if (role === MessageRole.VISITOR) {
    return "preview-message user"
  }

  if (role === MessageRole.AVATAR) {
    return "preview-message avatar"
  }

  return "preview-message"
}

function PreviewTranscript({ messages }: { messages: AvatarPreviewMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="preview-empty">
        No messages yet. Send a question to generate a preview response.
      </div>
    )
  }

  return (
    <div className="preview-transcript" aria-live="polite">
      {messages.map(message => (
        <div className={messageBubbleClass(message.role)} key={message.id}>
          <p className="preview-message-meta">
            <span>{messageRoleLabel(message.role)}</span>
            <span>{formatConversationTime(message.createdAt)}</span>
          </p>
          <p>{message.content}</p>
          {message.audioUrl ? (
            <div className="preview-audio-card">
              <span>Audio response</span>
              <audio controls preload="metadata" src={message.audioUrl} />
            </div>
          ) : null}
          {message.videoUrl ? (
            <div className="preview-video-card">
              <span>Video response</span>
              <video controls playsInline preload="metadata" src={message.videoUrl} />
            </div>
          ) : null}
          {typeof message.metadata?.audioError === "string" && message.metadata.audioError ? (
            <p className="preview-audio-error">{message.metadata.audioError}</p>
          ) : null}
          {typeof message.metadata?.videoError === "string" && message.metadata.videoError ? (
            <p className="preview-video-error">{message.metadata.videoError}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export default function AvatarPreviewPanel({
  avatarId,
  avatarName,
  selectedVoiceName,
  currentSourcePhoto,
  videoPreconditions,
  previewReady,
  missingRequirements,
  canSend,
  initialConversation
}: AvatarPreviewPanelProps) {
  const [state, action, pending] = useActionState(sendAvatarPreviewMessageAction, {
    ...initialState,
    conversation: initialConversation
  } as PreviewState)
  const [outputMode, setOutputMode] = useState<PreviewOutputMode>("text")

  const conversation = state.conversation ?? initialConversation
  const isReady = previewReady
  const setupWarnings = missingRequirements
  const isVideoReady = Object.values(videoPreconditions).every(Boolean)
  const statusClass = state.status === "error" ? "preview-state-error" : "preview-state-success"
  const conversationReviewPath = conversation?.conversationId
    ? `/dashboard/conversations/${conversation.conversationId}`
    : `/dashboard/conversations?avatarId=${avatarId}&channel=DASHBOARD_PREVIEW`

  const canSubmit = canSend && isReady && !pending && (outputMode !== "video" || isVideoReady)
  const buttonText = pending
    ? outputMode === "video"
      ? "Generating video..."
      : "Generating..."
    : "Send preview question"

  const helperText = useMemo(() => {
    if (!isReady) {
      return "Text preview is blocked until basics, behavior, and at least one READY knowledge source are complete."
    }

    if (!canSend) {
      return "You can view this preview transcript, but only operators can send new preview messages."
    }

    return "Preview uses workspace knowledge context. Video remains an internal dashboard preview and is not a public widget."
  }, [canSend, isReady])

  const videoPreconditionRows = [
    {
      key: "photo",
      label: "Current source photo",
      complete: videoPreconditions.hasPhoto,
      guidance: "Upload an avatar photo before generating video."
    },
    {
      key: "consent",
      label: "Current photo consent",
      complete: videoPreconditions.hasConsent,
      guidance: "Accept avatar identity consent before generating video."
    },
    {
      key: "voice",
      label: "Selected active voice",
      complete: videoPreconditions.hasVoice,
      guidance: "Select a voice before generating video."
    },
    {
      key: "status",
      label: "Avatar not suspended",
      complete: videoPreconditions.isNotSuspended,
      guidance: "Suspended avatars cannot generate preview video."
    }
  ]

  return (
    <section className="avatar-step-panel avatar-preview-panel">
      <div>
        <h3>Avatar Studio Preview</h3>
        <p className="avatar-step-description">Avatar: {avatarName}</p>
        <p className="avatar-step-description">
          Selected voice: {selectedVoiceName ?? "No voice selected"}
        </p>
        <p className="preview-labelling">Text, audio, and avatar video preview</p>
        <p className="form-helper">This is an internal dashboard preview. It does not publish an avatar, expose a widget, or enable public runtime access.</p>
      </div>
      <div className="preview-media-grid">
        <div className="preview-photo-card">
          <span>Selected avatar photo</span>
          {currentSourcePhoto ? (
            <img
              alt={`${avatarName} source photo`}
              src={currentSourcePhoto.displayUrl}
            />
          ) : (
            <p>No source photo selected.</p>
          )}
        </div>
        <div className="preview-video-checklist">
          <span>Video requirements</span>
          <ul>
            {videoPreconditionRows.map(item => (
              <li className={item.complete ? "complete" : "missing"} key={item.key}>
                <strong>{item.complete ? "Ready" : "Needed"}</strong>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="preview-setup-status">
        <p>
          <strong>Setup status:</strong> {isReady ? "Ready" : "Needs setup"}
        </p>
        {!isReady ? (
          <ul>
            {setupWarnings.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
        <p className="avatar-step-description">{helperText}</p>
      {state.message ? (
        <p className={statusClass}>
          {state.message}
        </p>
      ) : null}
      <Link className="avatarkit-link-button" href={conversationReviewPath}>
        Open latest preview conversation
      </Link>
        <form action={action} className="preview-composer">
        <input type="hidden" name="avatarId" value={avatarId} />
        {conversation?.conversationId ? <input type="hidden" name="conversationId" value={conversation.conversationId} /> : null}
        <fieldset className="preview-output-mode">
          <legend>Output mode</legend>
          <label>
            <input
              type="radio"
              name="outputMode"
              value="text"
              checked={outputMode === "text"}
              onChange={() => setOutputMode("text")}
            />
            Text only
          </label>
          <label>
            <input
              type="radio"
              name="outputMode"
              value="audio"
              checked={outputMode === "audio"}
              onChange={() => setOutputMode("audio")}
            />
            Text + audio
          </label>
          <label>
            <input
              type="radio"
              name="outputMode"
              value="video"
              checked={outputMode === "video"}
              onChange={() => setOutputMode("video")}
            />
            Text + avatar video
          </label>
        </fieldset>
        {state.fieldErrors?.outputMode ? <p className="form-error">{state.fieldErrors.outputMode}</p> : null}
        <p className="form-helper">
          Selected voice is required for audio and video. Video also requires the current source photo and consent.
        </p>
        {!selectedVoiceName && (outputMode === "audio" || outputMode === "video") ? (
          <p className="preview-audio-error">
            {outputMode === "video"
              ? "Text + avatar video is blocked until you select an active compatible voice in the Voice step."
              : "Text + audio is blocked until you select an active compatible voice in the Voice step."}
          </p>
        ) : null}
        {outputMode === "video" && !isVideoReady ? (
          <div className="preview-video-error">
            {videoPreconditionRows.filter(item => !item.complete).map(item => (
              <p key={item.key}>{item.guidance}</p>
            ))}
          </div>
        ) : null}
        <label>
          Type a test question
          <textarea
            name="inputText"
            rows={4}
            placeholder="Ask a business question based on configured knowledge."
            maxLength={800}
            required
            disabled={!canSubmit}
          />
        </label>
        {state.fieldErrors?.inputText ? <p className="form-error">{state.fieldErrors.inputText}</p> : null}
        <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={!canSubmit}>
          {buttonText}
        </button>
      </form>
      {!isReady ? (
        <p className="form-helper">Fallback answers are shown only for safe behavior transitions and missing context.</p>
      ) : null}
      <div className="preview-conversation">
        <h4>Conversation transcript</h4>
        {pending ? (
          <p className="form-helper">
            {outputMode === "video" ? "Avatar is generating text, audio, and video..." : "Avatar is thinking..."}
          </p>
        ) : null}
        <PreviewTranscript messages={conversation?.messages ?? []} />
      </div>
    </section>
  )
}
