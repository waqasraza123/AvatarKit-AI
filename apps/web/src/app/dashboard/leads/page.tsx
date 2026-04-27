import { getWorkspaceContextForRequest } from "@/lib/workspace"
import { DashboardPlaceholder } from "../_components/dashboard-placeholder"

export default async function DashboardLeadsPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string }>
}) {
  const { workspaceId } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/leads"
  })

  if (!context) {
    return null
  }

  return (
    <main className="content-area">
      <DashboardPlaceholder
        title="Leads"
        subtitle="Lead capture placeholder"
        intro="Lead and qualification workflows will be introduced in a later phase."
        workspaceName={context.workspace.name}
        cards={[
          { title: "Lead feed", description: "Lead capture is not yet available." },
          { title: "Pipelines", description: "Assignment and follow-up automation are not yet available." }
        ]}
      />
    </main>
  )
}
