"use client"

import { MessageRole } from "@prisma/client"
import { useActionState, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import type { AvatarPhotoAssetRecord, AvatarPreviewConversation, AvatarPreviewMessage } from "@/lib/avatar"
import { sendAvatarPreviewMessageAction, sendAvatarPreviewVoiceMessageAction } from "@/app/actions/avatars"

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
              <span>{message.role === MessageRole.VISITOR ? "Voice input" : "Audio response"}</span>
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
  const [voiceState, setVoiceState] = useState<PreviewState | null>(null)
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "error">("idle")
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordingError, setRecordingError] = useState("")
  const [voiceTranscriptPreview, setVoiceTranscriptPreview] = useState("")
  const [mediaRecorderSupported, setMediaRecorderSupported] = useState(false)
  const [voicePending, setVoicePending] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number>(0)
  const timerRef = useRef<number | null>(null)

  const conversation = voiceState?.conversation ?? state.conversation ?? initialConversation
  const isReady = previewReady
  const setupWarnings = missingRequirements
  const isVideoReady = Object.values(videoPreconditions).every(Boolean)
  const activeStatus = voiceState ?? state
  const statusClass = activeStatus.status === "error" ? "preview-state-error" : "preview-state-success"
  const conversationReviewPath = conversation?.conversationId
    ? `/dashboard/conversations/${conversation.conversationId}`
    : `/dashboard/conversations?avatarId=${avatarId}&channel=DASHBOARD_PREVIEW`

  const canSubmit = canSend && isReady && !pending && !voicePending && (outputMode !== "video" || isVideoReady)
  const canRecord = canSubmit && mediaRecorderSupported && recordingState !== "recording"
  const buttonText = pending || voicePending
    ? outputMode === "video"
      ? "Generating video..."
      : voicePending
        ? "Transcribing..."
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

  useEffect(() => {
    setMediaRecorderSupported(
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined"
    )

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
      }
      mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    }
  }, [])

  function resolveRecordingMimeType(): string {
    if (typeof MediaRecorder === "undefined") {
      return ""
    }
    if (MediaRecorder.isTypeSupported("audio/webm")) {
      return "audio/webm"
    }
    if (MediaRecorder.isTypeSupported("audio/mp4")) {
      return "audio/mp4"
    }
    return ""
  }

  function stopRecordingTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function stopRecordingTracks() {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    mediaStreamRef.current = null
  }

  async function submitVoiceRecording(blob: Blob, durationSeconds: number) {
    setRecordingError("")
    setVoiceTranscriptPreview("")
    const formData = new FormData()
    formData.set("avatarId", avatarId)
    formData.set("outputMode", outputMode)
    formData.set("durationSeconds", String(durationSeconds))
    if (conversation?.conversationId) {
      formData.set("conversationId", conversation.conversationId)
    }
    formData.set("audioFile", new File([blob], `avatar-preview-${Date.now()}.${blob.type.includes("mp4") ? "mp4" : "webm"}`, {
      type: blob.type || "audio/webm"
    }))

    setVoicePending(true)
    try {
      const result = await sendAvatarPreviewVoiceMessageAction(initialState, formData)
      setVoiceState(result)
      const voiceMessage = result.conversation?.messages
        .filter(message => message.role === MessageRole.VISITOR && message.metadata?.inputType === "audio")
        .at(-1)
      setVoiceTranscriptPreview(voiceMessage?.content ?? "")
      if (result.status === "error") {
        setRecordingError(result.message ?? "Voice input failed. Text input is still available.")
      }
    } finally {
      setVoicePending(false)
    }
  }

  async function startRecording() {
    if (!canRecord || recordingState === "recording") {
      return
    }

    setRecordingError("")
    setVoiceTranscriptPreview("")
    audioChunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = resolveRecordingMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      startedAtRef.current = Date.now()
      setRecordingSeconds(0)
      setRecordingState("recording")

      recorder.addEventListener("dataavailable", event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      })

      recorder.addEventListener("stop", () => {
        stopRecordingTimer()
        stopRecordingTracks()
        setRecordingState("idle")
        const durationSeconds = Math.max(0.1, (Date.now() - startedAtRef.current) / 1000)
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" })
        if (blob.size <= 0) {
          setRecordingError("Recording was empty. Try again or type your question.")
          return
        }
        void submitVoiceRecording(blob, durationSeconds)
      })

      recorder.start()
      timerRef.current = window.setInterval(() => {
        const elapsedSeconds = Math.round((Date.now() - startedAtRef.current) / 1000)
        setRecordingSeconds(elapsedSeconds)
        if (elapsedSeconds >= 60 && recorder.state === "recording") {
          recorder.stop()
        }
      }, 500)
    } catch (error) {
      stopRecordingTracks()
      setRecordingState("error")
      setRecordingError(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Microphone permission was denied. Text input is still available."
        : "Microphone recording is not available. Text input is still available.")
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== "recording") {
      return
    }
    recorder.stop()
  }

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
      {activeStatus.message ? (
        <p className={statusClass}>
          {activeStatus.message}
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
        <div className="preview-voice-input">
          <div>
            <span>Voice input</span>
            <p>Push-to-talk recording transcribes your question before the avatar answers.</p>
          </div>
          <div className="preview-voice-actions">
            {recordingState === "recording" ? (
              <button className="avatarkit-button avatarkit-button-secondary" type="button" onClick={stopRecording}>
                Stop recording
              </button>
            ) : (
              <button className="avatarkit-button avatarkit-button-secondary" type="button" onClick={startRecording} disabled={!canRecord}>
                {mediaRecorderSupported ? "Mic" : "Mic unavailable"}
              </button>
            )}
            <span className={recordingState === "recording" ? "preview-recording-timer active" : "preview-recording-timer"}>
              {recordingState === "recording" ? `Recording ${recordingSeconds}s` : voicePending ? "Transcribing..." : "Ready"}
            </span>
          </div>
        </div>
        {!mediaRecorderSupported ? (
          <p className="form-helper">This browser does not support push-to-talk recording. Text input remains available.</p>
        ) : null}
        {recordingError ? <p className="preview-audio-error">{recordingError}</p> : null}
        {voiceTranscriptPreview ? (
          <div className="preview-transcript-preview">
            <span>Transcript</span>
            <p>{voiceTranscriptPreview}</p>
          </div>
        ) : null}
        {voiceState?.fieldErrors?.audioFile ? <p className="form-error">{voiceState.fieldErrors.audioFile}</p> : null}
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
