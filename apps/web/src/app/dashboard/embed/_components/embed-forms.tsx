"use client"

import { useActionState } from "react"
import {
  addAllowedDomainAction,
  removeAllowedDomainAction,
  updateWidgetSettingsAction
} from "@/app/actions/widget"
import type { AllowedDomainRecord, WidgetSettingsRecord } from "@/lib/widget"

type WidgetFormState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: Record<string, string>
}

const initialState: WidgetFormState = { status: "idle" }

function FormStateMessage({ state }: { state: WidgetFormState }) {
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

export function AllowedDomainForm({ canManage }: { canManage: boolean }) {
  const [state, action, pending] = useActionState(addAllowedDomainAction, initialState)

  return (
    <form className="form-shell domain-form" action={action}>
      <h3>Add allowed domain</h3>
      <p className="avatar-step-description">
        Store hostnames only. Protocols are normalized away when no path or query is supplied.
      </p>
      <label>
        Domain
        <input
          type="text"
          name="domain"
          placeholder="example.com"
          maxLength={253}
          disabled={!canManage || pending}
        />
      </label>
      <FieldError message={state.fieldErrors?.domain} />
      <FormStateMessage state={state} />
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={!canManage || pending}>
        {pending ? "Adding..." : "Add domain"}
      </button>
    </form>
  )
}

export function AllowedDomainList({
  domains,
  canManage
}: {
  domains: AllowedDomainRecord[]
  canManage: boolean
}) {
  const [state, action, pending] = useActionState(removeAllowedDomainAction, initialState)

  if (domains.length === 0) {
    return (
      <div className="domain-empty-state">
        <p>No allowed domains are configured for this workspace.</p>
        <p>Production widget requests are blocked until at least one domain is added.</p>
      </div>
    )
  }

  return (
    <form className="domain-list-form" action={action}>
      <div className="domain-list">
        {domains.map(domain => (
          <div className="domain-row" key={domain.id}>
            <span>{domain.domain}</span>
            <button
              className="avatarkit-button avatarkit-button-secondary"
              type="submit"
              name="domainId"
              value={domain.id}
              disabled={!canManage || pending}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <FormStateMessage state={state} />
    </form>
  )
}

export function WidgetSettingsForm({
  settings,
  canManage
}: {
  settings: WidgetSettingsRecord
  canManage: boolean
}) {
  const [state, action, pending] = useActionState(updateWidgetSettingsAction, initialState)

  return (
    <form className="form-shell widget-settings-form" action={action}>
      <input type="hidden" name="avatarId" value={settings.avatarId} />
      <h3>Appearance settings</h3>
      <label>
        Theme
        <select name="theme" defaultValue={settings.theme} disabled={!canManage || pending}>
          <option value="light">Light</option>
        </select>
      </label>
      <label>
        Position
        <select name="position" defaultValue={settings.position} disabled={!canManage || pending}>
          <option value="bottom-right">Bottom right</option>
          <option value="bottom-left">Bottom left</option>
        </select>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          name="greetingEnabled"
          defaultChecked={settings.greetingEnabled}
          disabled={!canManage || pending}
        />
        Greeting bubble enabled
      </label>
      <label>
        Greeting text
        <input
          type="text"
          name="greetingText"
          defaultValue={settings.greetingText}
          maxLength={220}
          disabled={!canManage || pending}
        />
      </label>
      <FieldError message={state.fieldErrors?.greetingText} />
      <label>
        Primary color
        <input
          type="text"
          name="primaryColor"
          placeholder="#355cff"
          defaultValue={settings.primaryColor ?? ""}
          maxLength={7}
          disabled={!canManage || pending}
        />
      </label>
      <FieldError message={state.fieldErrors?.primaryColor} />
      <FormStateMessage state={state} />
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={!canManage || pending}>
        {pending ? "Saving..." : "Save widget settings"}
      </button>
    </form>
  )
}
