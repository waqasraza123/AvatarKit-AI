import Link from "next/link"
import { getWorkspaceContextForRequest } from "@/lib/workspace"
import {
  USAGE_PERIODS,
  fetchUsageDashboardData,
  formatBytes,
  formatEstimatedCost,
  formatUsageNumber,
  parseUsagePeriod,
  type UsageDashboardData
} from "@/lib/usage"

function periodLabel(period: string): string {
  if (period === "7d") {
    return "Last 7 days"
  }

  if (period === "30d") {
    return "Last 30 days"
  }

  return "All time"
}

function UsageMetric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="usage-metric">
      <span>{value}</span>
      <p>{label}</p>
      {helper ? <small>{helper}</small> : null}
    </div>
  )
}

function UsagePeriodFilter({ currentPeriod }: { currentPeriod: string }) {
  return (
    <form className="usage-period-filter" method="get">
      <label>
        Period
        <select name="period" defaultValue={currentPeriod}>
          {USAGE_PERIODS.map(period => (
            <option key={period} value={period}>
              {periodLabel(period)}
            </option>
          ))}
        </select>
      </label>
      <button className="avatarkit-button avatarkit-button-primary" type="submit">
        Apply
      </button>
    </form>
  )
}

function UsageEmptyState() {
  return (
    <section className="content-card usage-empty-state">
      <p className="eyebrow">Tracked usage</p>
      <h2>No usage recorded yet</h2>
      <p>
        Usage appears after Avatar Studio previews, widget conversations, voice input, source photo uploads, and knowledge source creation.
      </p>
      <div className="avatar-card-actions">
        <Link className="avatarkit-link-button" href="/dashboard/avatars">
          Open avatars
        </Link>
        <Link className="avatarkit-link-button" href="/dashboard/knowledge/new">
          Add knowledge
        </Link>
      </div>
    </section>
  )
}

function UsageOverview({ data }: { data: UsageDashboardData }) {
  const totals = data.totals
  return (
    <section className="content-card">
      <div className="content-card-header">
        <div>
          <p className="eyebrow">Estimated operational usage</p>
          <h1>Usage</h1>
          <p className="hero-copy section-subtitle">
            Tracked usage for this workspace. Estimated cost is an internal operational estimate, not a bill.
          </p>
        </div>
        <div className="usage-billing-note">
          <strong>Not a bill</strong>
          <span>Plan limits live in Billing.</span>
        </div>
      </div>
      <UsagePeriodFilter currentPeriod={data.period} />
      {data.softLimitWarnings.length > 0 ? (
        <div className="usage-warning-list">
          {data.softLimitWarnings.map(warning => (
            <p className="form-error" key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      <div className="usage-summary-grid">
        <UsageMetric label="Conversations" value={formatUsageNumber(totals.conversations)} />
        <UsageMetric label="Messages" value={formatUsageNumber(totals.messages)} />
        <UsageMetric label="Widget sessions" value={formatUsageNumber(totals.widgetSessions)} />
        <UsageMetric label="LLM input tokens" value={formatUsageNumber(totals.llmInputTokens)} />
        <UsageMetric label="LLM output tokens" value={formatUsageNumber(totals.llmOutputTokens)} />
        <UsageMetric label="TTS characters" value={formatUsageNumber(totals.ttsCharacters)} helper={`${formatUsageNumber(totals.ttsRequests)} requests`} />
        <UsageMetric label="STT seconds" value={formatUsageNumber(totals.sttSeconds)} helper={`${formatUsageNumber(totals.sttRequests)} requests`} />
        <UsageMetric label="Avatar video seconds" value={formatUsageNumber(totals.avatarVideoSeconds)} helper={`${formatUsageNumber(totals.avatarVideoRequests)} requests`} />
        <UsageMetric label="Storage uploaded" value={formatBytes(totals.storageBytesUploaded)} />
        <UsageMetric label="Knowledge sources" value={formatUsageNumber(totals.knowledgeSources)} helper={`${formatUsageNumber(totals.knowledgeChunks)} chunks`} />
        <UsageMetric label="Estimated operational cost" value={formatEstimatedCost(totals.estimatedCostCents)} helper="Approximate internal cost" />
      </div>
    </section>
  )
}

function PerAvatarUsage({ data }: { data: UsageDashboardData }) {
  return (
    <section className="content-card">
      <div className="content-card-header">
        <div>
          <p className="eyebrow">Per-avatar usage</p>
          <h2>Avatar summaries</h2>
        </div>
      </div>
      {data.perAvatar.length === 0 ? (
        <p className="avatar-empty-state">
          No avatar-linked usage exists for {data.periodLabel.toLowerCase()}.
        </p>
      ) : (
        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th>Avatar</th>
                <th>Messages</th>
                <th>Widget sessions</th>
                <th>LLM tokens</th>
                <th>TTS chars</th>
                <th>STT sec</th>
                <th>Video</th>
                <th>Storage</th>
                <th>Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {data.perAvatar.map(avatar => (
                <tr key={avatar.avatarId}>
                  <td>{avatar.avatarName}</td>
                  <td>{formatUsageNumber(avatar.messages)}</td>
                  <td>{formatUsageNumber(avatar.widgetSessions)}</td>
                  <td>{formatUsageNumber(avatar.llmInputTokens + avatar.llmOutputTokens)}</td>
                  <td>{formatUsageNumber(avatar.ttsCharacters)}</td>
                  <td>{formatUsageNumber(avatar.sttSeconds)}</td>
                  <td>{formatUsageNumber(avatar.avatarVideoRequests)} req · {formatUsageNumber(avatar.avatarVideoSeconds)} sec</td>
                  <td>{formatBytes(avatar.storageBytesUploaded)}</td>
                  <td>{formatEstimatedCost(avatar.estimatedCostCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function RecentUsageEvents({ data }: { data: UsageDashboardData }) {
  return (
    <section className="content-card">
      <div className="content-card-header">
        <div>
          <p className="eyebrow">Recent activity</p>
          <h2>Usage events</h2>
        </div>
      </div>
      {data.recentEvents.length === 0 ? (
        <p className="avatar-empty-state">
          No usage events have been recorded for this period.
        </p>
      ) : (
        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Avatar</th>
                <th>Quantity</th>
                <th>Provider</th>
                <th>Est. cost</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.recentEvents.map(event => (
                <tr key={event.id}>
                  <td>{event.eventType}</td>
                  <td>{event.avatarName ?? "Workspace"}</td>
                  <td>{formatUsageNumber(event.quantity)} {event.unit}</td>
                  <td>{event.provider ?? "N/A"}</td>
                  <td>{formatEstimatedCost(event.costEstimateCents ?? 0)}</td>
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

export default async function DashboardUsagePage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string; period?: string }>
}) {
  const { workspaceId, period } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/usage"
  })

  if (!context) {
    return null
  }

  const selectedPeriod = parseUsagePeriod(period)
  const data = await fetchUsageDashboardData(context.workspace.id, selectedPeriod)
  const hasUsage = data.recentEvents.length > 0

  return (
    <main className="content-area">
      <UsageOverview data={data} />
      {hasUsage ? (
        <>
          <PerAvatarUsage data={data} />
          <RecentUsageEvents data={data} />
        </>
      ) : (
        <UsageEmptyState />
      )}
    </main>
  )
}
