import { getWorkspaceContextForRequest } from "@/lib/workspace"
import { DashboardPlaceholder } from "../_components/dashboard-placeholder"

export default async function DashboardConversationsPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string }>
}) {
  const { workspaceId } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/conversations"
  })

  if (!context) {
    return null
  }

  return (
    <main className="content-area">
      <DashboardPlaceholder
        title="Conversations"
        subtitle="Conversation history placeholder"
        intro="Visitor conversations and thread-level controls will be implemented in a later phase."
        workspaceName={context.workspace.name}
        cards={[
          { title: "Thread list", description: "Conversation history is not yet captured." },
          { title: "Insights", description: "Sentiment and intent analytics are a later phase." }
        ]}
      />
    </main>
  )
}
