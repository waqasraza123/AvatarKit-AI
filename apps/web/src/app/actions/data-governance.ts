"use server"

import { revalidatePath } from "next/cache"
import { WorkspaceRole } from "@prisma/client"
import { recordMutationAuditEvent } from "@/lib/audit"
import {
  cancelWorkspaceDeletionRequest,
  createWorkspaceDataExport,
  createWorkspaceDeletionRequest
} from "@/lib/data-governance"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"

export type DataGovernanceActionState = {
  status: "idle" | "error" | "success"
  message?: string
  exportId?: string
  deletionRequestId?: string
  fieldErrors?: Record<string, string>
}

function actionError(message: string, fieldErrors?: Record<string, string>): DataGovernanceActionState {
  return {
    status: "error",
    message,
    fieldErrors
  }
}

function canExportWorkspaceData(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.ADMIN)
}

function canRequestWorkspaceDeletion(role: WorkspaceRole): boolean {
  return role === WorkspaceRole.OWNER
}

function normalizeText(value: FormDataEntryValue | null, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength)
}

export async function requestWorkspaceDataExportAction(
  _state: DataGovernanceActionState,
  _formData: FormData
): Promise<DataGovernanceActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/settings/data" })
  if (!context) {
    return actionError("Authentication is required.")
  }

  if (!canExportWorkspaceData(context.workspaceMembership.role)) {
    return actionError("Only workspace owners and admins can export workspace data.")
  }

  const exportId = await createWorkspaceDataExport({
    workspaceId: context.workspace.id,
    requestedByUserId: context.user.id
  })

  await recordMutationAuditEvent({
    workspaceId: context.workspace.id,
    actorUserId: context.user.id,
    eventType: "data_export.created",
    metadata: {
      dataExportId: exportId,
      workspaceId: context.workspace.id
    }
  })

  revalidatePath("/dashboard/settings/data")
  return {
    status: "success",
    message: "Workspace export is ready to download.",
    exportId
  }
}

export async function requestWorkspaceDeletionAction(
  _state: DataGovernanceActionState,
  formData: FormData
): Promise<DataGovernanceActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/settings/data" })
  if (!context) {
    return actionError("Authentication is required.")
  }

  if (!canRequestWorkspaceDeletion(context.workspaceMembership.role)) {
    return actionError("Only the workspace owner can request workspace deletion.")
  }

  const confirmation = normalizeText(formData.get("confirmation"), 120)
  const reason = normalizeText(formData.get("reason"), 500) || null
  const fieldErrors: Record<string, string> = {}

  if (confirmation !== context.workspace.slug) {
    fieldErrors.confirmation = `Type ${context.workspace.slug} to confirm this request.`
  }

  if (Object.keys(fieldErrors).length > 0) {
    return actionError("Please confirm the workspace slug before requesting deletion.", fieldErrors)
  }

  const deletionRequestId = await createWorkspaceDeletionRequest({
    workspaceId: context.workspace.id,
    requestedByUserId: context.user.id,
    reason
  })

  await recordMutationAuditEvent({
    workspaceId: context.workspace.id,
    actorUserId: context.user.id,
    eventType: "workspace_deletion.requested",
    metadata: {
      deletionRequestId,
      workspaceId: context.workspace.id,
      reason
    }
  })

  revalidatePath("/dashboard/settings/data")
  return {
    status: "success",
    message: "Workspace deletion request recorded. Deletion is not executed automatically.",
    deletionRequestId
  }
}

export async function cancelWorkspaceDeletionRequestAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/settings/data" })
  if (!context || !canRequestWorkspaceDeletion(context.workspaceMembership.role)) {
    return
  }

  const deletionRequestId = normalizeText(formData.get("deletionRequestId"), 120)
  if (!deletionRequestId) {
    return
  }

  const canceled = await cancelWorkspaceDeletionRequest({
    workspaceId: context.workspace.id,
    deletionRequestId,
    canceledByUserId: context.user.id
  })

  if (canceled) {
    await recordMutationAuditEvent({
      workspaceId: context.workspace.id,
      actorUserId: context.user.id,
      eventType: "workspace_deletion.canceled",
      metadata: {
        deletionRequestId,
        workspaceId: context.workspace.id
      }
    })
  }

  revalidatePath("/dashboard/settings/data")
}

