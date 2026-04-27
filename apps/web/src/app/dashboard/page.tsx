import { DashboardPlaceholder } from "./_components/dashboard-placeholder"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

const moduleCards = [
  {
    title: "Avatars",
    description: "Create avatars and configure appearance in later phases."
  },
  {
    title: "Conversations",
    description: "Conversation and transcripts will appear here in later phases."
  },
  {
    title: "Leads",
    description: "Lead capture, qualification, and assignment will appear here."
  },
  {
    title: "Usage",
    description: "Usage, cost, and quota analytics will appear here."
  }
]

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string; error?: string }>
}) {
  const { workspaceId, error } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard"
  })
  const isWorkspaceForbidden = error === "workspace_forbidden"

  if (!context) {
    return null
  }

  return (
    <main className="content-area">
      {isWorkspaceForbidden ? (
        <section className="content-card">
          <p className="form-error">
            Access denied for the selected workspace. The workspace was reset to one you can access.
          </p>
        </section>
      ) : null}
      <DashboardPlaceholder
        title="Overview"
        subtitle="Welcome to your workspace dashboard."
        intro="Set up your first avatar to begin using this workspace. Other modules are placeholders for next phases."
        workspaceName={context.workspace.name}
        actionHint="Recommended next step: create your first avatar."
        cards={moduleCards}
      />
      <section className="content-card">
        <h2>Setup checklist</h2>
        <ul className="setup-checklist">
          <li>
            <span>1.</span> Create a workspace
          </li>
          <li>
            <span>2.</span> Sign in with workspace context
          </li>
          <li className="todo">
            <span>3.</span> Create first avatar
          </li>
          <li>4. Configure knowledge and usage once available</li>
        </ul>
      </section>
    </main>
  )
}
