"use client"

import { useActionState } from "react"
import { convertKnowledgeGapToFaqAction } from "@/app/actions/knowledge-gaps"
import {
  KNOWLEDGE_CATEGORY_MAX_LENGTH,
  KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH,
  KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH,
  KNOWLEDGE_TITLE_MAX_LENGTH
} from "@/lib/knowledge-shared"

type KnowledgeGapFormState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: {
    gapId?: string
    title?: string
    question?: string
    answer?: string
    category?: string
  }
}

const initialState: KnowledgeGapFormState = { status: "idle" }

function FieldError({ message }: { message?: string }) {
  return message ? <p className="form-error">{message}</p> : null
}

export function ConvertGapToFaqForm({
  gapId,
  defaultQuestion,
  defaultAnswer,
  canConvert
}: {
  gapId: string
  defaultQuestion: string
  defaultAnswer: string
  canConvert: boolean
}) {
  const [state, action, pending] = useActionState(convertKnowledgeGapToFaqAction, initialState)

  if (!canConvert) {
    return (
      <p className="form-helper">
        This gap cannot currently be converted into knowledge.
      </p>
    )
  }

  return (
    <form className="form-shell knowledge-form" action={action}>
      <input type="hidden" name="gapId" value={gapId} />
      <h3>Create reviewed FAQ</h3>
      <p className="avatar-step-description">
        Review and edit the answer before saving it as approved business knowledge.
      </p>
      <label>
        Title
        <input
          type="text"
          name="title"
          required
          maxLength={KNOWLEDGE_TITLE_MAX_LENGTH}
          defaultValue={`FAQ: ${defaultQuestion.slice(0, 70)}`}
        />
      </label>
      <FieldError message={state.fieldErrors?.title} />
      <label>
        Question
        <textarea
          name="question"
          required
          rows={4}
          maxLength={KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH}
          defaultValue={defaultQuestion}
        />
      </label>
      <FieldError message={state.fieldErrors?.question} />
      <label>
        Reviewed answer
        <textarea
          name="answer"
          required
          rows={7}
          maxLength={KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH}
          defaultValue={defaultAnswer}
        />
      </label>
      <FieldError message={state.fieldErrors?.answer} />
      <label>
        Category
        <input type="text" name="category" maxLength={KNOWLEDGE_CATEGORY_MAX_LENGTH} defaultValue="Knowledge gaps" />
      </label>
      <FieldError message={state.fieldErrors?.category} />
      {state.status === "error" && state.message ? <p className="form-error">{state.message}</p> : null}
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={pending}>
        {pending ? "Creating FAQ..." : "Create FAQ and resolve gap"}
      </button>
    </form>
  )
}
