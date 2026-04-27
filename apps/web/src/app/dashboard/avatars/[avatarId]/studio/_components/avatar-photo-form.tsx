"use client"

import { AvatarStatus } from "@prisma/client"
import { useActionState, useState } from "react"
import {
  AvatarAssetValidationStatus,
  AvatarRecord,
  getCurrentSourcePhoto
} from "@/lib/avatar"
import { removeAvatarPhotoAction, uploadAvatarPhotoAction } from "@/app/actions/avatars"

type AvatarPhotoActionState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: {
    avatarId?: string
    photoFile?: string
  }
}

const photoFormInitialState: AvatarPhotoActionState = { status: "idle" }

function canEditPhotoByStatus(status: AvatarStatus): boolean {
  return status === AvatarStatus.DRAFT || status === AvatarStatus.READY || status === AvatarStatus.FAILED
}

function isPhotoComplete(assetStatus: AvatarAssetValidationStatus | undefined): boolean {
  return assetStatus === AvatarAssetValidationStatus.VALID
}

export default function AvatarPhotoForm({
  avatar,
  canEdit
}: {
  avatar: Pick<AvatarRecord, "id" | "status" | "photoAssets">
  canEdit: boolean
}) {
  const [state, uploadAction, pendingUpload] = useActionState(uploadAvatarPhotoAction, photoFormInitialState)
  const [removeState, removeAction, pendingRemove] = useActionState(removeAvatarPhotoAction, photoFormInitialState)
  const [selectedFileName, setSelectedFileName] = useState("")
  const currentPhoto = getCurrentSourcePhoto(avatar)
  const uploadActionMessage = state.message
  const removeActionMessage = removeState.message

  if (!canEdit) {
    return (
      <section className="avatar-step-panel">
        <h3>Photo</h3>
        <p>Read only: Viewer role cannot modify photo assets.</p>
        <div className="avatar-photo-preview-wrap">
          {currentPhoto ? (
            <img
              alt="Avatar source photo preview"
              className="avatar-photo-preview"
              src={currentPhoto.displayUrl}
            />
          ) : (
            <div className="avatar-photo-placeholder">No photo uploaded</div>
          )}
        </div>
        <p className="avatar-photo-status">
          {isPhotoComplete(currentPhoto?.validationStatus) ? "Photo added" : "Photo needed"}
        </p>
      </section>
    )
  }

  if (!canEditPhotoByStatus(avatar.status)) {
    return (
      <section className="avatar-step-panel">
        <h3>Photo</h3>
        <p>
          Photos cannot be changed while this avatar is in its current status.
          Switch to draft, ready, or failed state in a future phase.
        </p>
      </section>
    )
  }

  return (
    <section className="avatar-step-panel">
      <h3>Photo</h3>
      <p className="avatar-step-description">
        Upload a clear source photo to unlock the next setup steps. Replacing or removing the photo
        means consent must be accepted again for the new current image.
      </p>
      <div className="avatar-photo-preview-wrap">
        {currentPhoto ? (
          <img
            alt="Current source photo"
            className="avatar-photo-preview"
            src={currentPhoto.displayUrl}
          />
        ) : (
          <div className="avatar-photo-placeholder">Upload a photo to continue</div>
        )}
      </div>
      <p className="avatar-photo-status">
        {isPhotoComplete(currentPhoto?.validationStatus) ? "Photo added" : "Photo needed"}
      </p>
      <form className="avatar-photo-form" action={uploadAction}>
        <input type="hidden" name="avatarId" value={avatar.id} />
        <label htmlFor={`avatar-photo-upload-${avatar.id}`} className="avatar-upload-dropzone">
          <span>Drag and drop your file here or browse</span>
          <input
            className="avatar-upload-input"
            accept="image/jpeg,image/png,image/webp"
            id={`avatar-photo-upload-${avatar.id}`}
            name="photo"
            type="file"
            onChange={event => setSelectedFileName(event.currentTarget.files?.[0]?.name ?? "")}
          />
        </label>
        {selectedFileName ? <p className="avatar-photo-file-name">Selected: {selectedFileName}</p> : null}
        {state.fieldErrors?.photoFile ? <p className="form-error">{state.fieldErrors.photoFile}</p> : null}
        {state.status === "error" && uploadActionMessage ? (
          <p className="form-error">{uploadActionMessage}</p>
        ) : null}
        {state.status === "success" && uploadActionMessage ? (
          <p className="form-success">{uploadActionMessage}</p>
        ) : null}
        <button className="avatarkit-button avatarkit-button-primary" type="submit" disabled={pendingUpload}>
          {pendingUpload ? "Uploading..." : "Upload photo"}
        </button>
      </form>
      <form className="avatar-photo-form" action={removeAction}>
        <input type="hidden" name="avatarId" value={avatar.id} />
        <button
          className="avatarkit-button avatarkit-button-secondary"
          type="submit"
          disabled={pendingRemove || !currentPhoto}
        >
          {pendingRemove ? "Removing..." : "Remove photo"}
        </button>
        {removeState.fieldErrors?.avatarId ? <p className="form-error">{removeState.fieldErrors.avatarId}</p> : null}
        {removeState.status === "error" && removeActionMessage ? (
          <p className="form-error">{removeActionMessage}</p>
        ) : null}
        {removeState.status === "success" && removeActionMessage ? (
          <p className="form-success">{removeActionMessage}</p>
        ) : null}
      </form>
      <div className="avatar-photo-guidance">
        <h4>Photo guidance</h4>
        <ul>
          <li>Use a clear front-facing photo.</li>
          <li>Use good lighting and avoid harsh shadows.</li>
          <li>Keep the face centered in the frame.</li>
          <li>Avoid sunglasses or heavy obstruction.</li>
          <li>Use a high-resolution image.</li>
          <li>Only upload a photo you are authorized to use.</li>
          <li>Consent is tied to the current source photo and must be re-accepted after replacement.</li>
          <li>Advanced quality checks are coming in a later phase.</li>
        </ul>
      </div>
    </section>
  )
}
