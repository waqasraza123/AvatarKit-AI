"use client"

import { useActionState } from "react"
import {
  duplicateAvatarForAgencyAction,
  updateAgencyBrandingAction,
  updateAgencyClientProfileAction,
  type AgencyActionState
} from "@/app/actions/agency"
import type {
  AgencyWorkspaceSummary,
  WorkspaceBrandingRecord,
  WorkspaceClientProfileRecord
} from "@/lib/agency"

type AgencyAvatarOption = {
  id: string
  workspaceId: string
  name: string
  displayName: string
  status: string
}

const initialState: AgencyActionState = { status: "idle" }

function FormStateMessage({ state }: { state: AgencyActionState }) {
  if (state.status === "error" && state.message) {
    return <p className="form-error">{state.message}</p>
  }

  if (state.status === "success" && state.message) {
    return <p className="form-success">{state.message}</p>
  }

  return null
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="form-error">{message}</p> : null
}

export function AgencyBrandingForm({
  branding,
  canManage,
  canUseWhiteLabel
}: {
  branding: WorkspaceBrandingRecord
  canManage: boolean
  canUseWhiteLabel: boolean
}) {
  const [state, action, pending] = useActionState(updateAgencyBrandingAction, initialState)

  return (
    <form className="form-shell agency-form" action={action}>
      <h3>White-label widget</h3>
      <label>
        Brand name
        <input
          type="text"
          name="brandName"
          defaultValue={branding.brandName ?? ""}
          maxLength={80}
          disabled={!canManage || pending}
        />
      </label>
      <FieldError message={state.fieldErrors?.brandName} />
      <label>
        Custom logo URL
        <input
          type="url"
          name="customLogoUrl"
          defaultValue={branding.customLogoUrl ?? ""}
          placeholder="https://example.com/logo.svg"
          disabled={!canManage || pending}
        />
      </label>
      <FieldError message={state.fieldErrors?.customLogoUrl} />
      <label>
        Widget accent color
        <input
          type="text"
          name="widgetAccentColor"
          defaultValue={branding.widgetAccentColor ?? ""}
          placeholder="#355cff"
          maxLength={7}
          disabled={!canManage || pending}
        />
      </label>
      <FieldError message={state.fieldErrors?.widgetAccentColor} />
      <label className="checkbox-row">
        <input
          type="checkbox"
          name="hideAvatarKitBranding"
          defaultChecked={branding.hideAvatarKitBranding}
          disabled={!canManage || pending || !canUseWhiteLabel}
        />
        Hide AvatarKit branding
      </label>
      {!canUseWhiteLabel ? (
        <p className="avatar-meta">Available on Agency and Enterprise plans.</p>
      ) : null}
      <FieldError message={state.fieldErrors?.hideAvatarKitBranding} />
      <FormStateMessage state={state} />
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={!canManage || pending}>
        {pending ? "Saving..." : "Save white-label settings"}
      </button>
    </form>
  )
}

