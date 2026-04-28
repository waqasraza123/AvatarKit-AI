import Link from "next/link"
import { SafetyEventStatus } from "@prisma/client"
import {
  suspendAvatarFromSafetyAction,
  updateSafetyEventStatusAction
} from "@/app/actions/safety"
import { getWorkspaceContextForRequest } from "@/lib/workspace"
import {
  SAFETY_EVENT_TYPES,
  SAFETY_SEVERITIES,
  SAFETY_SOURCES,
  SAFETY_STATUSES,
  canReviewSafetyEvents,
  canSuspendAvatarFromSafety,
  fetchSafetyDashboardData,
  parseSafetyFilters,
  safetyLabel,
  type SafetyDashboardData,
  type SafetyEventListItem
} from "@/lib/safety"

function mapSafetyError(error: string | undefined): string | null {
  if (error === "bad_request") {
    return "Could not process the safety review request."
  }

  if (error === "missing_event") {
    return "The safety event was not found in this workspace."
  }

  if (error === "missing_avatar") {
    return "The avatar was not found in this workspace."
  }

  if (error === "permission_denied") {
    return "You do not have permission to update safety events."
  }

  return null
}

function severityClass(severity: string): string {
  if (severity === "CRITICAL" || severity === "HIGH") {
    return "status-pill status-pill-danger"
  }

  if (severity === "MEDIUM") {
    return "status-pill status-pill-warning"
  }

  return "status-pill status-pill-muted"
}

