"use server"

import { redirect } from "next/navigation"
import { WorkspaceRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getCurrentUser, generateSafeWorkspaceSlug } from "@/lib/workspace"
import { setActiveWorkspaceId } from "@/lib/session"

export type WorkspaceActionState = {
  status: "idle" | "error" | "success"
  message?: string
}

function parseWorkspaceName(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim()
}

function parseRedirect(value: FormDataEntryValue | null): string {
  const nextPath = String(value ?? "").trim()

  if (!nextPath) {
    return "/dashboard"
  }

  if (!nextPath.startsWith("/")) {
    return "/dashboard"
  }

  if (nextPath.startsWith("//")) {
    return "/dashboard"
  }

  return nextPath
}

export async function createWorkspaceAction(
  _state: WorkspaceActionState,
  formData: FormData
): Promise<WorkspaceActionState> {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/sign-in?next=/onboarding/workspace")
  }

  const workspaceName = parseWorkspaceName(formData.get("workspaceName"))
  if (!workspaceName || workspaceName.length < 2) {
    return { status: "error", message: "Workspace name must be at least 2 characters." }
  }

  const slug = await generateSafeWorkspaceSlug(workspaceName)
  const existing = await prisma.workspace.findFirst({ where: { slug } })
  if (existing) {
    return { status: "error", message: "Could not allocate workspace identifier. Try another name." }
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: workspaceName,
      slug
    }
  })

  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role: WorkspaceRole.OWNER
    }
  })

  await setActiveWorkspaceId(workspace.id)
  redirect("/dashboard")

  return {
    status: "success",
    message: "Workspace created."
  }
}

export async function activateWorkspaceAction(
  _state: WorkspaceActionState,
  formData: FormData
): Promise<WorkspaceActionState> {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/sign-in")
  }

  const workspaceId = String(formData.get("workspaceId") ?? "").trim()
  if (!workspaceId) {
    return { status: "error", message: "Select a workspace first." }
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id
      }
    }
  })

  if (!membership) {
    return { status: "error", message: "You are not a member of that workspace." }
  }

  await setActiveWorkspaceId(workspaceId)
  redirect(parseRedirect(formData.get("next")))

  return {
    status: "success",
    message: "Workspace updated."
  }
}

export async function createOrActivateWorkspaceAction(
  _state: WorkspaceActionState,
  formData: FormData
): Promise<WorkspaceActionState> {
  const action = String(formData.get("nextAction") ?? "").trim()
  if (action === "activate") {
    return activateWorkspaceAction(_state, formData)
  }

  return createWorkspaceAction(_state, formData)
}

