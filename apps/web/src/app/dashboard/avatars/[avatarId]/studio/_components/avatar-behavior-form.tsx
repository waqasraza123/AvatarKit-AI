"use client"

import { AvatarRecord } from "@/lib/avatar"
import { useActionState } from "react"
import { updateAvatarBehaviorAction } from "@/app/actions/avatars"
import {
  AVATAR_ANSWER_STYLE_OPTIONS,
  AVATAR_HANDOFF_PREFERENCE_OPTIONS,
  AVATAR_LEAD_CAPTURE_PREFERENCE_OPTIONS,
  AVATAR_TONE_OPTIONS
} from "@/lib/avatar"

type AvatarBehaviorFormState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: {
    greeting?: string
    tone?: string
    answerStyle?: string
    businessInstructions?: string
    fallbackMessage?: string
    leadCapturePreference?: string
    handoffPreference?: string
  }
}

const initialState: AvatarBehaviorFormState = { status: "idle" }

export default function AvatarBehaviorForm({
  avatar,
  canEdit
}: {
  avatar: Pick<
    AvatarRecord,
    "id" | "greeting" | "tone" | "answerStyle" | "businessInstructions" | "fallbackMessage" | "leadCapturePreference" | "handoffPreference"
  >
  canEdit: boolean
}) {
  const [state, action, pending] = useActionState(updateAvatarBehaviorAction, initialState)

  if (!canEdit) {
    return (
      <section className="avatar-step-panel">
        <h3>Behavior</h3>
        <p>Read only: Viewer role is not allowed to edit.</p>
        <dl className="readonly-grid">
          <div>
            <dt>Greeting</dt>
            <dd>{avatar.greeting}</dd>
          </div>
          <div>
            <dt>Tone</dt>
            <dd>{avatar.tone}</dd>
          </div>
          <div>
            <dt>Answer style</dt>
            <dd>{avatar.answerStyle}</dd>
          </div>
          <div>
            <dt>Business instructions</dt>
            <dd>{avatar.businessInstructions}</dd>
          </div>
          <div>
            <dt>Fallback message</dt>
            <dd>{avatar.fallbackMessage}</dd>
          </div>
          <div>
            <dt>Lead capture preference</dt>
            <dd>{avatar.leadCapturePreference}</dd>
          </div>
          <div>
            <dt>Handoff preference</dt>
            <dd>{avatar.handoffPreference}</dd>
          </div>
        </dl>
      </section>
    )
  }

  return (
    <form className="form-shell avatar-step-panel" action={action}>
      <input type="hidden" name="avatarId" value={avatar.id} />
      <h3>Behavior</h3>
      <p className="avatar-step-description">
        Behavior defines the conversational personality and fallback rules for this avatar.
      </p>
      <label>
        Greeting
        <textarea
          name="greeting"
          defaultValue={avatar.greeting}
          required
          rows={2}
          maxLength={500}
        />
      </label>
      {state.fieldErrors?.greeting ? <p className="form-error">{state.fieldErrors.greeting}</p> : null}
      <label>
        Tone
        <select name="tone" required defaultValue={avatar.tone || ""}>
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
        <select name="answerStyle" required defaultValue={avatar.answerStyle || ""}>
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
      <label>
        Business instructions
        <textarea
          name="businessInstructions"
          defaultValue={avatar.businessInstructions}
          required
          rows={5}
          maxLength={2000}
        />
      </label>
      {state.fieldErrors?.businessInstructions ? (
        <p className="form-error">{state.fieldErrors.businessInstructions}</p>
      ) : null}
      <label>
        Fallback message
        <textarea
          name="fallbackMessage"
          defaultValue={avatar.fallbackMessage}
          required
          rows={3}
          maxLength={500}
        />
      </label>
      {state.fieldErrors?.fallbackMessage ? (
        <p className="form-error">{state.fieldErrors.fallbackMessage}</p>
      ) : null}
      <label>
        Lead capture preference
        <select
          name="leadCapturePreference"
          required
          defaultValue={avatar.leadCapturePreference || ""}
        >
          <option value="" disabled>
            Choose a lead capture preference
          </option>
          {AVATAR_LEAD_CAPTURE_PREFERENCE_OPTIONS.map(option => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {state.fieldErrors?.leadCapturePreference ? (
        <p className="form-error">{state.fieldErrors.leadCapturePreference}</p>
      ) : null}
      <label>
        Handoff preference
        <select
          name="handoffPreference"
          required
          defaultValue={avatar.handoffPreference || ""}
        >
          <option value="" disabled>
            Choose a handoff preference
          </option>
          {AVATAR_HANDOFF_PREFERENCE_OPTIONS.map(option => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {state.fieldErrors?.handoffPreference ? (
        <p className="form-error">{state.fieldErrors.handoffPreference}</p>
      ) : null}
      {state.status === "error" && state.message ? <p className="form-error">{state.message}</p> : null}
      {state.status === "success" ? <p className="form-success">{state.message}</p> : null}
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={pending}>
        {pending ? "Saving behavior..." : "Save behavior"}
      </button>
    </form>
  )
}
