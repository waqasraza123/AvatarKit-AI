"use client"

import { useActionState, useMemo, useState } from "react"
import { acceptAvatarConsentAction } from "@/app/actions/avatars"
import {
  formatWorkspaceLocalTime,
  getCurrentSourcePhoto,
  type AvatarRecord
} from "@/lib/avatar"
import {
  AVATAR_CONSENT_REQUIRED_STATEMENTS,
  AVATAR_CONSENT_TERMS_VERSION,
  AVATAR_CONSENT_TYPE_OPTIONS,
  AVATAR_PERMISSION_BASIS_OPTIONS,
  getAvatarConsentState,
  type AvatarConsentFieldErrors
} from "@/lib/avatar-consent"

type AvatarConsentActionState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: AvatarConsentFieldErrors
}

const initialState: AvatarConsentActionState = { status: "idle" }

export default function AvatarConsentForm({
  avatar,
  canAcceptConsent
}: {
  avatar: Pick<AvatarRecord, "id" | "name" | "displayName" | "photoAssets" | "consentRecords">
  canAcceptConsent: boolean
}) {
  const [state, action, pending] = useActionState(acceptAvatarConsentAction, initialState)
  const currentPhoto = getCurrentSourcePhoto(avatar)
  const consentState = getAvatarConsentState({
    currentSourcePhotoId: currentPhoto?.id ?? null,
    consentRecords: avatar.consentRecords
  })
  const [consentType, setConsentType] = useState(consentState.currentConsent?.consentType ?? "")
  const [permissionBasis, setPermissionBasis] = useState(consentState.currentConsent?.permissionBasis ?? "")
  const [acceptedStatements, setAcceptedStatements] = useState<Record<string, boolean>>({})
  const allStatementsAccepted = useMemo(
    () => AVATAR_CONSENT_REQUIRED_STATEMENTS.every(statement => acceptedStatements[statement.key]),
    [acceptedStatements]
  )
  const canSubmit = Boolean(
    canAcceptConsent &&
    currentPhoto &&
    consentType &&
    permissionBasis &&
    allStatementsAccepted &&
    !pending
  )
  const latestConsentStale = Boolean(
    currentPhoto &&
    consentState.latestConsentAcceptedAt &&
    !consentState.isCurrentConsentValid
  )

  return (
    <section className="avatar-step-panel">
      <div>
        <p className="eyebrow">Identity safety</p>
        <h3>Consent</h3>
      </div>
      <p className="avatar-step-description">
        AvatarKit AI is for authorized business avatars. Confirm that your workspace has the rights
        to use the current source photo before this avatar can move toward future publishing.
      </p>
      <div className="consent-overview-grid">
        <div className="avatar-photo-preview-wrap">
          {currentPhoto ? (
            <img
              alt="Current source photo for consent"
              className="avatar-photo-preview"
              src={currentPhoto.displayUrl}
            />
          ) : (
            <div className="avatar-photo-placeholder">Upload a photo before consent</div>
          )}
        </div>
        <div className="consent-status-panel">
          <p className="avatar-photo-status">
            {consentState.isCurrentConsentValid ? "Consent accepted" : "Consent needed"}
          </p>
          <dl className="readonly-grid">
            <div>
              <dt>Avatar</dt>
              <dd>{avatar.displayName || avatar.name}</dd>
            </div>
            <div>
              <dt>Terms version</dt>
              <dd>{AVATAR_CONSENT_TERMS_VERSION}</dd>
            </div>
            <div>
              <dt>Accepted</dt>
              <dd>
                {consentState.currentConsent
                  ? formatWorkspaceLocalTime(new Date(consentState.currentConsent.acceptedAt))
                  : "Not accepted for current photo"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      {!currentPhoto ? (
        <p className="form-error">
          Upload a valid source photo before accepting identity consent.
        </p>
      ) : null}
      {latestConsentStale ? (
        <p className="form-error">
          The source photo changed after consent was accepted. Review the current photo and
          re-accept consent for this image.
        </p>
      ) : null}
      {!canAcceptConsent ? (
        <p className="form-error">
          Your current role or avatar status allows viewing consent state only.
        </p>
      ) : null}
      <form className="form-shell consent-form" action={action}>
        <input type="hidden" name="avatarId" value={avatar.id} />
        <input type="hidden" name="sourcePhotoAssetId" value={currentPhoto?.id ?? ""} />
        <label>
          Consent type
          <select
            name="consentType"
            required
            value={consentType}
            onChange={event => setConsentType(event.currentTarget.value)}
            disabled={!currentPhoto || !canAcceptConsent}
          >
            <option value="" disabled>
              Select consent type
            </option>
            {AVATAR_CONSENT_TYPE_OPTIONS.map(option => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {state.fieldErrors?.consentType ? <p className="form-error">{state.fieldErrors.consentType}</p> : null}
        <label>
          Permission basis
          <select
            name="permissionBasis"
            required
            value={permissionBasis}
            onChange={event => setPermissionBasis(event.currentTarget.value)}
            disabled={!currentPhoto || !canAcceptConsent}
          >
            <option value="" disabled>
              Select permission basis
            </option>
            {AVATAR_PERMISSION_BASIS_OPTIONS.map(option => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {state.fieldErrors?.permissionBasis ? (
          <p className="form-error">{state.fieldErrors.permissionBasis}</p>
        ) : null}
        <div className="consent-statement-group">
          {AVATAR_CONSENT_REQUIRED_STATEMENTS.map(statement => (
            <label className="consent-checkbox" key={statement.key}>
              <input
                type="checkbox"
                name={statement.key}
                disabled={!currentPhoto || !canAcceptConsent}
                onChange={event => {
                  setAcceptedStatements(current => ({
                    ...current,
                    [statement.key]: event.currentTarget.checked
                  }))
                }}
              />
              <span>{statement.label}</span>
            </label>
          ))}
        </div>
        {state.status === "error" && state.message ? <p className="form-error">{state.message}</p> : null}
        {state.status === "success" && state.message ? <p className="form-success">{state.message}</p> : null}
        <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={!canSubmit}>
          {pending ? "Accepting consent..." : "Accept consent"}
        </button>
      </form>
      <div className="avatar-photo-guidance">
        <h4>Identity usage rules</h4>
        <ul>
          <li>Use business avatars only when your workspace has authorization for the image.</li>
          <li>Do not impersonate public figures, celebrities, politicians, or private people without permission.</li>
          <li>Do not use avatars for fake endorsements, fraud, deception, or misleading identity claims.</li>
          <li>Use future runtime experiences transparently as AI business assistants.</li>
          <li>Consent can be re-confirmed when the source photo changes.</li>
          <li>Advanced identity verification and moderation checks are planned for later phases.</li>
        </ul>
      </div>
    </section>
  )
}
