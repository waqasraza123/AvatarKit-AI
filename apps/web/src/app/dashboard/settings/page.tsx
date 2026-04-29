import Link from "next/link"
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
        <p>Review workspace identity, membership context, and production governance controls.</p>
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
          <p>Member invitations and role updates are still managed outside this local dashboard build.</p>
        </section>
        <section className="placeholder-block">
          <h2>Data governance</h2>
          <p>Export workspace records, inspect retained data counts, and create audited deletion requests.</p>
          <Link className="avatarkit-button avatarkit-button-primary" href="/dashboard/settings/data">
            Open data governance
          </Link>
        </section>
      </section>
    </main>
  )
}
