import Link from "next/link"
import {
  CONVERSATION_INTELLIGENCE_PERIODS,
  fetchConversationIntelligenceDashboard,
  parseConversationIntelligencePeriod,
  type ConversationChannelBreakdown,
  type ConversationIntelligenceDashboard,
  type ConversationIntelligenceMetric
} from "@/lib/conversation-intelligence"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

function PeriodFilter({ currentPeriod }: { currentPeriod: string }) {
  return (
    <form className="conversation-filter-form" method="get">
      <div className="conversation-filter-row">
        <label>
          Period
          <select name="period" defaultValue={currentPeriod}>
            {CONVERSATION_INTELLIGENCE_PERIODS.map(period => (
              <option value={period} key={period}>
                {period === "all" ? "All time" : `Last ${period}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="conversation-filter-actions">
        <button className="avatarkit-button avatarkit-button-primary" type="submit">
          Apply period
        </button>
        <Link className="avatarkit-button avatarkit-button-secondary" href="/dashboard/analytics">
          Reset
        </Link>
      </div>
    </form>
  )
}

function MetricGrid({ metrics }: { metrics: ConversationIntelligenceMetric[] }) {
  return (
    <div className="operations-metric-grid">
      {metrics.map(metric => (
        <div className="usage-metric" key={metric.label}>
          <span>{metric.label}</span>
          <p>{metric.value}</p>
          <small>{metric.helper}</small>
        </div>
      ))}
    </div>
  )
}

function BreakdownList({
  title,
  rows
}: {
  title: string
  rows: { label: string; count: number; percentage: number }[]
}) {
  return (
    <section className="content-card">
      <div className="content-card-header">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>{title}</h2>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="avatar-empty-state">No conversation signals are available for this period.</p>
      ) : (
        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Count</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.count}</td>
                  <td>{row.percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ChannelTable({ rows }: { rows: ConversationChannelBreakdown[] }) {
  return (
    <section className="content-card">
      <div className="content-card-header">
        <div>
          <p className="eyebrow">Channels</p>
          <h2>Channel performance</h2>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="avatar-empty-state">No channel activity is available for this period.</p>
      ) : (
        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Conversations</th>
                <th>Leads</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.channel}>
                  <td>{row.label}</td>
                  <td>{row.count}</td>
                  <td>{row.leadCount}</td>
                  <td>{row.percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function TopQuestions({ data }: { data: ConversationIntelligenceDashboard }) {
  return (
    <section className="content-card">
      <div className="content-card-header">
        <div>
          <p className="eyebrow">Visitor questions</p>
          <h2>Top visitor questions</h2>
        </div>
      </div>
      {data.topQuestions.length === 0 ? (
        <p className="avatar-empty-state">Repeated visitor questions will appear after conversations contain transcript messages.</p>
      ) : (
        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Intent</th>
                <th>Count</th>
                <th>Last asked</th>
                <th>Avatar</th>
              </tr>
            </thead>
            <tbody>
              {data.topQuestions.map(question => (
                <tr key={question.normalizedQuestion}>
                  <td>{question.question}</td>
                  <td>{question.intentLabel}</td>
                  <td>{question.count}</td>
                  <td>{question.lastAskedAt}</td>
                  <td>{question.avatarName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function AvatarBreakdown({ data }: { data: ConversationIntelligenceDashboard }) {
  return (
    <section className="content-card">
      <div className="content-card-header">
        <div>
          <p className="eyebrow">Avatars</p>
          <h2>Avatar performance</h2>
        </div>
      </div>
      {data.avatarBreakdown.length === 0 ? (
        <p className="avatar-empty-state">Avatar performance appears after conversations are recorded.</p>
      ) : (
        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th>Avatar</th>
                <th>Conversations</th>
                <th>Leads</th>
                <th>Handoffs</th>
                <th>Failures</th>
                <th>Top intent</th>
              </tr>
            </thead>
            <tbody>
              {data.avatarBreakdown.map(avatar => (
                <tr key={avatar.avatarId}>
                  <td>
                    <Link className="secondary-link" href={`/dashboard/conversations?avatarId=${avatar.avatarId}`}>
                      {avatar.avatarName}
                    </Link>
                  </td>
                  <td>{avatar.conversationCount}</td>
                  <td>{avatar.leadCount}</td>
                  <td>{avatar.handoffCount}</td>
                  <td>{avatar.failedCount}</td>
                  <td>{avatar.topIntent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function RecentIntelligence({ data }: { data: ConversationIntelligenceDashboard }) {
  return (
    <section className="content-card">
      <div className="content-card-header">
        <div>
          <p className="eyebrow">Recent sessions</p>
          <h2>Conversation summaries</h2>
        </div>
      </div>
      {data.recentConversations.length === 0 ? (
        <p className="avatar-empty-state">Conversation summaries appear after transcript messages are stored.</p>
      ) : (
        <div className="conversation-list">
          {data.recentConversations.map(conversation => (
            <article className="conversation-row" key={conversation.id}>
              <div className="conversation-row-main">
                <div>
                  <p className="eyebrow">Session {conversation.id.slice(0, 8)}</p>
                  <h3>{conversation.avatarName}</h3>
                  <p className="avatar-meta">
                    {conversation.channelLabel} · {conversation.primaryIntentLabel} · {conversation.outcomeLabel}
                  </p>
                </div>
                <div className="conversation-row-meta">
                  <span className="status-pill">{conversation.status}</span>
                  <span>{conversation.updatedAt}</span>
                </div>
              </div>
              <p className="conversation-preview-text">{conversation.summary}</p>
              <div className="conversation-metrics">
                <span>{conversation.messageCount} messages</span>
                {conversation.leadStatus ? <span className="status-pill lead-status-new">lead · {conversation.leadStatus}</span> : null}
              </div>
              <div className="conversation-row-links">
                <Link className="avatarkit-link-button" href={`/dashboard/conversations/${conversation.id}`}>
                  Open conversation
                </Link>
                <Link className="avatarkit-link-button" href={`/dashboard/avatars/${conversation.avatarId}/studio`}>
                  Avatar studio
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default async function ConversationAnalyticsPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string; period?: string }>
}) {
  const { workspaceId, period } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/analytics"
  })

  if (!context) {
    return null
  }

  const selectedPeriod = parseConversationIntelligencePeriod(period)
  const data = await fetchConversationIntelligenceDashboard(context.workspace.id, selectedPeriod)

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Conversation intelligence</p>
        <h1>Analytics</h1>
        <p className="hero-copy section-subtitle">
          Review intent, outcomes, repeated visitor questions, channel conversion, and deterministic conversation summaries from workspace-owned transcript data.
        </p>
        {data.isCapped ? (
          <p className="form-helper">Analytics are capped to the latest 500 conversations for dashboard responsiveness.</p>
        ) : null}
        <PeriodFilter currentPeriod={data.period} />
      </section>

      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Overview</p>
            <h2>Performance snapshot</h2>
          </div>
        </div>
        <MetricGrid metrics={data.metrics} />
      </section>

      <div className="operations-split-grid">
        <BreakdownList title="Intent mix" rows={data.intentBreakdown} />
        <BreakdownList title="Outcome mix" rows={data.outcomeBreakdown} />
      </div>

      <ChannelTable rows={data.channelBreakdown} />
      <TopQuestions data={data} />
      <AvatarBreakdown data={data} />
      <RecentIntelligence data={data} />
    </main>
  )
}
