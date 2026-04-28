import Link from "next/link"
import { redirect } from "next/navigation"
import { KnowledgeGapStatus, WorkspaceRole } from "@prisma/client"
import { updateKnowledgeGapStatusAction } from "@/app/actions/knowledge-gaps"
import {
  canManageKnowledgeGaps,
  fetchKnowledgeGapDetail,
  knowledgeGapLabel
} from "@/lib/knowledge-gap"
import { messageRoleLabel } from "@/lib/conversation"
import { getWorkspaceContextForRequest } from "@/lib/workspace"
import { ConvertGapToFaqForm } from "../_components/knowledge-gap-forms"

type PageParams = Promise<{ gapId: string }>
type SearchParams = Promise<{ workspaceId?: string }>

function StatusForm({
  gapId,
  targetStatus,
  label
}: {
  gapId: string
  targetStatus: KnowledgeGapStatus
  label: string
}) {
  return (
    <form action={updateKnowledgeGapStatusAction} className="inline-action-form">
      <input type="hidden" name="gapId" value={gapId} />
      <input type="hidden" name="targetStatus" value={targetStatus} />
      <input type="hidden" name="returnPath" value={`/dashboard/knowledge/gaps/${gapId}`} />
      <button className="avatarkit-button avatarkit-button-secondary" type="submit">
        {label}
      </button>
    </form>
  )
}

function MetadataSummary({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata) {
    return <p className="form-helper">No metadata was stored for this gap.</p>
  }

  const rows = Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 12)

  if (rows.length === 0) {
    return <p className="form-helper">No metadata was stored for this gap.</p>
  }

  return (
    <div className="conversation-trace-meta">
      {rows.map(([key, value]) => (
        <span key={key}>{key}: {typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
      ))}
    </div>
  )
}

export default async function KnowledgeGapDetailPage({
  params,
  searchParams
}: {
  params: PageParams
  searchParams: SearchParams
}) {
  const [{ gapId }, { workspaceId }] = await Promise.all([params, searchParams])
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: `/dashboard/knowledge/gaps/${gapId}`
  })

  if (!context) {
    return null
  }

  const gap = await fetchKnowledgeGapDetail(context.workspace.id, gapId)
  if (!gap) {
    redirect("/dashboard/knowledge/gaps")
  }

  const canManage = canManageKnowledgeGaps(context.workspaceMembership.role)
  const isViewer = context.workspaceMembership.role === WorkspaceRole.VIEWER
  const canConvert = canManage && gap.status !== KnowledgeGapStatus.RESOLVED && gap.status !== KnowledgeGapStatus.IGNORED

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Knowledge gap</p>
        <h1>{gap.question}</h1>
        <p className="hero-copy section-subtitle">
          Review this gap before resolving it or converting it into approved knowledge.
        </p>
        <div className="conversation-detail-meta">
          <p>Status: {knowledgeGapLabel(gap.status)}</p>
          <p>Reason: {knowledgeGapLabel(gap.reason)}</p>
          <p>Source: {knowledgeGapLabel(gap.source)}</p>
          <p>Frequency: {gap.frequency}</p>
          <p>Last asked: {gap.lastAskedAt}</p>
          <p>Created: {gap.createdAt}</p>
          {gap.resolvedAt ? <p>Resolved: {gap.resolvedAt}</p> : null}
          {gap.resolvedByName ? <p>Resolved by: {gap.resolvedByName}</p> : null}
        </div>
        {isViewer ? <p className="form-helper">Viewer role can inspect this gap but cannot update it.</p> : null}
        <div className="avatar-card-actions">
          <Link className="avatarkit-link-button" href="/dashboard/knowledge/gaps">
            Back to gaps
          </Link>
          {gap.conversationId ? (
            <Link className="avatarkit-link-button" href={`/dashboard/conversations/${gap.conversationId}`}>
              Open linked conversation
            </Link>
          ) : null}
          {canManage && gap.status === KnowledgeGapStatus.NEW ? (
            <StatusForm gapId={gap.id} targetStatus={KnowledgeGapStatus.IN_REVIEW} label="Mark in review" />
          ) : null}
          {canManage && gap.status !== KnowledgeGapStatus.RESOLVED ? (
            <StatusForm gapId={gap.id} targetStatus={KnowledgeGapStatus.RESOLVED} label="Mark resolved" />
          ) : null}
          {canManage && gap.status !== KnowledgeGapStatus.IGNORED && gap.status !== KnowledgeGapStatus.RESOLVED ? (
            <StatusForm gapId={gap.id} targetStatus={KnowledgeGapStatus.IGNORED} label="Ignore" />
          ) : null}
        </div>
      </section>

      <section className="content-card">
        <h2>Review details</h2>
        <div className="lead-detail-grid">
          <div>
            <span>Avatar</span>
            <strong>{gap.avatarName ?? "Workspace-level"}</strong>
          </div>
          <div>
            <span>Conversation</span>
            <strong>{gap.conversationId ? gap.conversationId.slice(0, 8) : "None"}</strong>
          </div>
          <div>
            <span>Message</span>
            <strong>{gap.messageId ? gap.messageId.slice(0, 8) : "None"}</strong>
          </div>
          <div>
            <span>Normalized</span>
            <strong>{gap.normalizedQuestion ?? "None"}</strong>
          </div>
        </div>
        {gap.suggestedAnswer ? (
          <div className="conversation-preview-text">
            <strong>Suggested answer</strong>
            <p>{gap.suggestedAnswer}</p>
          </div>
        ) : null}
        {gap.linkedMessage ? (
          <article className="conversation-message">
            <div className="conversation-message-header">
              <strong>{messageRoleLabel(gap.linkedMessage.role)}</strong>
              <span>{gap.linkedMessage.createdAt}</span>
            </div>
            <p className="conversation-message-content">{gap.linkedMessage.content}</p>
          </article>
        ) : null}
        <MetadataSummary metadata={gap.metadata} />
      </section>

      <section className="content-card">
        <ConvertGapToFaqForm
          gapId={gap.id}
          defaultQuestion={gap.question}
          defaultAnswer={gap.suggestedAnswer ?? ""}
          canConvert={canConvert}
        />
      </section>
    </main>
  )
}
