import { getWorkspaceContextForRequest } from "@/lib/workspace"
import { DashboardPlaceholder } from "../_components/dashboard-placeholder"

export default async function DashboardEmbedPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string }>
}) {
  const { workspaceId } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/embed"
  })

  if (!context) {
    return null
  }

  return (
    <main className="content-area">
      <DashboardPlaceholder
        title="Embed"
        subtitle="Widget publishing placeholder"
        intro="Website embed and SDK publish workflow are intentionally blocked in this phase."
        workspaceName={context.workspace.name}
        cards={[{ title: "Publish flow", description: "Embed scripts and domain controls are not yet available." }]}
      />
    </main>
  )
}
