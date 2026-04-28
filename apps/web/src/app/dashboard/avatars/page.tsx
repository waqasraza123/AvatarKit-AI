import { WorkspaceRole } from "@prisma/client"
import Link from "next/link"
import { deleteAvatarDraftAction } from "@/app/actions/avatars"
import {
  AVATAR_STUDIO_STEPS,
  AvatarSetupCompletion,
  AvatarStudioStep,
  buildAvatarPublishReadiness,
  buildSetupChecklist,
  fetchAvatarsForWorkspace,
  formatWorkspaceLocalTime,
  getCurrentSourcePhoto,
  hasActiveSelectedVoice,
  hasCurrentPhotoConsent
} from "@/lib/avatar"
import { canEditAvatars } from "@/lib/avatar"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

function normalizeStepLabel(step: AvatarStudioStep | "published"): string {
  if (step === "published") {
    return "Published"
  }
  return `${step[0].toUpperCase()}${step.slice(1)}`
}

function getFirstErrorMessage(error: string | undefined): string {
  if (!error) return "An unexpected issue occurred."
  if (error === "avatar_not_found") {
    return "The selected avatar was not found in this workspace."
  }
  return decodeURIComponent(error)
}

function toProgressText(completion: AvatarSetupCompletion): string {
  return `${completion.completedCount} of ${completion.totalCount} setup items completed`
}

function formatPhotoState(hasPhoto: boolean): string {
  return hasPhoto ? "Photo added" : "Photo needed"
}

function formatConsentState(hasPhoto: boolean, hasConsent: boolean): string {
  if (!hasPhoto) {
    return "Photo needed before consent"
  }

  return hasConsent ? "Consent accepted" : "Consent needed"
}

function formatVoiceState(hasVoice: boolean, voiceName: string | undefined): string {
  return hasVoice ? voiceName || "Voice selected" : "Voice needed"
}

function formatCardSetupState(status: string, isPublishReady: boolean): string {
  if (status === "PUBLISHED") {
    return "Published"
  }

  if (status === "SUSPENDED") {
    return "Suspended"
  }

  if (status === "FAILED") {
    return "Failed"
  }

  return isPublishReady ? "Ready to publish" : "Setup incomplete"
}

function ChecklistSummary({ completion }: { completion: AvatarSetupCompletion }) {
  return (
    <ul className="setup-checklist setup-checklist-summary">
      <li>
        <span>{completion.percentComplete}%</span> Setup completion
      </li>
      {completion.checklist.map(item => (
        <li key={item.key} className={item.complete ? "" : "todo"}>
          <span>{item.complete ? "✓" : "—"}</span> {normalizeStepLabel(item.key)}
        </li>
      ))}
    </ul>
  )
}

function AvatarCard({
  id,
  name,
  displayName,
  role,
  useCase,
  language,
  status,
  setupState,
  updatedAt,
  completion,
  canDelete,
  hasPhoto,
  hasConsent,
  hasVoice,
  voiceName,
  photoUrl
}: {
  id: string
  name: string
  displayName: string
  role: string
  useCase: string
  language: string
  status: string
  setupState: string
  updatedAt: string
  completion: AvatarSetupCompletion
  canDelete: boolean
  hasPhoto: boolean
  hasConsent: boolean
  hasVoice: boolean
  voiceName?: string
  photoUrl?: string
}) {
  return (
    <article className="avatar-list-card">
      <div className="avatar-card-header">
        <div className="avatar-card-photo">
          {hasPhoto && photoUrl ? (
            <img
              alt="Avatar source photo preview"
              className="avatar-card-photo-image"
              src={photoUrl}
            />
          ) : (
            <div className="avatar-card-photo-placeholder">No photo uploaded</div>
          )}
          <p className="avatar-photo-label">{formatPhotoState(hasPhoto)}</p>
          <p className={hasConsent ? "consent-card-state accepted" : "consent-card-state"}>
            {formatConsentState(hasPhoto, hasConsent)}
          </p>
          <p className={hasVoice ? "voice-card-state selected" : "voice-card-state"}>
            {formatVoiceState(hasVoice, voiceName)}
          </p>
        </div>
        <div>
          <p className="hero-copy">{displayName}</p>
          <h3>{name}</h3>
          <p className="avatar-meta">
            {role} · {useCase}
          </p>
        </div>
        <p className="status-pill">{status}</p>
      </div>
      <p className="avatar-meta">Publish state: {setupState}</p>
      <p className="avatar-meta">Language: {language}</p>
      <p className="avatar-meta">Last updated: {updatedAt}</p>
      <p>{toProgressText(completion)}</p>
      <ChecklistSummary completion={completion} />
          <div className="avatar-card-actions">
              <Link className="avatarkit-link-button" href={`/dashboard/avatars/${id}/studio`}>
                Edit
              </Link>
              <Link
                className="avatarkit-link-button"
                href={`/dashboard/avatars/${id}/studio?step=preview`}
              >
                Open text preview
              </Link>
              <Link className="avatarkit-link-button" href={`/dashboard/conversations?avatarId=${id}`}>
                View conversations
              </Link>
              {canDelete ? (
                <form action={deleteAvatarDraftAction}>
                  <input type="hidden" name="avatarId" value={id} />
                  <button className="avatarkit-button avatarkit-button-secondary" type="submit">
              Delete draft
            </button>
          </form>
        ) : null}
      </div>
    </article>
  )
}

