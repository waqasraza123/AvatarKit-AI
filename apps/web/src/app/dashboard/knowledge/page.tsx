import Link from "next/link"
import { WorkspaceRole } from "@prisma/client"
import { KnowledgeArchiveForm } from "./_components/knowledge-source-forms"
import { formatWorkspaceLocalTime } from "@/lib/avatar"
import {
  canManageKnowledge,
  fetchKnowledgeSourcesForWorkspace,
  fetchKnowledgeSummaryForWorkspace
} from "@/lib/knowledge"
import type { KnowledgeStatusValue } from "@/lib/knowledge-shared"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

function statusClass(status: KnowledgeStatusValue): string {
  return status === "READY" ? "status-pill knowledge-status-ready" : "status-pill"
}

function statusLabel(status: KnowledgeStatusValue): string {
  return status[0] + status.slice(1).toLowerCase()
}

export default async function DashboardKnowledgePage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string }>
}) {
  const { workspaceId } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/knowledge"
  })

  if (!context) {
    return null
  }

  const [sources, summary] = await Promise.all([
    fetchKnowledgeSourcesForWorkspace(context.workspace.id),
    fetchKnowledgeSummaryForWorkspace(context.workspace.id)
  ])
  const canManage = canManageKnowledge(context.workspaceMembership.role)
  const isViewer = context.workspaceMembership.role === WorkspaceRole.VIEWER

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">AvatarKit AI</p>
        <h1>Knowledge Base</h1>
        <p className="hero-copy section-subtitle">
          Store business-approved information that future avatar answers will use as source-of-truth context.
        </p>
        <p className="avatar-page-intro">
          Phase 6 supports FAQ and manual text sources with deterministic chunks. Website crawling, PDF
          extraction, embeddings, and AI answer generation are intentionally not active yet.
        </p>
        <div className="knowledge-summary-grid">
          <div>
            <span>{summary.totalSourceCount}</span>
            <p>Active sources</p>
          </div>
          <div>
            <span>{summary.readySourceCount}</span>
            <p>Ready sources</p>
          </div>
          <div>
            <span>{summary.readyChunkCount}</span>
            <p>Ready chunks</p>
          </div>
          <div>
            <span>{summary.archivedSourceCount}</span>
            <p>Archived sources</p>
          </div>
        </div>
        <div className="studio-toolbar">
          {isViewer ? (
            <p className="form-error">Viewer role can inspect knowledge but cannot add or change sources.</p>
          ) : (
            <div className="knowledge-action-row">
              <Link className="avatarkit-button avatarkit-button-primary" href="/dashboard/knowledge/new?type=faq">
                Add FAQ
              </Link>
              <Link className="avatarkit-button avatarkit-button-secondary" href="/dashboard/knowledge/new?type=text">
                Add manual text
              </Link>
            </div>
          )}
        </div>
      </section>
      <section className="content-card">
        <h2>Knowledge sources</h2>
        {sources.length === 0 ? (
          <div className="avatar-empty-state">
            <p>No knowledge sources yet. Add an FAQ or manual text source to start building business context.</p>
          </div>
        ) : (
          <div className="knowledge-source-list">
            {sources.map(source => (
              <article className="knowledge-source-card" key={source.id}>
                <div className="knowledge-source-header">
                  <div>
                    <p className="eyebrow">{source.type}</p>
                    <h3>{source.title}</h3>
                    <p className="avatar-meta">
                      Updated {formatWorkspaceLocalTime(source.updatedAt)} · {source.chunkCount} chunks
                    </p>
                    {source.metadata.category ? (
                      <p className="avatar-meta">Category: {source.metadata.category}</p>
                    ) : null}
                  </div>
                  <span className={statusClass(source.status)}>{statusLabel(source.status)}</span>
                </div>
                <div className="avatar-card-actions">
                  <Link className="avatarkit-link-button" href={`/dashboard/knowledge/${source.id}`}>
                    View/edit
                  </Link>
                  <KnowledgeArchiveForm
                    sourceId={source.id}
                    canArchive={canManage && source.status !== "ARCHIVED"}
                    compact
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="content-card">
        <h2>Future source types</h2>
        <div className="knowledge-placeholder-grid">
          <div>
            <h3>Website</h3>
            <p>URL crawling is reserved for a later ingestion phase.</p>
          </div>
          <div>
            <h3>PDF</h3>
            <p>File upload and PDF text extraction are reserved for a later ingestion phase.</p>
          </div>
        </div>
      </section>
    </main>
  )
}
