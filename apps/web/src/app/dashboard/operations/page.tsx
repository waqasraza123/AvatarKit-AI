import Link from "next/link"
import { AvatarStatus, RuntimeTraceStatus, SafetySeverity } from "@prisma/client"
import {
  suspendAvatarFromOperationsAction,
  unsuspendAvatarFromOperationsAction
} from "@/app/actions/operations"
import {
  OPERATIONS_PERIODS,
  canAccessOperations,
  canManageOperations,
  fetchOperationsDashboardData,
  parseOperationsFilters,
  type OperationsAvatarItem,
  type OperationsDashboardData,
  type OperationsSafetyItem,
  type OperationsTraceItem,
  type OperationsUsageSpike
} from "@/lib/operations"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

function operationsErrorMessage(error: string | undefined): string | null {
  if (error === "bad_request") {
    return "The operations request was incomplete."
  }

  if (error === "missing_avatar") {
    return "The avatar was not found or is not in the expected state."
  }

  if (error === "permission_denied") {
    return "Only owners and admins can suspend or unsuspend avatars from operations."
  }

  return null
}

function statusClass(status: string): string {
  if (status === RuntimeTraceStatus.FAILURE || status === AvatarStatus.FAILED || status === AvatarStatus.SUSPENDED) {
    return "status-pill status-pill-danger"
  }

  if (status === RuntimeTraceStatus.STARTED || status === AvatarStatus.PROCESSING) {
    return "status-pill status-pill-warning"
  }

  return "status-pill status-pill-muted"
}

function severityClass(severity: SafetySeverity): string {
  if (severity === SafetySeverity.HIGH || severity === SafetySeverity.CRITICAL) {
    return "status-pill status-pill-danger"
  }

  if (severity === SafetySeverity.MEDIUM) {
    return "status-pill status-pill-warning"
  }

  return "status-pill status-pill-muted"
}

