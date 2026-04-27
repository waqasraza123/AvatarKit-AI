import { WorkspaceRole } from "@prisma/client"
import Link from "next/link"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"
import CreateAvatarForm from "./create-avatar-form"

export default async function CreateAvatarPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string }>
}) {
  const { workspaceId } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/avatars/new"
  })

  if (!context) {
    return null
  }

  const canCreateAvatar = hasWorkspaceRole(context.workspaceMembership.role, WorkspaceRole.OPERATOR)

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Avatar Studio</p>
        <h1>Create avatar draft</h1>
        <p className="hero-copy section-subtitle">
          Complete the basics to start a new avatar setup flow for your workspace.
        </p>
        {canCreateAvatar ? (
          <CreateAvatarForm />
        ) : (
          <div>
            <p className="form-error">
              Viewer roles cannot create avatars. Ask an OWNER, ADMIN, or OPERATOR to do this.
            </p>
            <Link className="avatarkit-link-button" href="/dashboard/avatars">
              Back to avatars
            </Link>
          </div>
        )}
      </section>
    </main>
  )
}
