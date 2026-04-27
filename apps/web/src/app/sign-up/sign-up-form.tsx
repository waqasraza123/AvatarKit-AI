"use client"

import { useActionState } from "react"
import { signUpAction } from "@/app/actions/auth"

type SignUpFormState = {
  status: "idle" | "error" | "success"
  message?: string
}

const initialState: SignUpFormState = { status: "idle" }

export default function SignUpForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signUpAction, initialState)

  return (
    <form className="form-shell" action={action}>
      <input type="hidden" name="next" value={next ?? ""} />
      <label>
        Display name
        <input type="text" name="displayName" autoComplete="name" required />
      </label>
      <label>
        Email
        <input type="email" name="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input type="password" name="password" autoComplete="new-password" required />
      </label>
      <label>
        Confirm password
        <input type="password" name="confirmPassword" autoComplete="new-password" required />
      </label>
      {state.status === "error" ? <p className="form-error">{state.message}</p> : null}
      {state.status === "success" ? <p className="form-success">{state.message}</p> : null}
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={pending}>
        {pending ? "Creating account..." : "Create account"}
      </button>
    </form>
  )
}
