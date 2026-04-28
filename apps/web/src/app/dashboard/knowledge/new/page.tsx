import Link from "next/link"
import { WorkspaceRole } from "@prisma/client"
import {
  KnowledgeFaqCreateForm,
  KnowledgeTextCreateForm
} from "../_components/knowledge-source-forms"
import { canManageKnowledge } from "@/lib/knowledge"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

type SearchParams = Promise<{ workspaceId?: string; type?: string }>

function normalizeType(type: string | undefined): "faq" | "text" {
  return type === "text" ? "text" : "faq"
}

export default async function NewKnowledgeSourcePage({
  searchParams
}: {
  searchParams: SearchParams
}) {
  const { workspaceId, type } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/knowledge/new"
  })

  if (!context) {
    return null
  }

  const activeType = normalizeType(type)
  const canManage = canManageKnowledge(context.workspaceMembership.role)
  const isViewer = context.workspaceMembership.role === WorkspaceRole.VIEWER

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Knowledge Base</p>
        <h1>Add knowledge source</h1>
        <p className="hero-copy section-subtitle">
          Add approved business context now. Future runtime phases will use READY sources for grounded avatar answers.
        </p>
        <div className="knowledge-action-row">
          <Link
            className={activeType === "faq" ? "avatarkit-button avatarkit-button-primary" : "avatarkit-button avatarkit-button-secondary"}
            href="/dashboard/knowledge/new?type=faq"
          >
            FAQ
          </Link>
          <Link
            className={activeType === "text" ? "avatarkit-button avatarkit-button-primary" : "avatarkit-button avatarkit-button-secondary"}
            href="/dashboard/knowledge/new?type=text"
          >
            Manual text
          </Link>
          <Link className="avatarkit-link-button" href="/dashboard/knowledge">
            Back to knowledge
          </Link>
        </div>
        {isViewer ? <p className="form-error">Viewer role cannot create knowledge sources.</p> : null}
      </section>
      <section className="content-card">
        {canManage && activeType === "faq" ? <KnowledgeFaqCreateForm /> : null}
        {canManage && activeType === "text" ? <KnowledgeTextCreateForm /> : null}
        {!canManage ? (
          <p className="avatar-step-description">
            You can inspect existing knowledge sources from the Knowledge Base page.
          </p>
        ) : null}
      </section>
    </main>
  )
}
