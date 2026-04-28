import Link from "next/link"
import type { KnowledgeSummary } from "@/lib/knowledge-shared"

export default function AvatarKnowledgePanel({
  summary
}: {
  summary: KnowledgeSummary
}) {
  const hasReadyKnowledge = summary.readySourceCount > 0

  return (
    <section className="avatar-step-panel">
      <div>
        <h3>Knowledge</h3>
        <p className="avatar-step-description">
          Workspace knowledge is the business-approved source of truth future avatar answers will use.
          In Phase 6, this avatar will use all READY workspace knowledge when runtime grounding arrives.
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
      </div>
      <p className="form-helper">
        This step does not run retrieval, embeddings, citations, or AI answer generation.
      </p>
    </section>
  )
}
