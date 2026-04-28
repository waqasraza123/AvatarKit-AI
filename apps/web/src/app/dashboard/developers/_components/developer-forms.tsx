"use client"

import { useActionState } from "react"
import {
  createApiKeyAction,
  createWebhookEndpointAction,
  revokeApiKeyAction,
  revokeWebhookEndpointAction,
  type DeveloperActionState
} from "@/app/actions/developers"
import { WEBHOOK_EVENTS } from "@/lib/public-api"

const initialState: DeveloperActionState = {
  status: "idle"
}

function ActionStateMessage({ state }: { state: DeveloperActionState }) {
  if (state.status === "error") {
    return <p className="form-error">{state.message}</p>
  }

  if (state.status === "success") {
    return (
      <div className="form-success">
        <p>{state.message}</p>
        {state.secret ? <code className="developer-secret-value">{state.secret}</code> : null}
      </div>
    )
  }

  return null
}

export function ApiKeyCreateForm({ canManage }: { canManage: boolean }) {
  const [state, action, pending] = useActionState(createApiKeyAction, initialState)

  return (
    <form className="form-shell" action={action}>
      <label>
        Key name
        <input name="name" type="text" placeholder="Production website" disabled={!canManage || pending} />
      </label>
      {state.fieldErrors?.name ? <p className="form-error">{state.fieldErrors.name}</p> : null}
      <ActionStateMessage state={state} />
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={!canManage || pending}>
        Create API key
      </button>
    </form>
  )
}

export function ApiKeyRevokeForm({ apiKeyId, disabled }: { apiKeyId: string; disabled: boolean }) {
  return (
    <form action={revokeApiKeyAction} className="inline-action-form">
      <input type="hidden" name="apiKeyId" value={apiKeyId} />
      <button className="avatarkit-button avatarkit-button-secondary" type="submit" disabled={disabled}>
        Revoke
      </button>
    </form>
  )
}

export function WebhookEndpointCreateForm({ canManage }: { canManage: boolean }) {
  const [state, action, pending] = useActionState(createWebhookEndpointAction, initialState)

  return (
    <form className="form-shell" action={action}>
      <label>
        Endpoint URL
        <input name="url" type="text" placeholder="https://example.com/avatar-webhooks" disabled={!canManage || pending} />
      </label>
      {state.fieldErrors?.url ? <p className="form-error">{state.fieldErrors.url}</p> : null}
      <label>
        Description
        <input name="description" type="text" placeholder="Production CRM sync" disabled={!canManage || pending} />
      </label>
      {state.fieldErrors?.description ? <p className="form-error">{state.fieldErrors.description}</p> : null}
      <fieldset className="preview-output-mode">
        <legend>Events</legend>
        {WEBHOOK_EVENTS.map(event => (
          <label key={event}>
            <input name="events" type="checkbox" value={event} defaultChecked={event === "conversation.started" || event === "lead.created"} disabled={!canManage || pending} />
            {event}
          </label>
        ))}
      </fieldset>
      {state.fieldErrors?.events ? <p className="form-error">{state.fieldErrors.events}</p> : null}
      <ActionStateMessage state={state} />
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={!canManage || pending}>
        Add webhook endpoint
      </button>
    </form>
  )
}

export function WebhookEndpointRevokeForm({ webhookEndpointId, disabled }: { webhookEndpointId: string; disabled: boolean }) {
  return (
    <form action={revokeWebhookEndpointAction} className="inline-action-form">
      <input type="hidden" name="webhookEndpointId" value={webhookEndpointId} />
      <button className="avatarkit-button avatarkit-button-secondary" type="submit" disabled={disabled}>
        Revoke
      </button>
    </form>
  )
}
