"use client"

import { useActionState } from "react"
import { updateKioskSettingsAction, type KioskActionState } from "@/app/actions/kiosk"
import type { KioskSettingsRecord } from "@/lib/kiosk"

const initialState: KioskActionState = { status: "idle" }

function FormStateMessage({ state }: { state: KioskActionState }) {
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

export function KioskSettingsForm({
  settings,
  canManage
}: {
  settings: KioskSettingsRecord
  canManage: boolean
}) {
  const [state, action, pending] = useActionState(updateKioskSettingsAction, initialState)

  return (
    <form className="form-shell kiosk-settings-form" action={action}>
      <input type="hidden" name="avatarId" value={settings.avatarId} />
      <h3>Kiosk controls</h3>
      <FieldError message={state.fieldErrors?.avatarId} />
      <label className="checkbox-row">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={settings.enabled}
          disabled={!canManage || pending}
        />
        Kiosk mode enabled
      </label>
      <label>
        Idle greeting
        <textarea
          name="idleGreeting"
          defaultValue={settings.idleGreeting}
          maxLength={220}
          rows={3}
          disabled={!canManage || pending}
        />
      </label>
      <FieldError message={state.fieldErrors?.idleGreeting} />
      <div className="kiosk-form-grid">
        <label>
          Inactivity timeout
          <input
            type="number"
            name="inactivityTimeoutSeconds"
            min={30}
            max={1800}
            defaultValue={settings.inactivityTimeoutSeconds}
            disabled={!canManage || pending}
          />
        </label>
        <label>
          Privacy timeout
          <input
            type="number"
            name="privacyTimeoutSeconds"
            min={60}
            max={3600}
            defaultValue={settings.privacyTimeoutSeconds}
            disabled={!canManage || pending}
          />
        </label>
      </div>
      <FieldError message={state.fieldErrors?.privacyTimeoutSeconds} />
      <label>
        Allowed language
        <input
          type="text"
          name="allowedLanguage"
          defaultValue={settings.allowedLanguage ?? ""}
          placeholder="en"
          maxLength={16}
          disabled={!canManage || pending}
        />
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          name="leadCaptureEnabled"
          defaultChecked={settings.leadCaptureEnabled}
          disabled={!canManage || pending}
        />
        Lead capture enabled
      </label>
      <label>
        QR handoff URL
        <input
          type="url"
          name="qrHandoffUrl"
          defaultValue={settings.qrHandoffUrl ?? ""}
          placeholder="https://example.com/continue"
          disabled={!canManage || pending}
        />
      </label>
      <FieldError message={state.fieldErrors?.qrHandoffUrl} />
      <div className="kiosk-form-grid">
        <label>
          Staff call label
          <input
            type="text"
            name="staffCallLabel"
            defaultValue={settings.staffCallLabel ?? ""}
            maxLength={40}
            disabled={!canManage || pending}
          />
        </label>
        <label>
          Staff call URL
          <input
            type="url"
            name="staffCallUrl"
            defaultValue={settings.staffCallUrl ?? ""}
            placeholder="https://example.com/staff"
            disabled={!canManage || pending}
          />
        </label>
      </div>
      <FieldError message={state.fieldErrors?.staffCallLabel} />
      <FieldError message={state.fieldErrors?.staffCallUrl} />
      <FormStateMessage state={state} />
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={!canManage || pending}>
        {pending ? "Saving..." : "Save kiosk settings"}
      </button>
    </form>
  )
}
