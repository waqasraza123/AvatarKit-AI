import { WorkspaceRole } from "@prisma/client"
import Link from "next/link"
import { redirect } from "next/navigation"
import { fetchAvatarByIdAndWorkspace, formatWorkspaceLocalTime, buildSetupChecklist, AVATAR_STUDIO_STEPS, AvatarStudioStep } from "@/lib/avatar"
import { hasWorkspaceRole, getWorkspaceContextForRequest } from "@/lib/workspace"
import AvatarBasicsForm from "./_components/avatar-basics-form"
import AvatarBehaviorForm from "./_components/avatar-behavior-form"
import AvatarPhotoForm from "./_components/avatar-photo-form"

type SearchParams = Promise<{ step?: AvatarStudioStep | string; workspaceId?: string }>
type StudioParams = Promise<{ avatarId: string }>

function normalizeStep(step: AvatarStudioStep | string | undefined): AvatarStudioStep {
  if (
    step === "photo" ||
    step === "consent" ||
    step === "voice" ||
    step === "behavior" ||
    step === "knowledge" ||
    step === "preview" ||
    step === "publish" ||
    step === "basics"
  ) {
    return step
  }

  return "basics"
}


function stepStateClass(
  step: AvatarStudioStep,
  activeStep: AvatarStudioStep
): "studio-step-item active" | "studio-step-item" {
  if (step === activeStep) {
    return "studio-step-item active"
  }

  return "studio-step-item"
}

function isStepAvailable(step: AvatarStudioStep): boolean {
  return step === "basics" || step === "photo" || step === "behavior"
}

function SetupLockedPlaceholder({ stepLabel }: { stepLabel: string }) {
  return (
      <section className="avatar-step-panel avatar-step-locked">
        <h3>{stepLabel} is a future phase</h3>
      <p>Coming in a later phase. This step remains locked to keep the rollout disciplined.</p>
      <p>
        This placeholder confirms workspace flow and avoids exposing future controls such as consent collection,
        voice selection, knowledge attachment, preview actions, and publishing.
      </p>
    </section>
  )
}

export default async function AvatarStudioPage({
  params,
  searchParams
}: {
  params: StudioParams
  searchParams: SearchParams
}) {
  const [{ avatarId }, { step: rawStep, workspaceId }] = await Promise.all([params, searchParams])
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: `/dashboard/avatars/${avatarId}/studio`
  })

  if (!context) {
    return null
  }

  const avatar = await fetchAvatarByIdAndWorkspace(context.workspace.id, avatarId)
  if (!avatar) {
    redirect("/dashboard/avatars?error=avatar_not_found")
  }

  const activeStep = normalizeStep(rawStep)
  const canEdit = hasWorkspaceRole(context.workspaceMembership.role, WorkspaceRole.OPERATOR)
  const completion = buildSetupChecklist(avatar)

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Avatar Studio</p>
        <h1>{avatar.displayName}</h1>
        <p className="hero-copy section-subtitle">
          Configure available steps and return later. Unavailable phases remain clearly locked until
          implemented.
        </p>
        <div className="avatar-studio-meta">
          <p>
            {avatar.name} · {avatar.status}
          </p>
          <p>Last updated {formatWorkspaceLocalTime(avatar.updatedAt)}</p>
          <p>Setup: {completion.percentComplete}% complete</p>
        </div>
        <ul className="setup-checklist">
        {completion.checklist.map(item => (
          <li key={item.key} className={item.complete ? "" : "todo"}>
            <span>{item.complete ? "✓" : "—"}</span>
            {item.label}
          </li>
          ))}
        </ul>
      </section>
      <div className="studio-layout">
        <aside className="content-card studio-sidebar">
          <h2>Studio steps</h2>
          <nav aria-label="Avatar studio steps">
            {AVATAR_STUDIO_STEPS.map(step => (
              <Link
                className={stepStateClass(step, activeStep)}
                href={`/dashboard/avatars/${avatar.id}/studio?step=${step}`}
                key={step}
              >
                {step[0].toUpperCase() + step.slice(1)}
                <span>{isStepAvailable(step) ? "Available" : "Future step"}</span>
              </Link>
            ))}
          </nav>
          <p className="form-helper">
            Preview, voice, knowledge, and publish are placeholders until later phases.
          </p>
          <p>
            <Link className="avatarkit-link-button" href="/dashboard/avatars">
              Back to all avatars
            </Link>
          </p>
          </aside>
        <section className="content-card studio-content">
          {activeStep === "basics" ? (
            <AvatarBasicsForm
              avatar={avatar}
              canEdit={canEdit}
            />
          ) : null}
          {activeStep === "photo" ? (
            <AvatarPhotoForm
              avatar={avatar}
              canEdit={canEdit}
            />
          ) : null}
          {activeStep === "behavior" ? (
            <AvatarBehaviorForm
              avatar={avatar}
              canEdit={canEdit}
            />
          ) : null}
          {activeStep !== "basics" && activeStep !== "photo" && activeStep !== "behavior" ? (
            <SetupLockedPlaceholder
              stepLabel={activeStep[0].toUpperCase() + activeStep.slice(1)}
            />
          ) : null}
          {!canEdit ? (
            <p className="form-helper">
              Viewers can open this page but cannot save changes yet.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  )
}
