import { getWorkspaceContextForRequest } from "@/lib/workspace"

export default async function DashboardSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string }>
}) {
  const { workspaceId } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/settings"
  })

  if (!context) {
    return null
  }

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Settings</p>
        <h1>Workspace settings</h1>
        <p>Settings are intentionally limited to read-only workspace details in Phase 1.</p>
        <dl className="settings-grid">
          <div>
            <dt>Workspace name</dt>
            <dd>{context.workspace.name}</dd>
          </div>
          <div>
            <dt>Workspace slug</dt>
            <dd>{context.workspace.slug}</dd>
          </div>
          <div>
            <dt>Current role</dt>
            <dd>{context.workspaceMembership.role}</dd>
          </div>
          <div>
            <dt>Members</dt>
            <dd>{context.workspaceMemberships.length} active members</dd>
          </div>
        </dl>
        <section className="placeholder-block">
          <h2>Members</h2>
          <p>Member invitations and role updates are disabled until Phase 2.</p>
        </section>
        <section className="placeholder-block">
          <h2>Danger zone</h2>
          <button className="avatarkit-button avatarkit-button-secondary" disabled>
            Delete workspace (disabled)
          </button>
        </section>
      </section>
    </main>
  )
}
