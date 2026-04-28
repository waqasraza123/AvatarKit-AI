import Link from "next/link"
import type { KnowledgeSummary } from "@/lib/knowledge-shared"
import type { KnowledgeGapSummary } from "@/lib/knowledge-gap"

export default function AvatarKnowledgePanel({
  summary,
  gapSummary,
  avatarId
}: {
  summary: KnowledgeSummary
  gapSummary: KnowledgeGapSummary
  avatarId: string
}) {
  const hasReadyKnowledge = summary.readySourceCount > 0

  return (
    <section className="avatar-step-panel">
      <div>
        <h3>Knowledge</h3>
        <p className="avatar-step-description">
          Workspace knowledge is the business-approved source of truth avatar answers use.
          This avatar uses READY workspace knowledge during runtime grounding.
        </p>
      </div>
      <div className="knowledge-summary-grid">
        <div>
          <span>{summary.readySourceCount}</span>
          <p>Ready sources</p>
        </div>
        <div>
          <span>{summary.readyChunkCount}</span>
          <p>Ready chunks</p>
        </div>
        <div>
          <span>{summary.totalSourceCount}</span>
          <p>Active sources</p>
        </div>
        <div>
          <span>{summary.archivedSourceCount}</span>
          <p>Archived sources</p>
        </div>
        <div>
          <span>{gapSummary.unresolvedCount}</span>
          <p>Unresolved gaps</p>
        </div>
      </div>
      <div className={gapSummary.unresolvedCount > 0 ? "knowledge-readiness-card" : "knowledge-readiness-card ready"}>
        <h4>{gapSummary.unresolvedCount > 0 ? "Knowledge improvements available" : "No unresolved gaps for this avatar"}</h4>
        <p>
          {gapSummary.unresolvedCount > 0
            ? "Review unresolved gaps to improve future answers without blocking the current avatar setup."
            : "Gaps will appear here when this avatar cannot answer confidently."}
        </p>
      </div>
      <div className={hasReadyKnowledge ? "knowledge-readiness-card ready" : "knowledge-readiness-card"}>
        <h4>{hasReadyKnowledge ? "Usable knowledge is ready" : "Knowledge needed"}</h4>
        <p>
          {hasReadyKnowledge
            ? "The setup checklist can count Knowledge added complete. Per-avatar source selection is reserved for a later phase."
            : "Add at least one READY FAQ or manual text source in the workspace Knowledge Base."}
        </p>
      </div>
      <div className="avatar-card-actions">
        <Link className="avatarkit-button avatarkit-button-primary" href="/dashboard/knowledge">
          Open Knowledge Base
        </Link>
        <Link className="avatarkit-button avatarkit-button-secondary" href="/dashboard/knowledge/new?type=faq">
          Add FAQ
        </Link>
        <Link className="avatarkit-button avatarkit-button-secondary" href="/dashboard/knowledge/new?type=text">
          Add manual text
        </Link>
        <Link className="avatarkit-button avatarkit-button-secondary" href={`/dashboard/knowledge/gaps?avatarId=${avatarId}`}>
          Review gaps
        </Link>
      </div>
      <p className="form-helper">
        Gaps do not block publishing retroactively. This step does not add embeddings, crawlers, PDF extraction, or unreviewed AI FAQ publishing.
      </p>
    </section>
  )
}
