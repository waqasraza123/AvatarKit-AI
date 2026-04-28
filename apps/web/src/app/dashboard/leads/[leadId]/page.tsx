import Link from "next/link"
import { redirect } from "next/navigation"
import { LeadStatus } from "@prisma/client"
import { updateLeadStatusAction } from "@/app/actions/leads"
import {
  LEAD_STATUS_FILTERS,
  canManageLead,
  fetchLeadDetail,
  leadSourceLabel,
  leadStatusLabel
} from "@/lib/lead"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

type PageParams = Promise<{ leadId: string }>
type SearchParams = Promise<{ workspaceId?: string; statusError?: string }>

function mapStatusMessage(error: string | undefined): string | null {
  if (error === "bad_request") {
    return "Could not process the lead update request."
  }

  if (error === "missing_lead") {
    return "The lead was not found in this workspace."
  }

  if (error === "permission_denied") {
    return "You do not have permission to update lead status."
  }

  return null
}

function statusClass(status: LeadStatus): string {
  if (status === LeadStatus.NEW) {
    return "status-pill lead-status-new"
  }

  if (status === LeadStatus.SPAM) {
    return "status-pill status-pill-danger"
  }

  if (status === LeadStatus.CLOSED || status === LeadStatus.QUALIFIED) {
    return "status-pill lead-status-qualified"
  }

  return "status-pill status-pill-muted"
}

function LeadStatusActions({
  leadId,
  currentStatus,
  canManage
}: {
  leadId: string
  currentStatus: LeadStatus
  canManage: boolean
}) {
  if (!canManage) {
    return null
  }

  return (
    <div className="conversation-row-actions">
      {LEAD_STATUS_FILTERS.filter(status => status !== currentStatus).map(status => (
        <form action={updateLeadStatusAction} key={status}>
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="targetStatus" value={status} />
          <input type="hidden" name="returnPath" value={`/dashboard/leads/${leadId}`} />
          <button className="avatarkit-button avatarkit-button-secondary" type="submit">
            Mark {leadStatusLabel(status).toLowerCase()}
          </button>
        </form>
      ))}
    </div>
  )
}

export default async function LeadDetailPage({
  params,
  searchParams
}: {
  params: PageParams
  searchParams: SearchParams
}) {
  const [{ leadId }, { workspaceId, statusError }] = await Promise.all([params, searchParams])
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: `/dashboard/leads/${leadId}`
  })

  if (!context) {
    return null
  }

  const lead = await fetchLeadDetail(context.workspace.id, leadId)
  if (!lead) {
    redirect("/dashboard/leads")
  }

  const canManage = canManageLead(context.workspaceMembership.role)
  const statusErrorMessage = mapStatusMessage(statusError)

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Lead detail</p>
        <h1>{lead.name || "Anonymous visitor"}</h1>
        <p className="avatar-meta">
          {leadSourceLabel(lead.source)} · {lead.avatarName ?? "Unknown avatar"} · Created {lead.createdAt}
        </p>
        <div className="conversation-metrics">
          <span className={statusClass(lead.status)}>{leadStatusLabel(lead.status)}</span>
          <span>Updated {lead.updatedAt}</span>
        </div>
        <div className="conversation-detail-actions">
          <Link className="avatarkit-link-button" href="/dashboard/leads">
            Back to leads
          </Link>
          <Link className="avatarkit-link-button" href={`/dashboard/conversations/${lead.conversationId}`}>
            Source conversation
          </Link>
        </div>
        <LeadStatusActions
          leadId={lead.id}
          currentStatus={lead.status}
          canManage={canManage}
        />
        {statusErrorMessage ? <p className="form-error">{statusErrorMessage}</p> : null}
      </section>

      <section className="content-card">
        <h2>Contact fields</h2>
        <div className="lead-detail-grid">
          <div>
            <span>Name</span>
            <strong>{lead.name || "Not provided"}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{lead.email || "Not provided"}</strong>
          </div>
          <div>
            <span>Phone</span>
            <strong>{lead.phone || "Not provided"}</strong>
          </div>
          <div>
            <span>Source</span>
            <strong>{leadSourceLabel(lead.source)}</strong>
          </div>
        </div>
      </section>

      <section className="content-card">
        <h2>Message</h2>
        <p className="conversation-preview-text">
          {lead.message || "No message was submitted with this lead."}
        </p>
      </section>

      <section className="content-card">
        <h2>Source conversation</h2>
        <div className="conversation-metrics">
          <span>{lead.conversationMessageCount} messages</span>
          <span>Lead is linked to session {lead.conversationId.slice(0, 8)}</span>
        </div>
        <p className="conversation-preview-text">
          {lead.conversationLatestPreview ?? "No transcript preview is available."}
        </p>
        <Link className="avatarkit-link-button" href={`/dashboard/conversations/${lead.conversationId}`}>
          Open transcript
        </Link>
      </section>
    </main>
  )
}
