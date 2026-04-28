"use client"

import { AvatarStatus } from "@prisma/client"
import { useActionState } from "react"
import { publishAvatarAction, unpublishAvatarAction } from "@/app/actions/avatars"
import type { AvatarPublishReadiness } from "@/lib/avatar"

type AvatarPublishPanelProps = {
  avatarId: string
  avatarName: string
  status: AvatarStatus
  publishedAt: string | null
  previewResponseCount: number
  readiness: AvatarPublishReadiness
  canPublish: boolean
}

type PublishState = {
  status: "idle" | "error" | "success"
  message?: string
}

const initialState: PublishState = {
  status: "idle"
}

function stateClass(status: PublishState["status"]): string {
  if (status === "error") {
    return "preview-state-error"
  }

  return "preview-state-success"
}

export default function AvatarPublishPanel({
  avatarId,
  avatarName,
  status,
  publishedAt,
  previewResponseCount,
  readiness,
  canPublish
}: AvatarPublishPanelProps) {
  const [publishState, publishAction, publishPending] = useActionState(publishAvatarAction, initialState)
  const [unpublishState, unpublishAction, unpublishPending] = useActionState(unpublishAvatarAction, initialState)
  const isPublished = status === AvatarStatus.PUBLISHED
  const isSuspended = status === AvatarStatus.SUSPENDED
  const canSubmitPublish = canPublish && readiness.isReady && !publishPending && !unpublishPending
  const canSubmitUnpublish = canPublish && isPublished && !publishPending && !unpublishPending

  return (
    <section className="avatar-step-panel avatar-publish-panel">
      <div>
        <h3>Publish Avatar</h3>
        <p className="avatar-step-description">Avatar: {avatarName}</p>
        <p className="avatar-step-description">Current status: {status}</p>
        {publishedAt ? (
          <p className="avatar-step-description">First published: {publishedAt}</p>
        ) : null}
      </div>
      <div className="publish-explainer">
        <p>Publishing makes this avatar eligible for website embed in the next phase.</p>
        <p>Public widget access is not available until the widget phase is implemented.</p>
        <p>You can unpublish anytime.</p>
      </div>
      <div className={readiness.isReady ? "publish-readiness-card ready" : "publish-readiness-card"}>
        <h4>{isPublished ? "Published" : readiness.isReady ? "Ready to publish" : "Setup incomplete"}</h4>
        <p>
          {readiness.completedRequirements.length} of{" "}
          {readiness.completedRequirements.length + readiness.missingRequirements.length} publish requirements complete.
        </p>
      </div>
      <div className="publish-checklist-grid">
        <section>
          <h4>Completed</h4>
          {readiness.completedRequirements.length > 0 ? (
            <ul className="publish-requirement-list">
              {readiness.completedRequirements.map(requirement => (
                <li className="complete" key={requirement.key}>
                  <strong>{requirement.label}</strong>
                  <span>{requirement.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="avatar-step-description">No publish requirements are complete yet.</p>
          )}
        </section>
        <section>
          <h4>Missing or blocked</h4>
          {readiness.missingRequirements.length > 0 ? (
            <ul className="publish-requirement-list">
              {readiness.missingRequirements.map(requirement => (
                <li className="missing" key={requirement.key}>
                  <strong>{requirement.label}</strong>
                  <span>{requirement.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="avatar-step-description">No missing publish requirements.</p>
          )}
        </section>
      </div>
      <div className="preview-setup-status">
        <p>
          <strong>Final internal preview summary:</strong>{" "}
          {previewResponseCount > 0
            ? `${previewResponseCount} successful dashboard preview response${previewResponseCount === 1 ? "" : "s"} recorded.`
            : "No successful dashboard preview response has been recorded yet."}
        </p>
      </div>
      {readiness.blockingIssues.length > 0 ? (
        <div className="preview-video-error">
          {readiness.blockingIssues.map(issue => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      ) : null}
      {isSuspended ? (
        <p className="form-error">Suspended avatars cannot be published.</p>
      ) : null}
      {!canPublish ? (
        <p className="form-helper">Viewers can review publish readiness but cannot publish or unpublish avatars.</p>
      ) : null}
      {publishState.message ? (
        <p className={stateClass(publishState.status)}>{publishState.message}</p>
      ) : null}
      {unpublishState.message ? (
        <p className={stateClass(unpublishState.status)}>{unpublishState.message}</p>
      ) : null}
      <div className="avatar-card-actions">
        {!isPublished ? (
          <form action={publishAction}>
            <input type="hidden" name="avatarId" value={avatarId} />
            <button
              className="avatarkit-button avatarkit-button-primary"
              type="submit"
              disabled={!canSubmitPublish}
            >
              {publishPending ? "Publishing..." : "Publish avatar"}
            </button>
          </form>
        ) : null}
        {isPublished ? (
          <form action={unpublishAction}>
            <input type="hidden" name="avatarId" value={avatarId} />
            <button
              className="avatarkit-button avatarkit-button-secondary"
              type="submit"
              disabled={!canSubmitUnpublish}
            >
              {unpublishPending ? "Unpublishing..." : "Unpublish avatar"}
            </button>
          </form>
        ) : null}
      </div>
      <p className="form-helper">No embed code, public endpoint, public visitor runtime, or widget script is created in this phase.</p>
    </section>
  )
}
