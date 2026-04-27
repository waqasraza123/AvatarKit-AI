import { getWorkspaceContextForRequest } from "@/lib/workspace"
import { DashboardPlaceholder } from "../_components/dashboard-placeholder"

export default async function DashboardUsagePage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string }>
}) {
  const { workspaceId } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/usage"
  })

  if (!context) {
    return null
  }

  return (
    <main className="content-area">
      <DashboardPlaceholder
        title="Usage"
        subtitle="Usage placeholder"
        intro="Cost and request analytics are not implemented in this phase."
        workspaceName={context.workspace.name}
        cards={[{ title: "Meters", description: "Usage counters and quota tracking will be available later." }]}
      />
    </main>
  )
}
