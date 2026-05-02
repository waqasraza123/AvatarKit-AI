import { DashboardPlaceholder } from "./_components/dashboard-placeholder"
import Link from "next/link"
import { fetchConversationOverview } from "@/lib/conversation"
import { fetchUsageOverviewSummary, formatEstimatedCost, formatUsageNumber } from "@/lib/usage"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

const moduleCards = [
  {
    title: "Avatars",
    description: "Create avatars and configure appearance in later phases."
  },
  {
    title: "Conversations",
    description: "Review transcripts, status, safety, media, and knowledge gap signals."
  },
  {
    title: "Analytics",
    description: "Conversation intelligence for intents, outcomes, top questions, and channel performance."
  },
  {
    title: "Leads",
    description: "Captured widget contact requests and simple lead status review."
  },
  {
    title: "Usage",
    description: "Usage, cost, and quota analytics will appear here."
  }
]

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string; error?: string }>
}) {
  const { workspaceId, error } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard"
  })
  const isWorkspaceForbidden = error === "workspace_forbidden"

  if (!context) {
    return null
  }

  const [conversationOverview, usageOverview] = await Promise.all([
    fetchConversationOverview(context.workspace.id),
    fetchUsageOverviewSummary(context.workspace.id)
  ])

  return (
    <main className="content-area">
      {isWorkspaceForbidden ? (
        <section className="content-card">
          <p className="form-error">
            Access denied for the selected workspace. The workspace was reset to one you can access.
          </p>
        </section>
      ) : null}
      <DashboardPlaceholder
        title="Overview"
        subtitle="Welcome to your workspace dashboard."
        intro="Set up your first avatar to begin using this workspace. Other modules are placeholders for next phases."
        workspaceName={context.workspace.name}
        actionHint="Recommended next step: create your first avatar."
        cards={moduleCards}
      />
      <section className="content-card">
        <h2>Setup checklist</h2>
        <ul className="setup-checklist">
          <li>
            <span>1.</span> Create a workspace
          </li>
          <li>
            <span>2.</span> Sign in with workspace context
          </li>
          <li className="todo">
            <span>3.</span> Create first avatar
          </li>
          <li>4. Configure knowledge and usage once available</li>
        </ul>
      </section>
      <section className="content-card">
        <h2>Conversation overview</h2>
        <div className="conversation-summary-grid">
          <div>
            <span>{conversationOverview.totalConversations}</span>
            <p>Total conversations</p>
          </div>
          <div>
            <span>{conversationOverview.dashboardPreviewConversations}</span>
            <p>Dashboard preview conversations</p>
          </div>
          <div>
            <span>{conversationOverview.failedConversations}</span>
            <p>Failed conversations</p>
          </div>
          <div>
            <span>{conversationOverview.recentConversations.length}</span>
            <p>Recent sessions</p>
          </div>
          <div>
            <span>{conversationOverview.newLeads}</span>
            <p>New leads</p>
          </div>
          <div>
            <span>{conversationOverview.totalLeads}</span>
            <p>Total leads</p>
          </div>
          <div>
            <span>{formatUsageNumber(usageOverview.currentMonthMessages)}</span>
            <p>Usage messages this month</p>
          </div>
          <div>
            <span>{formatEstimatedCost(usageOverview.currentMonthCostCents)}</span>
            <p>Estimated ops cost this month</p>
          </div>
        </div>
        <div className="avatar-card-actions conversation-overview-actions">
          <Link className="avatarkit-link-button" href="/dashboard/conversations">
            Open conversation list
          </Link>
          <Link className="avatarkit-link-button" href="/dashboard/leads">
            Open lead dashboard
          </Link>
          <Link className="avatarkit-link-button" href="/dashboard/usage">
            Open usage dashboard
          </Link>
        </div>
        {conversationOverview.recentConversations.length === 0 ? (
          <p className="avatar-empty-state">
            No conversations yet. Use Avatar Studio Preview to generate review transcripts in this workspace.
          </p>
        ) : (
          <div className="conversation-overview-list">
            {conversationOverview.recentConversations.map(item => (
              <article className="conversation-overview-item" key={item.id}>
                <p className="eyebrow">{item.id.slice(0, 8)}</p>
                <p>{item.avatarName}</p>
                <p className="avatar-meta">
                  {item.channel} · {item.status} · {item.messageCount} messages
                </p>
                <p className="avatar-meta">
                  Last update {item.updatedAt}
                </p>
                <p>{item.latestMessagePreview}</p>
                <Link className="avatarkit-link-button" href={`/dashboard/conversations/${item.id}`}>
                  Open conversation
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="content-card">
        <h2>Recent usage activity</h2>
        {usageOverview.recentActivity.length === 0 ? (
          <p className="avatar-empty-state">
            No usage events yet. Usage appears after previews, widget conversations, uploads, and knowledge creation.
          </p>
        ) : (
          <div className="conversation-overview-list">
            {usageOverview.recentActivity.map(event => (
              <article className="conversation-overview-item" key={event.id}>
                <p className="eyebrow">{event.eventType}</p>
                <p>{event.avatarName ?? "Workspace event"}</p>
                <p className="avatar-meta">
                  {formatUsageNumber(event.quantity)} {event.unit} · {event.provider ?? "no provider"}
                </p>
                <p className="avatar-meta">
                  Estimated cost {formatEstimatedCost(event.costEstimateCents ?? 0)}
                </p>
                <p>{event.createdAt}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
