import Link from "next/link"
import { redirect } from "next/navigation"
import {
  KnowledgeArchiveForm,
  KnowledgeSourceEditForm
} from "../_components/knowledge-source-forms"
import { formatWorkspaceLocalTime } from "@/lib/avatar"
import {
  canManageKnowledge,
  fetchKnowledgeSourceDetail
} from "@/lib/knowledge"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

type PageParams = Promise<{ sourceId: string }>
type SearchParams = Promise<{ workspaceId?: string; saved?: string }>

function savedMessage(saved: string | undefined): string | null {
  if (saved === "created") {
    return "Knowledge source created."
  }

  return null
}

export default async function KnowledgeSourceDetailPage({
  params,
  searchParams
}: {
  params: PageParams
  searchParams: SearchParams
}) {
  const [{ sourceId }, { workspaceId, saved }] = await Promise.all([params, searchParams])
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: `/dashboard/knowledge/${sourceId}`
  })

  if (!context) {
    return null
  }

  const source = await fetchKnowledgeSourceDetail(context.workspace.id, sourceId)
  if (!source) {
    redirect("/dashboard/knowledge")
  }

  const canManage = canManageKnowledge(context.workspaceMembership.role)
  const createdMessage = savedMessage(saved)

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Knowledge source</p>
        <h1>{source.title}</h1>
        <p className="hero-copy section-subtitle">
          Review source content and deterministic chunks. These chunks are stored for future retrieval phases.
        </p>
        {createdMessage ? <p className="form-success">{createdMessage}</p> : null}
        <div className="avatar-studio-meta">
          <p>
            {source.type} · {source.status}
          </p>
          <p>Last updated {formatWorkspaceLocalTime(source.updatedAt)}</p>
          <p>{source.chunkCount} chunks</p>
        </div>
        <div className="avatar-card-actions">
          <Link className="avatarkit-link-button" href="/dashboard/knowledge">
            Back to knowledge
          </Link>
          <KnowledgeArchiveForm
            sourceId={source.id}
            canArchive={canManage && source.status !== "ARCHIVED"}
            compact
          />
        </div>
      </section>
      <section className="content-card">
        <KnowledgeSourceEditForm source={source} canEdit={canManage} />
      </section>
      <section className="content-card">
        <h2>Chunks</h2>
        {source.chunks.length === 0 ? (
          <p className="avatar-step-description">No chunks are stored for this source.</p>
        ) : (
          <div className="knowledge-chunk-list">
            {source.chunks.map(chunk => (
              <article className="knowledge-chunk-card" key={chunk.id}>
                <p className="eyebrow">Chunk {chunk.position + 1}</p>
                <p>{chunk.content}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