export function AgencyClientProfileForm({
  profile,
  canManage
}: {
  profile: WorkspaceClientProfileRecord
  canManage: boolean
}) {
  const [state, action, pending] = useActionState(updateAgencyClientProfileAction, initialState)
  const checklist = profile.checklist

  return (
    <form className="form-shell agency-form" action={action}>
      <h3>Client handoff</h3>
      <label>
        Client name
        <input
          type="text"
          name="clientName"
          defaultValue={profile.clientName ?? ""}
          maxLength={120}
          disabled={!canManage || pending}
        />
      </label>
      <FieldError message={state.fieldErrors?.clientName} />
      <div className="agency-form-grid">
        <label>
          Contact name
          <input
            type="text"
            name="clientContactName"
            defaultValue={profile.clientContactName ?? ""}
            maxLength={120}
            disabled={!canManage || pending}
          />
        </label>
        <label>
          Contact email
          <input
            type="email"
            name="clientContactEmail"
            defaultValue={profile.clientContactEmail ?? ""}
            maxLength={254}
            disabled={!canManage || pending}
          />
        </label>
      </div>
      <FieldError message={state.fieldErrors?.clientContactName} />
      <FieldError message={state.fieldErrors?.clientContactEmail} />
      <label>
        Handoff notes
        <textarea
          name="handoffNotes"
          defaultValue={profile.handoffNotes ?? ""}
          rows={5}
          maxLength={2000}
          disabled={!canManage || pending}
        />
      </label>
      <FieldError message={state.fieldErrors?.handoffNotes} />
      <div className="agency-checklist-form">
        <label className="checkbox-row">
          <input type="checkbox" name="avatarReviewed" defaultChecked={checklist.avatarReviewed} disabled={!canManage || pending} />
          Avatar reviewed
        </label>
        <label className="checkbox-row">
          <input type="checkbox" name="knowledgeReviewed" defaultChecked={checklist.knowledgeReviewed} disabled={!canManage || pending} />
          Knowledge reviewed
        </label>
        <label className="checkbox-row">
          <input type="checkbox" name="domainConfigured" defaultChecked={checklist.domainConfigured} disabled={!canManage || pending} />
          Domain configured
        </label>
        <label className="checkbox-row">
          <input type="checkbox" name="widgetInstalled" defaultChecked={checklist.widgetInstalled} disabled={!canManage || pending} />
          Widget installed
        </label>
        <label className="checkbox-row">
          <input type="checkbox" name="clientAccepted" defaultChecked={checklist.clientAccepted} disabled={!canManage || pending} />
          Client accepted
        </label>
      </div>
      <FormStateMessage state={state} />
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={!canManage || pending}>
        {pending ? "Saving..." : "Save handoff profile"}
      </button>
    </form>
  )
}

export function AgencyDuplicateAvatarForm({
  workspaces,
  avatars,
  canManage
}: {
  workspaces: AgencyWorkspaceSummary[]
  avatars: AgencyAvatarOption[]
  canManage: boolean
}) {
  const [state, action, pending] = useActionState(duplicateAvatarForAgencyAction, initialState)
  const sourceWorkspaces = workspaces.filter(workspace => avatars.some(avatar => avatar.workspaceId === workspace.id))
  const writableWorkspaces = workspaces.filter(workspace => workspace.role !== "VIEWER")

  return (
    <form className="form-shell agency-form" action={action}>
      <h3>Duplicate avatar template</h3>
      <div className="agency-form-grid">
        <label>
          Source workspace
          <select name="sourceWorkspaceId" disabled={!canManage || pending || sourceWorkspaces.length === 0}>
            {sourceWorkspaces.map(workspace => (
              <option value={workspace.id} key={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source avatar
          <select name="sourceAvatarId" disabled={!canManage || pending || avatars.length === 0}>
            {avatars.map(avatar => (
              <option value={avatar.id} key={avatar.id}>
                {avatar.displayName} / {avatar.name} / {avatar.status}
              </option>
            ))}
          </select>
        </label>
      </div>
      <FieldError message={state.fieldErrors?.sourceWorkspaceId} />
      <FieldError message={state.fieldErrors?.sourceAvatarId} />
      <label>
        Target workspace
        <select name="targetWorkspaceId" disabled={!canManage || pending || writableWorkspaces.length === 0}>
          {writableWorkspaces.map(workspace => (
            <option value={workspace.id} key={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      </label>
      <FieldError message={state.fieldErrors?.targetWorkspaceId} />
      <div className="agency-form-grid">
        <label>
          New avatar name
          <input type="text" name="newName" maxLength={120} disabled={!canManage || pending} />
        </label>
        <label>
          New display name
          <input type="text" name="newDisplayName" maxLength={140} disabled={!canManage || pending} />
        </label>
      </div>
      <FieldError message={state.fieldErrors?.newName} />
      <FieldError message={state.fieldErrors?.newDisplayName} />
      <label className="checkbox-row">
        <input type="checkbox" name="copyBehavior" defaultChecked disabled={!canManage || pending} />
        Copy behavior instructions
      </label>
      <label className="checkbox-row">
        <input type="checkbox" name="copyVoice" defaultChecked disabled={!canManage || pending} />
        Copy selected voice
      </label>
      <p className="avatar-meta">
        Source photo, consent records, conversations, knowledge sources, widget settings, kiosk settings, and leads are never copied.
      </p>
      <FormStateMessage state={state} />
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={!canManage || pending || avatars.length === 0}>
        {pending ? "Duplicating..." : "Duplicate as draft"}
      </button>
    </form>
  )
}
