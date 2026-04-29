"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { LeadStatus } from "@prisma/client"
import { recordMutationAuditEvent } from "@/lib/audit"
import { canManageLead } from "@/lib/lead"
import { prisma } from "@/lib/prisma"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

type LeadStatusActionError = "bad_request" | "missing_lead" | "permission_denied"

function appendStatusError(path: string, error: LeadStatusActionError): string {
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}statusError=${encodeURIComponent(error)}`
}

function safeReturnPath(rawPath: string | null): string {
  const path = rawPath?.trim() ?? "/dashboard/leads"
  if (!path.startsWith("/")) {
    return "/dashboard/leads"
  }

  if (path.startsWith("//")) {
    return "/dashboard/leads"
  }

  if (!path.startsWith("/dashboard/leads") && !path.startsWith("/dashboard/conversations")) {
    return "/dashboard/leads"
  }

  return path
}

function parseLeadStatus(value: string): LeadStatus | null {
  if (
    value === LeadStatus.NEW ||
    value === LeadStatus.CONTACTED ||
    value === LeadStatus.QUALIFIED ||
    value === LeadStatus.CLOSED ||
    value === LeadStatus.SPAM
  ) {
    return value
  }

  return null
}

export async function updateLeadStatusAction(formData: FormData): Promise<void> {
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "/dashboard/leads"))
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/leads" })
  if (!context) {
    redirect("/sign-in")
  }

  const leadId = String(formData.get("leadId") ?? "").trim()
  const targetStatus = parseLeadStatus(String(formData.get("targetStatus") ?? "").trim())

  if (!leadId || !targetStatus) {
    redirect(appendStatusError(returnPath, "bad_request"))
  }

  if (!canManageLead(context.workspaceMembership.role)) {
    redirect(appendStatusError(returnPath, "permission_denied"))
  }

  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      workspaceId: context.workspace.id
    },
    select: {
      id: true,
      conversationId: true
    }
  })

  if (!lead) {
    redirect(appendStatusError(returnPath, "missing_lead"))
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: targetStatus }
  })

  await recordMutationAuditEvent({
    workspaceId: context.workspace.id,
    actorUserId: context.user.id,
    conversationId: lead.conversationId,
    eventType: "lead.status_updated",
    metadata: {
      leadId: lead.id,
      targetStatus
    }
  })

  revalidatePath("/dashboard/leads")
  revalidatePath(`/dashboard/leads/${lead.id}`)
  revalidatePath(`/dashboard/conversations/${lead.conversationId}`)
  redirect(returnPath)
}
