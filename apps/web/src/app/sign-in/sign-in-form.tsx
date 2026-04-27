"use client"

import { useActionState } from "react"
import { signInAction } from "@/app/actions/auth"

type SignInFormState = {
  status: "idle" | "error"
  message?: string
}

const initialState: SignInFormState = { status: "idle" }

export default function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInAction, initialState)

  return (
    <form className="form-shell" action={action}>
      <input type="hidden" name="next" value={next ?? ""} />
      <label>
        Email
        <input type="email" name="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.status === "error" ? <p className="form-error">{state.message}</p> : null}
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  )
}
