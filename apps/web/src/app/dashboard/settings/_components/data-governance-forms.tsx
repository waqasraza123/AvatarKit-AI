"use client"

import { useActionState } from "react"
import {
  cancelWorkspaceDeletionRequestAction,
  requestWorkspaceDataExportAction,
  requestWorkspaceDeletionAction,
  type DataGovernanceActionState
} from "@/app/actions/data-governance"

const initialState: DataGovernanceActionState = {
  status: "idle"
}

function ActionMessage({ state }: { state: DataGovernanceActionState }) {
  if (state.status === "error") {
    return <p className="form-error">{state.message}</p>
  }

  if (state.status === "success") {
    return (
      <div className="form-success">
        <p>{state.message}</p>
        {state.exportId ? (
          <a className="avatarkit-link-button" href={`/api/dashboard/data-exports/${state.exportId}/download`}>
            Download export
          </a>
        ) : null}
      </div>
    )
  }

  return null
}

export function DataExportRequestForm({ canExport }: { canExport: boolean }) {
  const [state, action, pending] = useActionState(requestWorkspaceDataExportAction, initialState)

  return (
    <form className="form-shell" action={action}>
      <ActionMessage state={state} />
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={!canExport || pending}>
        Create workspace export
      </button>
    </form>
  )
}

export function WorkspaceDeletionRequestForm({
  canRequestDeletion,
  workspaceSlug,
  hasActiveRequest
}: {
  canRequestDeletion: boolean
  workspaceSlug: string
  hasActiveRequest: boolean
}) {
  const [state, action, pending] = useActionState(requestWorkspaceDeletionAction, initialState)
  const disabled = !canRequestDeletion || hasActiveRequest || pending

  return (
    <form className="form-shell" action={action}>
      <label>
        Reason
        <textarea name="reason" rows={3} placeholder="Optional internal note for this deletion request" disabled={disabled} />
      </label>
      <label>
        Confirm workspace slug
        <input name="confirmation" type="text" placeholder={workspaceSlug} disabled={disabled} />
      </label>
      {state.fieldErrors?.confirmation ? <p className="form-error">{state.fieldErrors.confirmation}</p> : null}
      <ActionMessage state={state} />
      <button className="avatarkit-button avatarkit-button-secondary" type="submit" disabled={disabled}>
        Request workspace deletion
      </button>
    </form>
  )
}

export function CancelWorkspaceDeletionRequestForm({
  deletionRequestId,
  disabled
}: {
  deletionRequestId: string
  disabled: boolean
}) {
  return (
    <form className="inline-action-form" action={cancelWorkspaceDeletionRequestAction}>
      <input type="hidden" name="deletionRequestId" value={deletionRequestId} />
      <button className="avatarkit-button avatarkit-button-secondary" type="submit" disabled={disabled}>
        Cancel request
      </button>
    </form>
  )
}

