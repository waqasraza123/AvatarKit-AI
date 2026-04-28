import Link from "next/link"
import { redirect } from "next/navigation"
import { ConversationStatus } from "@prisma/client"
import {
  canManageConversation,
  conversationActionLabel,
  conversationChannelLabel,
  conversationStatusLabel,
  fetchConversationDetail,
  getConversationStatusTransitionTargets,
  messageRoleLabel
} from "@/lib/conversation"
import { leadSourceLabel, leadStatusLabel } from "@/lib/lead"
import { markConversationStatusAction } from "@/app/actions/conversations"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

type PageParams = Promise<{ conversationId: string }>
type SearchParams = Promise<{ workspaceId?: string; statusError?: string }>

function mapStatusMessage(error: string | undefined): string | null {
  if (error === "bad_request") {
    return "Could not process the conversation update request."
  }

  if (error === "missing_conversation") {
    return "The conversation was not found in this workspace."
  }

  if (error === "permission_denied") {
    return "You do not have permission to update conversation status."
  }

  if (error === "transition_not_allowed") {
    return "That conversation status change is not allowed."
  }

  return null
}

function parseConversationMessageTime(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "Unknown time" : parsed.toLocaleString()
}

function parseMetadataLines(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) {
    return []
  }

  const lines: string[] = []
  const provider = metadata.provider
  const inputType = metadata.inputType
  const audioDurationSeconds = metadata.audioDurationSeconds
  const sttLanguage = metadata.sttLanguage
  const sttConfidence = metadata.sttConfidence
  const sttDurationSeconds = metadata.sttDurationSeconds
  const handoffDecision = metadata.handoffDecision
  const leadCaptureDecision = metadata.leadCaptureDecision
  const safetyReason = metadata.safetyReason
  const runtimeStatus = metadata.runtimeStatus
  const intent = metadata.intent
  const confidence = metadata.confidence
  const sourceReferenceCount = metadata.sourceReferenceCount
  const audioStatus = metadata.audioStatus
  const audioError = metadata.audioError
  const ttsUsage = metadata.ttsUsage
  const videoStatus = metadata.videoStatus
  const videoError = metadata.videoError
  const videoUsage = metadata.videoUsage
  const videoProviderJobId = metadata.videoProviderJobId

  if (typeof provider === "string" && provider.trim()) {
    lines.push(`provider: ${provider}`)
  }

  if (typeof inputType === "string" && inputType.trim()) {
    lines.push(`input: ${inputType}`)
  }

  if (typeof audioDurationSeconds === "number") {
    lines.push(`input audio seconds: ${Math.round(audioDurationSeconds * 10) / 10}`)
  }

  if (typeof sttLanguage === "string" && sttLanguage.trim()) {
    lines.push(`stt language: ${sttLanguage}`)
  }

  if (typeof sttConfidence === "number") {
    lines.push(`stt confidence: ${Math.round(sttConfidence * 100)}%`)
  }

  if (typeof sttDurationSeconds === "number") {
    lines.push(`stt seconds: ${Math.round(sttDurationSeconds * 10) / 10}`)
  }

  if (typeof runtimeStatus === "string" && runtimeStatus.trim()) {
    lines.push(`runtime status: ${runtimeStatus}`)
  }

  if (typeof handoffDecision === "string" && handoffDecision.trim()) {
    lines.push(`handoff decision: ${handoffDecision}`)
  }

  if (typeof leadCaptureDecision === "string" && leadCaptureDecision.trim()) {
    lines.push(`lead capture: ${leadCaptureDecision}`)
  }

  if (typeof safetyReason === "string" && safetyReason.trim()) {
    lines.push(`safety: ${safetyReason}`)
  }

  if (typeof intent === "string" && intent.trim()) {
    lines.push(`intent: ${intent}`)
  }

  if (typeof confidence === "number") {
    lines.push(`confidence: ${Math.round(confidence * 100)}%`)
  }

  if (typeof sourceReferenceCount === "number") {
    lines.push(`source refs: ${sourceReferenceCount}`)
  }

  if (typeof audioStatus === "string" && audioStatus.trim() && audioStatus !== "none") {
    lines.push(`audio: ${audioStatus}`)
  }

  if (typeof audioError === "string" && audioError.trim()) {
    lines.push(`audio error: ${audioError}`)
  }

  if (typeof videoStatus === "string" && videoStatus.trim() && videoStatus !== "none") {
    lines.push(`video: ${videoStatus}`)
  }

  if (typeof videoError === "string" && videoError.trim()) {
    lines.push(`video error: ${videoError}`)
  }

  if (typeof videoProviderJobId === "string" && videoProviderJobId.trim()) {
    lines.push(`video job: ${videoProviderJobId}`)
  }

  if (
    ttsUsage &&
    typeof ttsUsage === "object" &&
    !Array.isArray(ttsUsage) &&
    typeof (ttsUsage as { characters?: unknown }).characters === "number"
  ) {
    lines.push(`tts chars: ${(ttsUsage as { characters: number }).characters}`)
  }

  if (
    videoUsage &&
    typeof videoUsage === "object" &&
    !Array.isArray(videoUsage) &&
    typeof (videoUsage as { seconds?: unknown }).seconds === "number"
  ) {
    lines.push(`video seconds: ${(videoUsage as { seconds: number }).seconds}`)
  }

  return lines
}