function formatSpikeRatio(spike: OperationsUsageSpike): string {
  if (spike.ratio === null) {
    return "New activity"
  }

  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(spike.ratio)}x`
}

function OperationsFilters({ data }: { data: OperationsDashboardData }) {
  return (
    <form className="conversation-filter-form" method="get">
      <div className="operations-filter-row">
        <label>
          Search
          <input name="q" type="search" defaultValue={data.filters.query} placeholder="Workspace avatar, role, use case" />
        </label>
        <label>
          Avatar status
          <select name="avatarStatus" defaultValue={data.filters.avatarStatus}>
            <option value="ALL">All statuses</option>
            <option value={AvatarStatus.DRAFT}>Draft</option>
            <option value={AvatarStatus.PROCESSING}>Processing</option>
            <option value={AvatarStatus.READY}>Ready</option>
            <option value={AvatarStatus.PUBLISHED}>Published</option>
            <option value={AvatarStatus.SUSPENDED}>Suspended</option>
            <option value={AvatarStatus.FAILED}>Failed</option>
          </select>
        </label>
        <label>
          Window
          <select name="period" defaultValue={data.filters.period}>
            {OPERATIONS_PERIODS.map(period => (
              <option key={period} value={period}>{period}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="conversation-filter-actions">
        <button className="avatarkit-button avatarkit-button-primary" type="submit">
          Apply filters
        </button>
        <Link className="avatarkit-button avatarkit-button-secondary" href="/dashboard/operations">
          Reset
        </Link>
      </div>
    </form>
  )
}

function OperationsMetricGrid({ data }: { data: OperationsDashboardData }) {
  return (
    <div className="operations-metric-grid">
      {data.metrics.map(metric => (
        <div className="usage-metric" key={metric.label}>
          <span>{metric.value}</span>
          <p>{metric.label}</p>
          <small>{metric.helper}</small>
        </div>
      ))}
    </div>
  )
}

function AvatarActions({
  avatar,
  canManage
}: {
  avatar: OperationsAvatarItem
  canManage: boolean
}) {
  if (!canManage) {
    return null
  }

  if (avatar.status === AvatarStatus.SUSPENDED) {
    return (
      <form action={unsuspendAvatarFromOperationsAction}>
        <input type="hidden" name="avatarId" value={avatar.id} />
        <input type="hidden" name="returnPath" value="/dashboard/operations" />
        <button className="avatarkit-button avatarkit-button-secondary" type="submit">
          Unsuspend
        </button>
      </form>
    )
  }

  return (
    <form action={suspendAvatarFromOperationsAction}>
      <input type="hidden" name="avatarId" value={avatar.id} />
      <input type="hidden" name="returnPath" value="/dashboard/operations" />
      <button className="avatarkit-button avatarkit-button-secondary" type="submit">
        Suspend
      </button>
    </form>
  )
}

function AvatarOperationsTable({
  avatars,
  canManage
}: {
  avatars: OperationsAvatarItem[]
  canManage: boolean
}) {
  return (
    <section className="content-card">
      <div className="content-card-header">
        <div>
          <p className="eyebrow">Avatar operations</p>
          <h2>Search results</h2>
        </div>
      </div>
      {avatars.length === 0 ? (
        <p className="avatar-empty-state">No avatars match the current operations filters.</p>
      ) : (
        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th>Avatar</th>
                <th>Status</th>
                <th>Failures</th>
                <th>Safety</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {avatars.map(avatar => (
                <tr key={avatar.id}>
                  <td>
                    <strong>{avatar.name}</strong>
                    <p className="avatar-meta">{avatar.displayName}</p>
                    <Link className="secondary-link" href={`/dashboard/avatars/${avatar.id}/studio`}>
                      Open studio
                    </Link>
                  </td>
                  <td><span className={statusClass(avatar.status)}>{avatar.status}</span></td>
                  <td>{avatar.failedTraceCount}</td>
                  <td>{avatar.openSafetyCount} open</td>
                  <td>{avatar.updatedAt}</td>
                  <td><AvatarActions avatar={avatar} canManage={canManage} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function TraceTable({
  title,
  eyebrow,
  traces,
  emptyText
}: {
  title: string
  eyebrow: string
  traces: OperationsTraceItem[]
  emptyText: string
}) {
  return (
    <section className="content-card">
      <div className="content-card-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>
      {traces.length === 0 ? (
        <p className="avatar-empty-state">{emptyText}</p>
      ) : (
        <div className="usage-table-wrap">
          <table className="usage-table operations-trace-table">
            <thead>
              <tr>
                <th>Trace</th>
                <th>Status</th>
                <th>Provider</th>
                <th>Avatar</th>
                <th>Duration</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {traces.map(trace => (
                <tr key={trace.id}>
                  <td>
                    <strong>{trace.eventType}</strong>
                    {trace.message ? <p className="avatar-meta">{trace.message}</p> : null}
                    {trace.conversationId ? (
                      <Link className="secondary-link" href={`/dashboard/conversations/${trace.conversationId}`}>
                        Open conversation
                      </Link>
                    ) : null}
                  </td>
                  <td><span className={statusClass(trace.status)}>{trace.status}</span></td>
                  <td>{trace.provider ?? "N/A"}</td>
                  <td>{trace.avatarName ?? "Workspace"}</td>
                  <td>{trace.durationMs === null ? "N/A" : `${trace.durationMs}ms`}</td>
                  <td>{trace.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function SafetyTable({ events }: { events: OperationsSafetyItem[] }) {
  return (
    <section className="content-card">
      <div className="content-card-header">
        <div>
          <p className="eyebrow">Safety operations</p>
          <h2>Recent safety events</h2>
        </div>
        <Link className="avatarkit-link-button" href="/dashboard/safety">
          Open safety
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="avatar-empty-state">No safety events exist in the selected window.</p>
      ) : (
        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Avatar</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <tr key={event.id}>
                  <td>
                    <strong>{event.eventType.replace(/_/g, " ")}</strong>
                    {event.reason ? <p className="avatar-meta">{event.reason}</p> : null}
                    {event.conversationId ? (
                      <Link className="secondary-link" href={`/dashboard/conversations/${event.conversationId}`}>
                        Open conversation
                      </Link>
                    ) : null}
                  </td>
                  <td><span className={severityClass(event.severity)}>{event.severity}</span></td>
                  <td>{event.status}</td>
                  <td>{event.avatarName ?? "Workspace"}</td>
                  <td>{event.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function UsageSpikeList({ spikes }: { spikes: OperationsUsageSpike[] }) {
  return (
    <section className="content-card">
      <div className="content-card-header">
        <div>
          <p className="eyebrow">Usage spikes</p>
          <h2>Current vs previous period</h2>
        </div>
        <Link className="avatarkit-link-button" href="/dashboard/usage">
          Open usage
        </Link>
      </div>
      {spikes.length === 0 ? (
        <p className="avatar-empty-state">No usage spikes were detected for this period.</p>
      ) : (
        <div className="developer-list">
          {spikes.map(spike => (
            <article className="developer-list-card" key={spike.eventType}>
              <div>
                <p className="eyebrow">{formatSpikeRatio(spike)}</p>
                <h3>{spike.eventType}</h3>
                <p className="avatar-meta">Current: {spike.currentQuantity}</p>
                <p className="avatar-meta">Previous: {spike.previousQuantity}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default async function DashboardOperationsPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string
    avatarStatus?: string
    period?: string
    operationsError?: string
    workspaceId?: string
  }>
}) {
  const params = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: params.workspaceId,
    nextPath: "/dashboard/operations"
  })

  if (!context) {
    return null
  }

  if (!canAccessOperations(context.workspaceMembership.role)) {
    return (
      <main className="content-area">
        <section className="content-card">
          <p className="eyebrow">Operations</p>
          <h1>Access restricted</h1>
          <p>Viewer roles cannot access operations data for this workspace.</p>
        </section>
      </main>
    )
  }

  const data = await fetchOperationsDashboardData(
    context.workspace.id,
    parseOperationsFilters(params)
  )
  const canManage = canManageOperations(context.workspaceMembership.role)
  const errorMessage = operationsErrorMessage(params.operationsError)

  return (
    <main className="content-area">
      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Admin operations</p>
            <h1>Observability</h1>
            <p className="hero-copy section-subtitle">
              Inspect runtime failures, provider errors, usage spikes, safety events, and avatar operational state for this workspace.
            </p>
          </div>
          <Link className="avatarkit-link-button" href="/dashboard/conversations">
            Open conversations
          </Link>
        </div>
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
        {!canManage ? <p className="form-helper">Operators can inspect operations data. Only owners and admins can suspend or unsuspend avatars.</p> : null}
        <OperationsFilters data={data} />
        <OperationsMetricGrid data={data} />
      </section>

      <AvatarOperationsTable avatars={data.avatars} canManage={canManage} />
      <TraceTable
        title="Provider errors"
        eyebrow="Provider health"
        traces={data.providerErrors}
        emptyText="No provider failure traces were found in the selected window."
      />
      <TraceTable
        title="Runtime failures"
        eyebrow="Debug traces"
        traces={data.runtimeFailures}
        emptyText="No runtime failures were found in the selected window."
      />
      <TraceTable
        title="Recent runtime traces"
        eyebrow="Trace stream"
        traces={data.recentTraces}
        emptyText="No runtime traces were found in the selected window."
      />
      <SafetyTable events={data.safetyEvents} />
      <UsageSpikeList spikes={data.usageSpikes} />
    </main>
  )
}
