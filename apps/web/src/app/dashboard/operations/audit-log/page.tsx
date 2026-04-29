import Link from "next/link"
import { AuditLogActorType, AuditLogTargetType, WorkspaceRole } from "@prisma/client"
import { listAuditLogs, type AuditLogListItem } from "@/lib/audit"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"

type SearchParams = Promise<{
  action?: string
  actorType?: string
  targetType?: string
  recent?: "24h" | "7d" | "30d" | "all"
  workspaceId?: string
}>

function canViewWorkspaceAuditLog(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.ADMIN)
}

function AuditFilters({ searchParams }: { searchParams: Awaited<SearchParams> }) {
  return (
    <form className="conversation-filter-form" method="get">
      <div className="operations-filter-row">
        <label>
          Action
          <input name="action" type="search" defaultValue={searchParams.action ?? ""} placeholder="avatar.published" />
        </label>
        <label>
          Actor type
          <select name="actorType" defaultValue={searchParams.actorType ?? ""}>
            <option value="">All actors</option>
            {Object.values(AuditLogActorType).map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Target type
          <select name="targetType" defaultValue={searchParams.targetType ?? ""}>
            <option value="">All targets</option>
            {Object.values(AuditLogTargetType).map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Recent
          <select name="recent" defaultValue={searchParams.recent ?? "7d"}>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>
      <div className="conversation-filter-actions">
        <button className="avatarkit-button avatarkit-button-primary" type="submit">
          Apply filters
        </button>
        <Link className="avatarkit-button avatarkit-button-secondary" href="/dashboard/operations/audit-log">
          Reset
        </Link>
      </div>
    </form>
  )
}

function AuditTable({ rows }: { rows: AuditLogListItem[] }) {
  if (rows.length === 0) {
    return <p className="avatar-empty-state">No audit events match these filters.</p>
  }

  return (
    <div className="usage-table-wrap">
      <table className="usage-table">
        <thead>
          <tr>
            <th>Created</th>
            <th>Action</th>
            <th>Actor</th>
            <th>Target</th>
            <th>Metadata</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>{row.createdAt}</td>
              <td><strong>{row.action}</strong></td>
              <td>
                <span className="status-pill status-pill-muted">{row.actorType}</span>
                <p className="avatar-meta">{row.actorEmail ?? row.actorUserId ?? "No user"}</p>
              </td>
              <td>
                <strong>{row.targetType}</strong>
                <p className="avatar-meta">{row.targetId ?? "No target id"}</p>
              </td>
              <td>{row.metadataSummary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function WorkspaceAuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: params.workspaceId,
    nextPath: "/dashboard/operations/audit-log"
  })

  if (!context) {
    return null
  }

  if (!canViewWorkspaceAuditLog(context.workspaceMembership.role)) {
    return (
      <main className="content-area">
        <section className="content-card">
          <p className="eyebrow">Audit log</p>
          <h1>Access restricted</h1>
          <p>Only workspace owners and admins can view workspace audit logs.</p>
        </section>
      </main>
    )
  }

  const rows = await listAuditLogs({
    workspaceId: context.workspace.id,
    action: params.action,
    actorType: params.actorType,
    targetType: params.targetType,
    recent: params.recent ?? "7d"
  })

  return (
    <main className="content-area">
      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Operations</p>
            <h1>Workspace audit log</h1>
            <p className="hero-copy section-subtitle">
              Review sanitized audit events for {context.workspace.name}.
            </p>
          </div>
          <Link className="avatarkit-link-button" href="/dashboard/operations">
            Operations
          </Link>
        </div>
        <AuditFilters searchParams={params} />
        <AuditTable rows={rows} />
      </section>
    </main>
  )
}