function traceStatusClass(status: string): string {
  if (status === "SUCCESS") {
    return "conversation-trace-status-success"
  }

  if (status === "FAILURE") {
    return "conversation-trace-status-failed"
  }

  return "conversation-trace-status-neutral"
}

function formatTraceDuration(durationMs: number | null): string {
  if (typeof durationMs !== "number") {
    return "Unknown"
  }

  return `${durationMs}ms`
}

function isEndedStatus(status: ConversationStatus): boolean {
  return status !== ConversationStatus.ACTIVE
}

function isViewerSafePath(path: string): string {
  if (!path.startsWith("/dashboard/conversations")) {
    return "/dashboard/conversations"
  }

  if (path.startsWith("//")) {
    return "/dashboard/conversations"
  }

  return path
}

function ConversationStatusActions({
  conversationId,
  status,
  canManage
}: {
  conversationId: string
  status: ConversationStatus
  canManage: boolean
}) {
  if (!canManage) {
    return null
  }

  const transitions = getConversationStatusTransitionTargets(status)
  if (transitions.length === 0) {
    return null
  }

  return (
    <div className="conversation-row-actions">
      {transitions.map(nextStatus => (
        <form action={markConversationStatusAction} key={nextStatus}>
          <input type="hidden" name="conversationId" value={conversationId} />
          <input type="hidden" name="targetStatus" value={nextStatus} />
          <input type="hidden" name="returnPath" value={isViewerSafePath(`/dashboard/conversations/${conversationId}`)} />
          <button className="avatarkit-button avatarkit-button-secondary" type="submit">
            {conversationActionLabel(nextStatus)}
          </button>
        </form>
      ))}
    </div>
  )
}

