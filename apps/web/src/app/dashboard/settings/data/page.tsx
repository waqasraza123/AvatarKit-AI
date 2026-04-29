import Link from "next/link"
import { WorkspaceRole } from "@prisma/client"
import {
  CancelWorkspaceDeletionRequestForm,
  DataExportRequestForm,
  WorkspaceDeletionRequestForm
} from "@/app/dashboard/settings/_components/data-governance-forms"
import { getDataGovernanceSummary, type DataGovernanceCounts } from "@/lib/data-governance"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"

type SearchParams = Promise<{
  workspaceId?: string
}>

const countLabels: Array<[keyof DataGovernanceCounts, string]> = [
  ["avatars", "Avatars"],
  ["avatarAssets", "Avatar assets"],
  ["consentRecords", "Consent records"],
  ["knowledgeSources", "Knowledge sources"],
  ["knowledgeChunks", "Knowledge chunks"],
  ["conversations", "Conversations"],
  ["messages", "Messages"],
  ["leads", "Leads"],
  ["usageEvents", "Usage events"],
  ["safetyEvents", "Safety events"],
  ["knowledgeGaps", "Knowledge gaps"],
  ["realtimeSessions", "Realtime sessions"],
  ["apiKeys", "API keys"],
  ["webhookEndpoints", "Webhook endpoints"],
  ["auditLogs", "Audit logs"]
]

function canExportWorkspaceData(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.ADMIN)
}

function canRequestWorkspaceDeletion(role: WorkspaceRole): boolean {
  return role === WorkspaceRole.OWNER
}

function CountsGrid({ counts }: { counts: DataGovernanceCounts }) {
  return (
    <dl className="settings-grid">
      {countLabels.map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{counts[key].toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  )
}

export default async function WorkspaceDataSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: params.workspaceId,
    nextPath: "/dashboard/settings/data"
  })

  if (!context) {
    return null
  }

  const summary = await getDataGovernanceSummary(context.workspace.id)
  const canExport = canExportWorkspaceData(context.workspaceMembership.role)
  const canDelete = canRequestWorkspaceDeletion(context.workspaceMembership.role)

  return (
    <main className="content-area">
      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h1>Data governance</h1>
            <p className="hero-copy section-subtitle">
              Export workspace records, review retained data, and manage deletion requests for {context.workspace.name}.
            </p>
          </div>
          <Link className="avatarkit-link-button" href="/dashboard/settings">
            Workspace settings
          </Link>
        </div>

        <section className="placeholder-block">
          <h2>Retention inventory</h2>
          <p>
            Counts are workspace-scoped and exclude raw secrets, password hashes, sessions, and environment values.
          </p>
          <CountsGrid counts={summary.counts} />
        </section>

        <section className="placeholder-block">
          <div className="content-card-header">
            <div>
              <h2>Workspace export</h2>
              <p>
                Exports are generated as authenticated JSON downloads and expire after seven days.
              </p>
            </div>
          </div>
          <DataExportRequestForm canExport={canExport} />
          {!canExport ? <p className="form-error">Only owners and admins can export workspace data.</p> : null}
          <div className="usage-table-wrap">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Requested by</th>
                  <th>Expires</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {summary.exports.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No exports have been created for this workspace.</td>
                  </tr>
                ) : summary.exports.map(row => (
                  <tr key={row.id}>
                    <td>{row.createdAt}</td>
                    <td><span className="status-pill status-pill-muted">{row.status}</span></td>
                    <td>{row.requestedByEmail ?? "Unknown user"}</td>
                    <td>{row.expiresAt}</td>
                    <td>
                      {row.downloadHref ? (
                        <a className="avatarkit-link-button" href={row.downloadHref}>
                          Download
                        </a>
                      ) : "Unavailable"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="placeholder-block">
          <h2>Deletion request</h2>
          <p>
            Deletion requests create an audited scheduling record only. Destructive erasure requires a future approved worker or manual operator execution.
          </p>
          <WorkspaceDeletionRequestForm
            canRequestDeletion={canDelete}
            workspaceSlug={context.workspace.slug}
            hasActiveRequest={Boolean(summary.activeDeletionRequest)}
          />
          {!canDelete ? <p className="form-error">Only the workspace owner can request deletion.</p> : null}
          <div className="usage-table-wrap">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Scheduled</th>
                  <th>Requested by</th>
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {summary.deletionRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No deletion requests have been recorded.</td>
                  </tr>
                ) : summary.deletionRequests.map(row => (
                  <tr key={row.id}>
                    <td>{row.createdAt}</td>
                    <td><span className="status-pill status-pill-muted">{row.status}</span></td>
                    <td>{row.scheduledDeletionAt}</td>
                    <td>{row.requestedByEmail ?? "Unknown user"}</td>
                    <td>{row.reason ?? "No reason provided"}</td>
                    <td>
                      {row.canCancel ? (
                        <CancelWorkspaceDeletionRequestForm deletionRequestId={row.id} disabled={!canDelete} />
                      ) : "No action"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  )
}