function SafetyFilters({ data }: { data: SafetyDashboardData }) {
  return (
    <form className="conversation-filter-form" method="get">
      <div className="safety-filter-row">
        <label>
          Avatar
          <select name="avatarId" defaultValue={data.filters.avatarId ?? ""}>
            <option value="">All avatars</option>
            {data.avatarOptions.map(avatar => (
              <option key={avatar.id} value={avatar.id}>
                {avatar.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Event type
          <select name="eventType" defaultValue={data.filters.eventType}>
            <option value="ALL">All event types</option>
            {SAFETY_EVENT_TYPES.map(eventType => (
              <option key={eventType} value={eventType}>
                {safetyLabel(eventType)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Severity
          <select name="severity" defaultValue={data.filters.severity}>
            <option value="ALL">All severities</option>
            {SAFETY_SEVERITIES.map(severity => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={data.filters.status}>
            <option value="ALL">All statuses</option>
            {SAFETY_STATUSES.map(status => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select name="source" defaultValue={data.filters.source}>
            <option value="ALL">All sources</option>
            {SAFETY_SOURCES.map(source => (
              <option key={source} value={source}>
                {safetyLabel(source)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="conversation-filter-actions">
        <button className="avatarkit-button avatarkit-button-primary" type="submit">
          Apply filters
        </button>
        <Link className="avatarkit-button avatarkit-button-secondary" href="/dashboard/safety">
          Reset
        </Link>
      </div>
    </form>
  )
}

function SafetyReviewActions({
  event,
  canReview
}: {
  event: SafetyEventListItem
  canReview: boolean
}) {
  if (!canReview) {
    return null
  }

  const reviewStatuses = [
    SafetyEventStatus.REVIEWED,
    SafetyEventStatus.RESOLVED,
    SafetyEventStatus.DISMISSED
  ].filter(status => status !== event.status)

  return (
    <div className="conversation-row-actions">
      {reviewStatuses.map(status => (
        <form action={updateSafetyEventStatusAction} key={`${event.id}-${status}`}>
          <input type="hidden" name="safetyEventId" value={event.id} />
          <input type="hidden" name="targetStatus" value={status} />
          <input type="hidden" name="returnPath" value="/dashboard/safety" />
          <button className="avatarkit-button avatarkit-button-secondary" type="submit">
            Mark {safetyLabel(status).toLowerCase()}
          </button>
        </form>
      ))}
    </div>
  )
}

function SafetyEmptyState() {
  return (
    <section className="content-card usage-empty-state">
      <p className="eyebrow">Safety events</p>
      <h2>No safety events yet.</h2>
      <p>
        Safety events help you review risky interactions and keep the avatar within approved business boundaries.
      </p>
      <p>
        AvatarKit blocks or rewrites unsafe responses when detected. This is not legal compliance automation.
      </p>
    </section>
  )
}

function SafetyEventsTable({
  events,
  canReview,
  canSuspend
}: {
  events: SafetyEventListItem[]
  canReview: boolean
  canSuspend: boolean
}) {
  if (events.length === 0) {
    return <SafetyEmptyState />
  }

  return (
    <section className="content-card">
      <div className="content-card-header">
        <div>
          <p className="eyebrow">Event review</p>
          <h2>Safety events</h2>
        </div>
        <p className="avatar-meta">Showing {events.length} event(s)</p>
      </div>
      <div className="usage-table-wrap">
        <table className="usage-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Severity</th>
              <th>Source</th>
              <th>Avatar</th>
              <th>Status</th>
              <th>Action</th>
              <th>Created</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {events.map(event => (
              <tr key={event.id}>
                <td>
                  <strong>{safetyLabel(event.eventType)}</strong>
                  {event.reason ? <p className="avatar-meta">{event.reason}</p> : null}
                  {event.conversationId ? (
                    <Link className="secondary-link" href={`/dashboard/conversations/${event.conversationId}`}>
                      Open conversation
                    </Link>
                  ) : null}
                </td>
                <td><span className={severityClass(event.severity)}>{event.severity}</span></td>
                <td>{safetyLabel(event.source)}</td>
                <td>{event.avatarName ?? "Workspace"}</td>
                <td>{event.status}</td>
                <td>{event.action}</td>
                <td>{event.createdAt}</td>
                <td>
                  <SafetyReviewActions event={event} canReview={canReview} />
                  {canSuspend && event.avatarId ? (
                    <form action={suspendAvatarFromSafetyAction} className="safety-inline-form">
                      <input type="hidden" name="avatarId" value={event.avatarId} />
                      <input type="hidden" name="returnPath" value="/dashboard/safety" />
                      <input type="hidden" name="reason" value={`Manual suspension from safety event ${event.id}`} />
                      <button className="avatarkit-button avatarkit-button-secondary" type="submit">
                        Suspend avatar
                      </button>
                    </form>
                  ) : null}
                  {event.reviewedAt ? (
                    <p className="avatar-meta">Reviewed {event.reviewedAt}{event.reviewedByName ? ` by ${event.reviewedByName}` : ""}</p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default async function DashboardSafetyPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string; avatarId?: string; eventType?: string; severity?: string; status?: string; source?: string; safetyError?: string }>
}) {
  const { workspaceId, avatarId, eventType, severity, status, source, safetyError } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/safety"
  })

  if (!context) {
    return null
  }

  const data = await fetchSafetyDashboardData(
    context.workspace.id,
    parseSafetyFilters({ avatarId, eventType, severity, status, source })
  )
  const canReview = canReviewSafetyEvents(context.workspaceMembership.role)
  const canSuspend = canSuspendAvatarFromSafety(context.workspaceMembership.role)
  const safetyErrorMessage = mapSafetyError(safetyError)

  return (
    <main className="content-area">
      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Safety</p>
            <h1>Safety Events</h1>
            <p className="hero-copy section-subtitle">
              Safety events help you review risky interactions and keep the avatar within approved business boundaries.
            </p>
            <p className="form-helper">
              AvatarKit blocks or rewrites unsafe responses when detected. This is not legal compliance automation.
            </p>
          </div>
        </div>
        <SafetyFilters data={data} />
        {safetyErrorMessage ? <p className="form-error">{safetyErrorMessage}</p> : null}
        {!canReview ? <p className="form-helper">Viewer roles can view safety events but cannot update review status or suspend avatars.</p> : null}
      </section>
      <SafetyEventsTable
        events={data.events}
        canReview={canReview}
        canSuspend={canSuspend}
      />
    </main>
  )
}
