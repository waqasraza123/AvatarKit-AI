import { getWorkspaceContextForRequest } from "@/lib/workspace"
import { DashboardPlaceholder } from "../_components/dashboard-placeholder"

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

  return (
    <main className="content-area">
      <DashboardPlaceholder
        title="Knowledge"
        subtitle="Knowledge base placeholder"
        intro="This module will hold FAQ and context sources before runtime grounding."
        workspaceName={context.workspace.name}
        cards={[
          { title: "Sources", description: "Source ingestion and retrieval indexing will be added next." },
          { title: "Grounding", description: "Grounded answer controls and audit logs are not yet active." }
        ]}
      />
    </main>
  )
}
