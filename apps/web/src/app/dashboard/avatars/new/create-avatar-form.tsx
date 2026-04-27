"use client"

import { useActionState } from "react"
import {
  AVATAR_ANSWER_STYLE_OPTIONS,
  AVATAR_TONE_OPTIONS
} from "@/lib/avatar"
import { createAvatarDraftAction } from "@/app/actions/avatars"

const initialState = { status: "idle" as const }

export default function CreateAvatarForm() {
  const [state, action, pending] = useActionState(createAvatarDraftAction, initialState)

  return (
    <form className="form-shell" action={action}>
      <label>
        Avatar name
        <input type="text" name="name" required placeholder="Sales assistant" maxLength={120} />
      </label>
      {state.fieldErrors?.name ? <p className="form-error">{state.fieldErrors.name}</p> : null}

      <label>
        Public display name
        <input
          type="text"
          name="displayName"
          required
          placeholder="Customer Support Ava"
          maxLength={140}
        />
      </label>
      {state.fieldErrors?.displayName ? <p className="form-error">{state.fieldErrors.displayName}</p> : null}

      <label>
        Business role
        <input
          type="text"
          name="role"
          required
          placeholder="Real estate appointment coordinator"
          maxLength={140}
        />
      </label>
      {state.fieldErrors?.role ? <p className="form-error">{state.fieldErrors.role}</p> : null}

      <label>
        Primary use case
        <input
          type="text"
          name="useCase"
          required
          placeholder="Clinic front desk"
          maxLength={220}
        />
      </label>
      {state.fieldErrors?.useCase ? <p className="form-error">{state.fieldErrors.useCase}</p> : null}

      <label>
        Primary language
        <input type="text" name="language" required placeholder="English" maxLength={80} />
      </label>
      {state.fieldErrors?.language ? <p className="form-error">{state.fieldErrors.language}</p> : null}

      <label>
        Tone
        <select name="tone" required defaultValue="">
          <option value="" disabled>
            Choose a tone
          </option>
          {AVATAR_TONE_OPTIONS.map(option => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {state.fieldErrors?.tone ? <p className="form-error">{state.fieldErrors.tone}</p> : null}

      <label>
        Answer style
        <select name="answerStyle" required defaultValue="">
          <option value="" disabled>
            Choose an answer style
          </option>
          {AVATAR_ANSWER_STYLE_OPTIONS.map(option => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {state.fieldErrors?.answerStyle ? (
        <p className="form-error">{state.fieldErrors.answerStyle}</p>
      ) : null}

      {state.status === "error" && state.message ? <p className="form-error">{state.message}</p> : null}
      {state.status === "success" ? <p className="form-success">{state.message}</p> : null}

      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={pending}>
        {pending ? "Creating avatar..." : "Create avatar draft"}
      </button>
    </form>
  )
}