function TraceSection({
  traces
}: {
  traces: {
    id: string
    eventType: string
    status: string
    durationMs: number | null
    createdAt: string
    errorMetadata: string[]
    metadata: Record<string, unknown> | null
  }[]
}) {
  if (traces.length === 0) {
    return (
      <section className="content-card">
        <h2>Runtime trace</h2>
        <p className="form-helper">Runtime trace events are not available yet for this conversation.</p>
      </section>
    )
  }

  return (
    <section className="content-card">
      <h2>Runtime trace</h2>
      <div className="conversation-trace-list">
        {traces.map(trace => (
          <article className="conversation-trace-item" key={trace.id}>
            <div className="conversation-trace-header">
              <div>
                <p className="eyebrow">{trace.eventType}</p>
                <p className={traceStatusClass(trace.status)}>{trace.status}</p>
              </div>
              <div className="conversation-trace-meta">
                <span>{trace.durationMs === null ? "duration: n/a" : `duration: ${formatTraceDuration(trace.durationMs)}`}</span>
                <span>{trace.createdAt}</span>
              </div>
            </div>
            <div className="conversation-trace-meta">
              {parseMetadataLines(trace.metadata).map(item => (
                <span key={`${trace.id}-${item}`}>{item}</span>
              ))}
            </div>
            {trace.errorMetadata.length > 0 ? (
              <ul className="conversation-trace-errors">
                {trace.errorMetadata.map((item, index) => (
                  <li key={`${trace.id}-error-${index}`}>{item}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}

export default async function ConversationDetailPage({
  params,
  searchParams
}: {
  params: PageParams
  searchParams: SearchParams
}) {
  const [{ conversationId }, { workspaceId, statusError }] = await Promise.all([params, searchParams])
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: `/dashboard/conversations/${conversationId}`
  })
  if (!context) {
    return null
  }

  const conversation = await fetchConversationDetail(context.workspace.id, conversationId)
  if (!conversation) {
    redirect("/dashboard/conversations")
  }

  const canManage = canManageConversation(context.workspaceMembership.role)
  const statusErrorMessage = mapStatusMessage(statusError)

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Conversation detail</p>
        <h1>Session {conversation.id.slice(0, 8)}</h1>
        <p className="avatar-meta">{conversation.avatarName}</p>
        <div className="conversation-detail-meta">
          <p>
            Channel: {conversationChannelLabel(conversation.channel)} · {conversationStatusLabel(conversation.status)}
          </p>
          <p>Created {conversation.createdAt}</p>
          {conversation.endedAt ? <p>Ended {conversation.endedAt}</p> : null}
          <p>Last updated {conversation.updatedAt}</p>
          {isEndedStatus(conversation.status) && conversation.status !== ConversationStatus.FAILED ? (
            <p>Status indicates this conversation is currently closed.</p>
          ) : null}
          <div className="conversation-detail-actions">
            <Link className="avatarkit-link-button" href="/dashboard/conversations">
              Back to conversations
            </Link>
            <Link className="avatarkit-link-button" href={`/dashboard/avatars/${conversation.avatarId}/studio`}>
              Open avatar studio
            </Link>
          </div>
        </div>
        <ConversationStatusActions
          conversationId={conversation.id}
          status={conversation.status}
          canManage={canManage}
        />
        {statusErrorMessage ? <p className="form-error">{statusErrorMessage}</p> : null}
      </section>

      {conversation.lead ? (
        <section className="content-card">
          <div className="content-card-header">
            <div>
              <p className="eyebrow">Linked lead</p>
              <h2>{conversation.lead.name || "Anonymous visitor"}</h2>
            </div>
            <span className="status-pill lead-status-new">{leadStatusLabel(conversation.lead.status)}</span>
          </div>
          <div className="lead-detail-grid">
            <div>
              <span>Email</span>
              <strong>{conversation.lead.email || "Not provided"}</strong>
            </div>
            <div>
              <span>Phone</span>
              <strong>{conversation.lead.phone || "Not provided"}</strong>
            </div>
            <div>
              <span>Source</span>
              <strong>{leadSourceLabel(conversation.lead.source)}</strong>
            </div>
            <div>
              <span>Captured</span>
              <strong>{conversation.lead.createdAt}</strong>
            </div>
          </div>
          <p className="conversation-preview-text">
            {conversation.lead.message || "No lead message was submitted."}
          </p>
          <Link className="avatarkit-link-button" href={`/dashboard/leads/${conversation.lead.id}`}>
            Open lead detail
          </Link>
        </section>
      ) : null}

      <section className="content-card">
        <h2>Transcript</h2>
        {conversation.messages.length === 0 ? (
          <p className="avatar-step-description">No transcript messages have been stored for this conversation yet.</p>
        ) : (
          <div className="conversation-transcript">
            {conversation.messages.map(message => {
              const metadataLines = parseMetadataLines(message.metadata)
              return (
                <article className="conversation-message" key={message.id}>
                  <div className="conversation-message-header">
                    <strong>{messageRoleLabel(message.role)}</strong>
                    <span>{parseConversationMessageTime(message.createdAt)}</span>
                  </div>
                  <p className="conversation-message-content">{message.content}</p>
                  {message.audioUrl ? (
                    <div className="conversation-audio-card">
                      <span>{message.role === "VISITOR" ? "Voice input" : "Audio response"}</span>
                      <audio controls preload="metadata" src={message.audioUrl} />
                    </div>
                  ) : null}
                  {message.videoUrl ? (
                    <div className="conversation-video-card">
                      <span>Video response</span>
                      <video controls playsInline preload="metadata" src={message.videoUrl} />
                    </div>
                  ) : null}
                  {metadataLines.length > 0 ? (
                    <ul className="conversation-message-metadata">
                      {metadataLines.map(line => (
                        <li key={`${message.id}-${line}`}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="conversation-message-meta-badges">
                    {message.metadataBadges.map(item => (
                      <span
                        className={`conversation-message-badge ${item.tone === "warn" ? "warn" : item.tone === "success" ? "success" : "normal"}`}
                        key={`${message.id}-${item.label}-${item.value}`}
                      >
                        <strong>{item.label}:</strong> {item.value}
                      </span>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      <TraceSection traces={conversation.runtimeTraces} />
    </main>
  )
}
