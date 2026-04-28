import Link from "next/link"
import { LeadStatus } from "@prisma/client"
import { updateLeadStatusAction } from "@/app/actions/leads"
import {
  LEAD_RECENT_PRESETS,
  LEAD_SOURCE_FILTERS,
  LEAD_STATUS_FILTERS,
  canManageLead,
  fetchLeadAvatarFilters,
  fetchLeadList,
  leadSourceLabel,
  leadStatusLabel,
  parseLeadListSearchFilters,
  type LeadListFilters,
  type LeadListItem
} from "@/lib/lead"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

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

function hasLeadFilters(filters: LeadListFilters): boolean {
  return Boolean(
    filters.avatarId ||
      filters.status !== "ALL" ||
      filters.source !== "ALL" ||
      filters.search ||
      filters.recent !== "all"
  )
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
  lead,
  canManage,
  returnPath
}: {
  lead: LeadListItem
  canManage: boolean
  returnPath: string
}) {
  if (!canManage) {
    return null
  }

  const targets = LEAD_STATUS_FILTERS.filter(status => status !== lead.status)

  return (
    <div className="conversation-row-actions">
      {targets.map(status => (
        <form action={updateLeadStatusAction} key={status}>
          <input type="hidden" name="leadId" value={lead.id} />
          <input type="hidden" name="targetStatus" value={status} />
          <input type="hidden" name="returnPath" value={returnPath} />
          <button className="avatarkit-button avatarkit-button-secondary" type="submit">
            Mark {leadStatusLabel(status).toLowerCase()}
          </button>
        </form>
      ))}
    </div>
  )
}

function LeadFilters({
  currentFilters,
  avatarOptions
}: {
  currentFilters: LeadListFilters
  avatarOptions: { id: string; name: string }[]
}) {
  return (
    <form className="conversation-filter-form" method="get">
      <div className="conversation-filter-row">
        <label>
          Avatar
          <select name="avatarId" defaultValue={currentFilters.avatarId ?? ""}>
            <option value="">All avatars</option>
            {avatarOptions.map(avatar => (
              <option value={avatar.id} key={avatar.id}>
                {avatar.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={currentFilters.status}>
            <option value="ALL">All statuses</option>
            {LEAD_STATUS_FILTERS.map(status => (
              <option value={status} key={status}>
                {leadStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select name="source" defaultValue={currentFilters.source}>
            <option value="ALL">All sources</option>
            {LEAD_SOURCE_FILTERS.map(source => (
              <option value={source} key={source}>
                {leadSourceLabel(source)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Recent
          <select name="recent" defaultValue={currentFilters.recent}>
            <option value="all">All time</option>
            {LEAD_RECENT_PRESETS.slice(1).map(window => (
              <option value={window} key={window}>
                Last {window}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            type="text"
            name="q"
            defaultValue={currentFilters.search ?? ""}
            placeholder="Name, email, phone, message"
            maxLength={200}
          />
        </label>
      </div>
      <div className="conversation-filter-actions">
        <button className="avatarkit-button avatarkit-button-primary" type="submit">
          Apply filters
        </button>
        <Link className="avatarkit-button avatarkit-button-secondary" href="/dashboard/leads">
          Reset
        </Link>
      </div>
    </form>
  )
}

function LeadEmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <section className="conversation-empty-state">
      <h2>No leads yet</h2>
      <p>
        Leads will appear when visitors submit contact details through the widget. Future channels can use the same lead model without CRM sync or notification behavior in this phase.
      </p>
      <div className="avatar-card-actions">
        <Link className="avatarkit-link-button" href="/dashboard/embed">
          Open embed settings
        </Link>
        <Link className="avatarkit-link-button" href="/dashboard/conversations">
          Review conversations
        </Link>
      </div>
      {hasFilters ? <p className="form-helper">Try clearing filters to show all captured leads.</p> : null}
    </section>
  )
}

function LeadList({
  leads,
  canManage
}: {
  leads: LeadListItem[]
  canManage: boolean
}) {
  return (
    <div className="conversation-list">
      {leads.map(lead => (
        <article className="conversation-row" key={lead.id}>
          <div className="conversation-row-main">
            <div>
              <p className="eyebrow">Lead {lead.id.slice(0, 8)}</p>
              <h3>{lead.name || "Anonymous visitor"}</h3>
              <p className="avatar-meta">
                {lead.email || "No email"} · {lead.phone || "No phone"}
              </p>
            </div>
            <div className="conversation-row-meta">
              <span className={statusClass(lead.status)}>{leadStatusLabel(lead.status)}</span>
              <span>{leadSourceLabel(lead.source)}</span>
              <span>{lead.createdAt}</span>
            </div>
          </div>
          <p className="conversation-preview-text">
            {lead.messagePreview ?? "No lead message provided."}
          </p>
          <div className="conversation-metrics">
            <span>Avatar: {lead.avatarName ?? "Unknown avatar"}</span>
            <span>Updated {lead.updatedAt}</span>
          </div>
          <div className="conversation-row-links">
            <Link className="avatarkit-link-button" href={`/dashboard/leads/${lead.id}`}>
              Open lead
            </Link>
            <Link className="avatarkit-link-button" href={`/dashboard/conversations/${lead.conversationId}`}>
              Source conversation
            </Link>
          </div>
          <LeadStatusActions
            lead={lead}
            canManage={canManage}
            returnPath="/dashboard/leads"
          />
        </article>
      ))}
    </div>
  )
}

export default async function DashboardLeadsPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string; avatarId?: string; status?: string; source?: string; q?: string; recent?: string; statusError?: string }>
}) {
  const { workspaceId, avatarId, status, source, q, recent, statusError } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/leads"
  })

  if (!context) {
    return null
  }

  const filters = parseLeadListSearchFilters({ avatarId, status, source, q, recent })
  const hasFilters = hasLeadFilters(filters)
  const [avatarOptions, leads] = await Promise.all([
    fetchLeadAvatarFilters(context.workspace.id),
    fetchLeadList(context.workspace.id, filters)
  ])
  const canManage = canManageLead(context.workspaceMembership.role)
  const statusErrorMessage = mapStatusMessage(statusError)

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Leads</p>
        <h1>Lead Dashboard</h1>
        <p className="hero-copy section-subtitle">
          Review contact details submitted through AvatarKit widget conversations and update simple lead status.
        </p>
        <p className="form-helper">
          Phase 13 stores one primary lead per conversation. Duplicate widget submissions update that lead.
        </p>
        <LeadFilters currentFilters={filters} avatarOptions={avatarOptions} />
        {statusErrorMessage ? <p className="form-error">{statusErrorMessage}</p> : null}
      </section>
      <section className="content-card">
        <div className="content-card-header">
          <h2>Lead list</h2>
          <p className="avatar-meta">
            Showing {leads.length} lead(s)
            {hasFilters ? " with current filters" : ""}
          </p>
        </div>
        {leads.length === 0 ? <LeadEmptyState hasFilters={hasFilters} /> : <LeadList leads={leads} canManage={canManage} />}
      </section>
    </main>
  )
}
