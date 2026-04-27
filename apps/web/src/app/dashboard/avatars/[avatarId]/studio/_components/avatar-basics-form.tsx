"use client"

import { AvatarRecord, AVATAR_ANSWER_STYLE_OPTIONS, AVATAR_TONE_OPTIONS } from "@/lib/avatar"
import { useActionState } from "react"
import { updateAvatarBasicsAction } from "@/app/actions/avatars"

type AvatarBasicsFormState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: {
    name?: string
    displayName?: string
    role?: string
    useCase?: string
    language?: string
    tone?: string
    answerStyle?: string
  }
}

const initialState: AvatarBasicsFormState = { status: "idle" }

export default function AvatarBasicsForm({
  avatar,
  canEdit
}: {
  avatar: Pick<
    AvatarRecord,
    "id" | "name" | "displayName" | "role" | "useCase" | "language" | "tone" | "answerStyle"
  >
  canEdit: boolean
}) {
  const [state, action, pending] = useActionState(updateAvatarBasicsAction, initialState)

  if (!canEdit) {
    return (
      <section className="avatar-step-panel">
        <h3>Basics</h3>
        <p>Read only: Viewer role is not allowed to edit.</p>
        <dl className="readonly-grid">
          <div>
            <dt>Avatar name</dt>
            <dd>{avatar.name}</dd>
          </div>
          <div>
            <dt>Public display name</dt>
            <dd>{avatar.displayName}</dd>
          </div>
          <div>
            <dt>Business role</dt>
            <dd>{avatar.role}</dd>
          </div>
          <div>
            <dt>Use case</dt>
            <dd>{avatar.useCase}</dd>
          </div>
          <div>
            <dt>Primary language</dt>
            <dd>{avatar.language}</dd>
          </div>
          <div>
            <dt>Tone</dt>
            <dd>{avatar.tone}</dd>
          </div>
          <div>
            <dt>Answer style</dt>
            <dd>{avatar.answerStyle}</dd>
          </div>
        </dl>
      </section>
    )
  }

  return (
    <form className="form-shell avatar-step-panel" action={action}>
      <input type="hidden" name="avatarId" value={avatar.id} />
      <h3>Basics</h3>
      <p className="avatar-step-description">
        These fields define how the avatar is identified across your workspace.
      </p>
      <label>
        Avatar name
        <input type="text" name="name" defaultValue={avatar.name} required maxLength={120} />
      </label>
      {state.fieldErrors?.name ? <p className="form-error">{state.fieldErrors.name}</p> : null}
      <label>
        Public display name
        <input
          type="text"
          name="displayName"
          defaultValue={avatar.displayName}
          required
          maxLength={140}
        />
      </label>
      {state.fieldErrors?.displayName ? (
        <p className="form-error">{state.fieldErrors.displayName}</p>
      ) : null}
      <label>
        Business role
        <input type="text" name="role" defaultValue={avatar.role} required maxLength={140} />
      </label>
      {state.fieldErrors?.role ? <p className="form-error">{state.fieldErrors.role}</p> : null}
      <label>
        Use case
        <input type="text" name="useCase" defaultValue={avatar.useCase} required maxLength={220} />
      </label>
      {state.fieldErrors?.useCase ? <p className="form-error">{state.fieldErrors.useCase}</p> : null}
      <label>
        Primary language
        <input type="text" name="language" defaultValue={avatar.language} required maxLength={80} />
      </label>
      {state.fieldErrors?.language ? <p className="form-error">{state.fieldErrors.language}</p> : null}
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
      {state.status === "error" && state.message ? <p className="form-error">{state.message}</p> : null}
      {state.status === "success" ? <p className="form-success">{state.message}</p> : null}
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={pending}>
        {pending ? "Saving basics..." : "Save basics"}
      </button>
    </form>
  )
}
