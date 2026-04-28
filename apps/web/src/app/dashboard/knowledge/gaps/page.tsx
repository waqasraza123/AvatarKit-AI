import Link from "next/link"
import { KnowledgeGapStatus, WorkspaceRole } from "@prisma/client"
import { updateKnowledgeGapStatusAction } from "@/app/actions/knowledge-gaps"
import {
  KNOWLEDGE_GAP_REASONS,
  KNOWLEDGE_GAP_RECENT_PRESETS,
  KNOWLEDGE_GAP_SOURCES,
  KNOWLEDGE_GAP_STATUSES,
  canManageKnowledgeGaps,
  fetchKnowledgeGapAvatarFilters,
  fetchKnowledgeGapSummary,
  fetchKnowledgeGaps,
  knowledgeGapLabel,
  parseKnowledgeGapFilters
} from "@/lib/knowledge-gap"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

type SearchParams = Promise<{
  workspaceId?: string
  status?: string
  reason?: string
  source?: string
  avatarId?: string
  recent?: string
}>

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
      <input type="hidden" name="returnPath" value="/dashboard/knowledge/gaps" />
      <button className="avatarkit-button avatarkit-button-secondary" type="submit">
        {label}
      </button>
    </form>
  )
}

export default async function KnowledgeGapsPage({
  searchParams
}: {
  searchParams: SearchParams
}) {
  const raw = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: raw.workspaceId,
    nextPath: "/dashboard/knowledge/gaps"
  })

  if (!context) {
    return null
  }

  const filters = parseKnowledgeGapFilters(raw)
  const [gaps, summary, avatars] = await Promise.all([
    fetchKnowledgeGaps(context.workspace.id, filters),
    fetchKnowledgeGapSummary(context.workspace.id),
    fetchKnowledgeGapAvatarFilters(context.workspace.id)
  ])
  const canManage = canManageKnowledgeGaps(context.workspaceMembership.role)
  const isViewer = context.workspaceMembership.role === WorkspaceRole.VIEWER

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Knowledge Base</p>
        <h1>Knowledge Gaps</h1>
        <p className="hero-copy section-subtitle">
          Review questions avatars could not answer confidently and convert reviewed answers into approved FAQ knowledge.
        </p>
        <div className="knowledge-summary-grid">
          <div>
            <span>{summary.unresolvedCount}</span>
            <p>Unresolved gaps</p>
          </div>
          <div>
            <span>{summary.newCount}</span>
            <p>New</p>
          </div>
          <div>
            <span>{summary.inReviewCount}</span>
            <p>In review</p>
          </div>
          <div>
            <span>{gaps.length}</span>
            <p>Shown by filters</p>
          </div>
        </div>
        {isViewer ? (
          <p className="form-helper">Viewer role can inspect gaps but cannot resolve, ignore, or convert them.</p>
        ) : null}
        <div className="avatar-card-actions">
          <Link className="avatarkit-link-button" href="/dashboard/knowledge">
            Back to Knowledge Base
          </Link>
        </div>
      </section>

      <section className="content-card">
        <h2>Filters</h2>
        <form className="conversation-filter-form">
          <div className="safety-filter-row">
            <label>
              Status
              <select name="status" defaultValue={filters.status}>
                <option value="ALL">All</option>
                {KNOWLEDGE_GAP_STATUSES.map(status => (
                  <option value={status} key={status}>{knowledgeGapLabel(status)}</option>
                ))}
              </select>
            </label>
            <label>
              Avatar
              <select name="avatarId" defaultValue={filters.avatarId ?? ""}>
                <option value="">All avatars</option>
                {avatars.map(avatar => (
                  <option value={avatar.id} key={avatar.id}>{avatar.name}</option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <select name="reason" defaultValue={filters.reason}>
                <option value="ALL">All</option>
                {KNOWLEDGE_GAP_REASONS.map(reason => (
                  <option value={reason} key={reason}>{knowledgeGapLabel(reason)}</option>
                ))}
              </select>
            </label>
            <label>
              Source
              <select name="source" defaultValue={filters.source}>
                <option value="ALL">All</option>
                {KNOWLEDGE_GAP_SOURCES.map(source => (
                  <option value={source} key={source}>{knowledgeGapLabel(source)}</option>
                ))}
              </select>
            </label>
            <label>
              Recent
              <select name="recent" defaultValue={filters.recent}>
                {KNOWLEDGE_GAP_RECENT_PRESETS.map(recent => (
                  <option value={recent} key={recent}>{recent === "all" ? "All" : recent}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="conversation-filter-actions">
            <button className="avatarkit-button avatarkit-button-primary" type="submit">
              Apply filters
            </button>
            <Link className="avatarkit-link-button" href="/dashboard/knowledge/gaps">
              Clear filters
            </Link>
          </div>
        </form>
      </section>

      <section className="content-card">
        <h2>Gap queue</h2>
        {gaps.length === 0 ? (
          <div className="avatar-empty-state">
            <p>No knowledge gaps yet.</p>
            <p className="avatar-step-description">
              Gaps appear when avatars cannot answer confidently, use a missing-knowledge fallback, or an operator marks an answer for review.
            </p>
          </div>
        ) : (
          <div className="knowledge-source-list">
            {gaps.map(gap => (
              <article className="knowledge-source-card" key={gap.id}>
                <div className="knowledge-source-header">
                  <div>
                    <p className="eyebrow">{knowledgeGapLabel(gap.reason)}</p>
                    <h3>{gap.question}</h3>
                    <p className="avatar-meta">
                      {gap.avatarName ?? "Workspace"} · {knowledgeGapLabel(gap.source)} · frequency {gap.frequency} · last asked {gap.lastAskedAt}
                    </p>
                    {gap.suggestedAnswer ? <p className="conversation-preview-text">{gap.suggestedAnswer}</p> : null}
                  </div>
                  <span className={gap.status === KnowledgeGapStatus.RESOLVED ? "status-pill knowledge-status-ready" : "status-pill"}>
                    {knowledgeGapLabel(gap.status)}
                  </span>
                </div>
                <div className="avatar-card-actions">
                  <Link className="avatarkit-link-button" href={`/dashboard/knowledge/gaps/${gap.id}`}>
                    Review gap
                  </Link>
                  {gap.conversationId ? (
                    <Link className="avatarkit-link-button" href={`/dashboard/conversations/${gap.conversationId}`}>
                      Open conversation
                    </Link>
                  ) : null}
                  {canManage && gap.status === KnowledgeGapStatus.NEW ? (
                    <StatusForm gapId={gap.id} targetStatus={KnowledgeGapStatus.IN_REVIEW} label="Mark in review" />
                  ) : null}
                  {canManage && gap.status !== KnowledgeGapStatus.IGNORED && gap.status !== KnowledgeGapStatus.RESOLVED ? (
                    <StatusForm gapId={gap.id} targetStatus={KnowledgeGapStatus.IGNORED} label="Ignore" />
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
