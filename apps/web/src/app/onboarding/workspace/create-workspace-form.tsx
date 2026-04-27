"use client"

import { useActionState } from "react"
import { createWorkspaceAction } from "@/app/actions/workspace"

type WorkspaceFormState = {
  status: "idle" | "error" | "success"
  message?: string
}

const initialState: WorkspaceFormState = { status: "idle" }

export default function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspaceAction, initialState)

  return (
    <form className="form-shell" action={action}>
      <label>
        Workspace name
        <input type="text" name="workspaceName" required placeholder="Acme Real Estate" />
      </label>
      {state.status === "error" ? <p className="form-error">{state.message}</p> : null}
      {state.status === "success" ? <p className="form-success">{state.message}</p> : null}
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create workspace"}
      </button>
    </form>
  )
}
