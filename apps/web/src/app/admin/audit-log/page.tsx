import Link from "next/link"
import { AuditLogActorType, AuditLogTargetType } from "@prisma/client"
import { listAuditLogs, type AuditLogListItem } from "@/lib/audit"
import { requirePlatformAdmin } from "@/lib/platform-admin"
import { prisma } from "@/lib/prisma"

type SearchParams = Promise<{
  action?: string
  actorType?: string
  targetType?: string
  workspaceId?: string
  recent?: "24h" | "7d" | "30d" | "all"
}>

function AuditFilters({
  searchParams,
  workspaces
}: {
  searchParams: Awaited<SearchParams>
  workspaces: { id: string; name: string }[]
}) {
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
          Workspace
          <select name="workspaceId" defaultValue={searchParams.workspaceId ?? ""}>
            <option value="">All workspaces</option>
            {workspaces.map(workspace => (
              <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
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
        <Link className="avatarkit-button avatarkit-button-secondary" href="/admin/audit-log">
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
            <th>Workspace</th>
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
              <td>{row.workspaceName ?? row.workspaceId ?? "Platform"}</td>
              <td>{row.metadataSummary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function PlatformAuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePlatformAdmin("/admin/audit-log")
  const params = await searchParams
  const [workspaces, rows] = await Promise.all([
    prisma.workspace.findMany({
      orderBy: { name: "asc" },
      take: 100,
      select: { id: true, name: true }
    }),
    listAuditLogs({
      workspaceId: params.workspaceId || undefined,
      action: params.action,
      actorType: params.actorType,
      targetType: params.targetType,
      recent: params.recent ?? "7d"
    })
  ])

  return (
    <main className="content-area">
      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Platform admin</p>
            <h1>Audit log</h1>
            <p className="hero-copy section-subtitle">
              Review sanitized platform and workspace audit events without raw secret metadata.
            </p>
          </div>
          <Link className="avatarkit-link-button" href="/dashboard">
            Dashboard
          </Link>
        </div>
        <AuditFilters searchParams={params} workspaces={workspaces} />
        <AuditTable rows={rows} />
      </section>
    </main>
  )
}
