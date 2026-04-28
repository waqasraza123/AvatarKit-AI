import { AvatarStatus, WorkspaceRole } from "@prisma/client"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  AVATAR_STUDIO_STEPS,
  AvatarStudioStep,
  buildAvatarPublishReadiness,
  buildSetupChecklist,
  fetchAvatarByIdAndWorkspace,
  formatWorkspaceLocalTime,
  fetchDashboardPreviewConversation,
  getCurrentSourcePhoto,
  hasActiveSelectedVoice,
  hasCurrentPhotoConsent,
  isAvatarTextPreviewReady
} from "@/lib/avatar"
import { fetchActiveVoices, isVoiceLanguageCompatible } from "@/lib/avatar-voice"
import { fetchKnowledgeSummaryForWorkspace } from "@/lib/knowledge"
import { hasWorkspaceRole, getWorkspaceContextForRequest } from "@/lib/workspace"
import AvatarBasicsForm from "./_components/avatar-basics-form"
import AvatarBehaviorForm from "./_components/avatar-behavior-form"
import AvatarConsentForm from "./_components/avatar-consent-form"
import AvatarKnowledgePanel from "./_components/avatar-knowledge-panel"
import AvatarPhotoForm from "./_components/avatar-photo-form"
import AvatarVoiceForm from "./_components/avatar-voice-form"
import AvatarPreviewPanel from "./_components/avatar-preview-panel"
import AvatarPublishPanel from "./_components/avatar-publish-panel"

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
  return step === "basics" ||
    step === "photo" ||
    step === "consent" ||
    step === "voice" ||
    step === "behavior" ||
    step === "knowledge" ||
    step === "preview" ||
    step === "publish"
}

function SetupLockedPlaceholder({ stepLabel }: { stepLabel: string }) {
  return (
    <section className="avatar-step-panel avatar-step-locked">
      <h3>{stepLabel} is a future phase</h3>
      <p>Coming in a later phase. This step remains locked to keep the rollout disciplined.</p>
      <p>
        This placeholder confirms workspace flow and avoids exposing future controls such as preview actions
        and publishing.
      </p>
    </section>
  )
}

function formatPublishReadinessLabel(status: AvatarStatus, isReady: boolean): string {
  if (status === AvatarStatus.SUSPENDED) {
    return "Suspended"
  }

  if (status === AvatarStatus.PUBLISHED) {
    return "Published"
  }

  return isReady ? "Ready to publish" : "Setup incomplete"
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
  const canPublish = canEdit
  const canAcceptConsent = canEdit && avatar.status !== AvatarStatus.SUSPENDED
  const canEditVoice = canEdit && avatar.status !== AvatarStatus.SUSPENDED
  const completion = buildSetupChecklist(avatar)
  const publishReadiness = buildAvatarPublishReadiness(avatar, { workspaceIsActive: true })
  const publishReadinessLabel = formatPublishReadinessLabel(avatar.status, publishReadiness.isReady)
  const previewReadiness = isAvatarTextPreviewReady(avatar)
  const currentSourcePhoto = getCurrentSourcePhoto(avatar)
  const hasVideoConsent = hasCurrentPhotoConsent(avatar)
  const hasVideoVoice = hasActiveSelectedVoice(avatar) && Boolean(
    avatar.voice && isVoiceLanguageCompatible(avatar.language, avatar.voice.language)
  )
  const voices = activeStep === "voice" ? await fetchActiveVoices() : []
  const knowledgeSummary = activeStep === "knowledge"
    ? await fetchKnowledgeSummaryForWorkspace(context.workspace.id)
    : null
  const previewConversation = activeStep === "preview"
    ? await fetchDashboardPreviewConversation(context.workspace.id, avatar.id)
    : null

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Avatar Studio</p>
        <h1>{avatar.displayName}</h1>
        <p className="hero-copy section-subtitle">
          Configure setup steps, test an internal preview, and publish only when readiness checks pass.
        </p>
        <div className="avatar-studio-meta">
          <p>
            {avatar.name} · {avatar.status}
          </p>
          <p>Last updated {formatWorkspaceLocalTime(avatar.updatedAt)}</p>
          <p>Setup: {completion.percentComplete}% complete</p>
          <p>Publish readiness: {publishReadinessLabel}</p>
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
                <span>
                  {step === "publish"
                    ? publishReadinessLabel
                    : isStepAvailable(step)
                      ? "Available"
                      : "Future step"}
                </span>
              </Link>
            ))}
          </nav>
          <p className="form-helper">
            Preview supports dashboard-only text, audio, and avatar video. Publish only marks future widget eligibility.
          </p>
          <p className="form-helper">Public widget access is not available until the widget phase is implemented.</p>
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
          {activeStep === "consent" ? (
            <AvatarConsentForm
              avatar={avatar}
              canAcceptConsent={canAcceptConsent}
            />
          ) : null}
          {activeStep === "voice" ? (
            <AvatarVoiceForm
              avatar={avatar}
              voices={voices}
              canEditVoice={canEditVoice}
            />
          ) : null}
          {activeStep === "behavior" ? (
            <AvatarBehaviorForm
              avatar={avatar}
              canEdit={canEdit}
            />
          ) : null}
          {activeStep === "knowledge" && knowledgeSummary ? (
            <AvatarKnowledgePanel summary={knowledgeSummary} />
          ) : null}
          {activeStep === "preview" ? (
            <AvatarPreviewPanel
              avatarId={avatar.id}
              avatarName={avatar.name}
              selectedVoiceName={avatar.voice?.status === "ACTIVE" ? avatar.voice.name : null}
              currentSourcePhoto={currentSourcePhoto}
              videoPreconditions={{
                hasPhoto: Boolean(currentSourcePhoto),
                hasConsent: hasVideoConsent,
                hasVoice: hasVideoVoice,
                isNotSuspended: avatar.status !== AvatarStatus.SUSPENDED
              }}
              previewReady={previewReadiness.ready}
              missingRequirements={previewReadiness.missingRequirements}
              canSend={canEdit}
              initialConversation={previewConversation}
            />
          ) : null}
          {activeStep === "publish" ? (
            <AvatarPublishPanel
              avatarId={avatar.id}
              avatarName={avatar.name}
              status={avatar.status}
              publishedAt={avatar.publishedAt ? formatWorkspaceLocalTime(avatar.publishedAt) : null}
              previewResponseCount={avatar.previewResponseCount}
              readiness={publishReadiness}
              canPublish={canPublish}
            />
          ) : null}
          {activeStep !== "basics" &&
          activeStep !== "photo" &&
          activeStep !== "consent" &&
          activeStep !== "voice" &&
          activeStep !== "behavior" &&
          activeStep !== "knowledge" &&
          activeStep !== "preview" &&
          activeStep !== "publish" ? (
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
