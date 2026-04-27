import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import CreateWorkspaceForm from "./create-workspace-form"
import { getCurrentUser } from "@/lib/workspace"

export default async function WorkspaceOnboardingPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    redirect("/sign-in?next=/onboarding/workspace")
  }

  const workspaceCount = await prisma.workspaceMember.count({ where: { userId: currentUser.id } })
  if (workspaceCount > 0) {
    redirect("/dashboard")
  }

  return (
    <main className="page-shell onboarding-shell">
      <section className="content-card onboarding-card">
        <p className="eyebrow">Workspace setup</p>
        <h1>Create your first workspace</h1>
        <p className="hero-copy">
          Give your team a workspace name. The first workspace creator becomes the OWNER.
        </p>
        <CreateWorkspaceForm />
      </section>
    </main>
  )
}

