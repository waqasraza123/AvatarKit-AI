"use client"

import {
  archiveKnowledgeSourceAction,
  createKnowledgeFaqAction,
  createKnowledgeTextAction,
  updateKnowledgeSourceAction
} from "@/app/actions/knowledge"
import {
  KNOWLEDGE_CATEGORY_MAX_LENGTH,
  KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH,
  KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH,
  KNOWLEDGE_TEXT_CONTENT_MAX_LENGTH,
  KNOWLEDGE_TITLE_MAX_LENGTH,
  type KnowledgeSourceDetail
} from "@/lib/knowledge-shared"
import { useActionState } from "react"

type KnowledgeFormState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: {
    title?: string
    question?: string
    answer?: string
    content?: string
    category?: string
    sourceId?: string
    sourceType?: string
  }
}

const initialState: KnowledgeFormState = { status: "idle" }

function FormStateMessage({ state }: { state: KnowledgeFormState }) {
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

export function KnowledgeFaqCreateForm() {
  const [state, action, pending] = useActionState(createKnowledgeFaqAction, initialState)

  return (
    <form className="form-shell knowledge-form" action={action}>
      <input type="hidden" name="sourceType" value="FAQ" />
      <h3>Create FAQ source</h3>
      <p className="avatar-step-description">
        Save approved question-and-answer knowledge for future avatar responses.
      </p>
      <label>
        Title
        <input type="text" name="title" required maxLength={KNOWLEDGE_TITLE_MAX_LENGTH} />
      </label>
      <FieldError message={state.fieldErrors?.title} />
      <label>
        Question
        <textarea name="question" required rows={4} maxLength={KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH} />
      </label>
      <FieldError message={state.fieldErrors?.question} />
      <label>
        Answer
        <textarea name="answer" required rows={7} maxLength={KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH} />
      </label>
      <FieldError message={state.fieldErrors?.answer} />
      <label>
        Category
        <input type="text" name="category" maxLength={KNOWLEDGE_CATEGORY_MAX_LENGTH} />
      </label>
      <FieldError message={state.fieldErrors?.category} />
      <FormStateMessage state={state} />
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={pending}>
        {pending ? "Saving FAQ..." : "Save FAQ source"}
      </button>
    </form>
  )
}

export function KnowledgeTextCreateForm() {
  const [state, action, pending] = useActionState(createKnowledgeTextAction, initialState)

  return (
    <form className="form-shell knowledge-form" action={action}>
      <input type="hidden" name="sourceType" value="TEXT" />
      <h3>Create manual text source</h3>
      <p className="avatar-step-description">
        Add business-approved text such as policies, services, pricing notes, or operating details.
      </p>
      <label>
        Title
        <input type="text" name="title" required maxLength={KNOWLEDGE_TITLE_MAX_LENGTH} />
      </label>
      <FieldError message={state.fieldErrors?.title} />
      <label>
        Content
        <textarea name="content" required rows={12} maxLength={KNOWLEDGE_TEXT_CONTENT_MAX_LENGTH} />
      </label>
      <FieldError message={state.fieldErrors?.content} />
      <label>
        Category
        <input type="text" name="category" maxLength={KNOWLEDGE_CATEGORY_MAX_LENGTH} />
      </label>
      <FieldError message={state.fieldErrors?.category} />
      <FormStateMessage state={state} />
      <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={pending}>
        {pending ? "Saving text..." : "Save text source"}
      </button>
    </form>
  )
}

export function KnowledgeSourceEditForm({
  source,
  canEdit
}: {
  source: KnowledgeSourceDetail
  canEdit: boolean
}) {
  const [state, action, pending] = useActionState(updateKnowledgeSourceAction, initialState)
  const isArchived = source.status === "ARCHIVED"
  const isFaq = source.type === "FAQ"
  const isText = source.type === "TEXT"
  const isEditableType = isFaq || isText
  const formDisabled = !canEdit || isArchived || !isEditableType

  if (!isEditableType) {
    return (
      <section className="avatar-step-panel">
        <h3>{source.title}</h3>
        <p className="avatar-step-description">
          {source.type} sources are placeholders in Phase 6. Crawling, extraction, and file ingestion arrive later.
        </p>
      </section>
    )
  }

  return (
    <form className="form-shell knowledge-form" action={action}>
      <input type="hidden" name="sourceId" value={source.id} />
      <input type="hidden" name="sourceType" value={source.type} />
      <h3>Edit source</h3>
      <p className="avatar-step-description">
        Updates regenerate deterministic chunks for future retrieval. Runtime answer generation is not active yet.
      </p>
      {isArchived ? <p className="form-error">Archived knowledge sources cannot be edited.</p> : null}
      {!canEdit ? <p className="form-error">Viewer role can inspect this source but cannot edit it.</p> : null}
      <label>
        Title
        <input
          type="text"
          name="title"
          required
          maxLength={KNOWLEDGE_TITLE_MAX_LENGTH}
          defaultValue={source.title}
          disabled={formDisabled}
        />
      </label>
      <FieldError message={state.fieldErrors?.title} />
      {isFaq ? (
        <>
          <label>
            Question
            <textarea
              name="question"
              required
              rows={4}
              maxLength={KNOWLEDGE_FAQ_QUESTION_MAX_LENGTH}
              defaultValue={source.metadata.question ?? ""}
              disabled={formDisabled}
            />
          </label>
          <FieldError message={state.fieldErrors?.question} />
          <label>
            Answer
            <textarea
              name="answer"
              required
              rows={7}
              maxLength={KNOWLEDGE_FAQ_ANSWER_MAX_LENGTH}
              defaultValue={source.metadata.answer ?? ""}
              disabled={formDisabled}
            />
          </label>
          <FieldError message={state.fieldErrors?.answer} />
        </>
      ) : null}
      {isText ? (
        <>
          <label>
            Content
            <textarea
              name="content"
              required
              rows={14}
              maxLength={KNOWLEDGE_TEXT_CONTENT_MAX_LENGTH}
              defaultValue={source.rawText ?? ""}
              disabled={formDisabled}
            />
          </label>
          <FieldError message={state.fieldErrors?.content} />
        </>
      ) : null}
      <label>
        Category
        <input
          type="text"
          name="category"
          maxLength={KNOWLEDGE_CATEGORY_MAX_LENGTH}
          defaultValue={source.metadata.category ?? ""}
          disabled={formDisabled}
        />
      </label>
      <FieldError message={state.fieldErrors?.category} />
      <FormStateMessage state={state} />
      {canEdit && !isArchived ? (
        <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={pending}>
          {pending ? "Saving source..." : "Save source"}
        </button>
      ) : null}
    </form>
  )
}

export function KnowledgeArchiveForm({
  sourceId,
  canArchive,
  compact = false
}: {
  sourceId: string
  canArchive: boolean
  compact?: boolean
}) {
  const [state, action, pending] = useActionState(archiveKnowledgeSourceAction, initialState)

  if (!canArchive) {
    return null
  }

  return (
    <form className={compact ? "inline-action-form" : "form-shell"} action={action}>
      <input type="hidden" name="sourceId" value={sourceId} />
      <button className="avatarkit-button avatarkit-button-secondary" type="submit" disabled={pending}>
        {pending ? "Archiving..." : "Archive source"}
      </button>
      <FormStateMessage state={state} />
    </form>
  )
}