export default async function DashboardAvatarsPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string; error?: string }>
}) {
  const { workspaceId, error } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/avatars"
  })

  if (!context) {
    return null
  }

  const avatars = await fetchAvatarsForWorkspace(context.workspace.id)
  const canEdit = canEditAvatars(context.workspaceMembership.role)
  const isViewer = context.workspaceMembership.role === WorkspaceRole.VIEWER

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">AvatarKit AI</p>
        <h1>Avatar Studio</h1>
        <p className="hero-copy section-subtitle">
          Build, preview, and publish controlled avatar profiles for future website embed eligibility.
        </p>
        <p className="avatar-page-intro">
          Create a draft, complete setup, test a dashboard preview, then publish when the server-side
          readiness checks pass. Widget embed remains a later phase.
        </p>
        {error ? <p className="form-error">{getFirstErrorMessage(error)}</p> : null}
        <div className="studio-toolbar">
          {isViewer ? (
            <p className="form-error">
              Your role is viewer. Upgrade to Operator or above to create avatars.
            </p>
          ) : (
            <Link className="avatarkit-button avatarkit-button-primary" href="/dashboard/avatars/new">
              Create avatar draft
            </Link>
          )}
        </div>
      </section>
      <section className="content-card">
        <h2>Avatar list</h2>
        {avatars.length === 0 ? (
          <div className="avatar-empty-state">
            <p>
              No avatars yet. Start by creating your first avatar draft from the button above.
            </p>
          </div>
        ) : (
          <div className="avatar-list-grid">
            {avatars.map(avatar => {
              const completion = buildSetupChecklist(avatar)
              const publishReadiness = buildAvatarPublishReadiness(avatar, { workspaceIsActive: true })
              const currentPhoto = getCurrentSourcePhoto(avatar)
              const hasConsent = hasCurrentPhotoConsent(avatar)
              const hasVoice = hasActiveSelectedVoice(avatar)
              return (
                <AvatarCard
                  key={avatar.id}
                  id={avatar.id}
                  name={avatar.name}
                  displayName={avatar.displayName}
                  role={avatar.role}
                  useCase={avatar.useCase}
                  language={avatar.language}
                  status={avatar.status}
                  setupState={formatCardSetupState(avatar.status, publishReadiness.isReady)}
                  updatedAt={formatWorkspaceLocalTime(avatar.updatedAt)}
                  completion={completion}
                  canDelete={canEdit && avatar.status === "DRAFT"}
                  hasPhoto={Boolean(currentPhoto)}
                  hasConsent={hasConsent}
                  hasVoice={hasVoice}
                  voiceName={avatar.voice?.name}
                  photoUrl={currentPhoto?.displayUrl}
                />
              )
            })}
          </div>
        )}
      </section>
      <section className="content-card">
        <h2>Avatar Studio step summary</h2>
        <ul className="studio-step-summary">
          {AVATAR_STUDIO_STEPS.map(step => (
            <li key={step}>
              <p>{step[0].toUpperCase() + step.slice(1)}</p>
              <span>
                {step === "basics" ||
                step === "photo" ||
                step === "consent" ||
                step === "behavior" ||
                step === "voice" ||
                step === "knowledge" ||
                step === "preview" ||
                step === "publish"
                  ? "Available"
                  : "Future step"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
