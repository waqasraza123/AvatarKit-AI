import Link from "next/link"
import { ConversationChannel, ConversationStatus } from "@prisma/client"
import {
  CONVERSATION_CHANNEL_FILTERS,
  CONVERSATION_RECENT_PRESETS,
  CONVERSATION_STATUS_FILTERS,
  type ConversationListFilters,
  type ConversationListItem,
  canManageConversation,
  conversationActionLabel,
  conversationChannelLabel,
  conversationStatusLabel,
  fetchConversationAvatarFilters,
  fetchConversationList,
  getConversationStatusTransitionTargets,
  parseConversationListSearchFilters
} from "@/lib/conversation"
import { markConversationStatusAction } from "@/app/actions/conversations"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

function mapStatusMessage(error: string | undefined): string | null {
  if (error === "bad_request") {
    return "Could not process the conversation update request."
  }

  if (error === "missing_conversation") {
    return "The conversation was not found in this workspace."
  }

  if (error === "permission_denied") {
    return "You do not have permission to update conversation status."
  }

  if (error === "transition_not_allowed") {
    return "That conversation status change is not allowed."
  }

  return null
}

function hasConversationFilters(filters: ConversationListFilters): boolean {
  return Boolean(
    filters.avatarId ||
      filters.channel !== "ALL" ||
      filters.status !== "ALL" ||
      filters.messageSearch ||
      filters.recent !== "all"
  )
}

function conversationListClass(status: ConversationStatus): string {
  if (status === ConversationStatus.ACTIVE) {
    return "status-pill conversation-status-active"
  }

  if (status === ConversationStatus.ENDED) {
    return "status-pill conversation-status-ended"
  }

  if (status === ConversationStatus.HANDOFF_REQUESTED) {
    return "status-pill conversation-status-handoff"
  }

  return "status-pill conversation-status-failed"
}

function buildStatusActionLabel(nextStatus: ConversationStatus): string {
  return conversationActionLabel(nextStatus)
}

function renderEmptyState(hasFilters: boolean): JSX.Element {
  return (
    <section className="conversation-empty-state content-card">
      <h2>No conversations yet</h2>
      <p>
        Conversations appear after you use Avatar Studio Preview or after a visitor sends a Phase 12 widget message.
        KIOSK and API channels remain future placeholders.
      </p>
      <div className="avatar-card-actions">
        <Link className="avatarkit-link-button" href="/dashboard/avatars">
          Open Avatar Studio
        </Link>
        <Link className="avatarkit-link-button" href="/dashboard/avatars">
          Create a new avatar
        </Link>
      </div>
      {hasFilters ? <p className="form-helper">Try clearing filters to show available preview sessions.</p> : null}
    </section>
  )
}

function ConversationRowAction({
  conversation,
  canManage,
  returnPath
}: {
  conversation: ConversationListItem
  canManage: boolean
  returnPath: string
}) {
  if (!canManage) {
    return null
  }

  const transitions = getConversationStatusTransitionTargets(conversation.status)
  if (transitions.length === 0) {
    return null
  }

  return (
    <div className="conversation-row-actions">
      {transitions.map(nextStatus => (
        <form action={markConversationStatusAction} key={nextStatus}>
          <input type="hidden" name="conversationId" value={conversation.id} />
          <input type="hidden" name="targetStatus" value={nextStatus} />
          <input type="hidden" name="returnPath" value={returnPath} />
          <button
            className="avatarkit-button avatarkit-button-secondary"
            type="submit"
          >
            {buildStatusActionLabel(nextStatus)}
          </button>
        </form>
      ))}
    </div>
  )
}

function ConversationFilters({
  currentFilters,
  avatarOptions
}: {
  currentFilters: ConversationListFilters
  avatarOptions: { id: string; name: string }[]
}) {
  const hasConversationsChannelOptions = CONVERSATION_CHANNEL_FILTERS.map(channel => (
    <option key={channel} value={channel}>
      {conversationChannelLabel(channel)}
    </option>
  ))

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
          Channel
          <select name="channel" defaultValue={currentFilters.channel}>
            <option value="ALL">All channels</option>
            {hasConversationsChannelOptions}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={currentFilters.status}>
            <option value="ALL">All statuses</option>
            {CONVERSATION_STATUS_FILTERS.map(status => (
              <option value={status} key={status}>
                {conversationStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Recent
          <select name="recent" defaultValue={currentFilters.recent}>
            <option value="all">All time</option>
            {CONVERSATION_RECENT_PRESETS.slice(1).map(window => (
              <option value={window} key={window}>
                Last {window}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search transcript
          <input
            type="text"
            name="q"
            defaultValue={currentFilters.messageSearch ?? ""}
            placeholder="Search message text"
            maxLength={200}
          />
        </label>
      </div>
      <div className="conversation-filter-actions">
        <button className="avatarkit-button avatarkit-button-primary" type="submit">
          Apply filters
        </button>
        <Link className="avatarkit-button avatarkit-button-secondary" href="/dashboard/conversations">
          Reset
        </Link>
      </div>
    </form>
  )
}

function ConversationList({
  items,
  canManage
}: {
  items: ConversationListItem[]
  canManage: boolean
}) {
  if (items.length === 0) {
    return renderEmptyState(false)
  }

  return (
    <div className="conversation-list">
      {items.map(conversation => (
        <article className="conversation-row" key={conversation.id}>
          <div className="conversation-row-main">
            <div>
              <p className="eyebrow">Session {conversation.id.slice(0, 8)}</p>
              <h3>{conversation.avatarName}</h3>
              <p className="avatar-meta">
                {conversationChannelLabel(conversation.channel)} · {conversationStatusLabel(conversation.status)}
              </p>
            </div>
            <div className="conversation-row-meta">
              <span className={conversationListClass(conversation.status)}>{conversation.status}</span>
              <span>{conversation.createdAt}</span>
              <span>Updated {conversation.updatedAt}</span>
            </div>
          </div>
          <p className="conversation-preview-text">
            {conversation.latestMessagePreview ?? "No messages yet"}
          </p>
          <div className="conversation-metrics">
            <span>{conversation.messageCount} messages</span>
            <span>Latest {conversation.latestMessageAt ?? "N/A"}</span>
            {conversation.lead ? <span className="status-pill lead-status-new">lead captured · {conversation.lead.status}</span> : null}
            {conversation.hasHandoffRequestFlag ? <span className="status-pill status-pill-warning">handoff requested</span> : null}
            {conversation.hasFailureFlag ? <span className="status-pill status-pill-danger">failed</span> : null}
          </div>
          <div className="conversation-row-links">
            <Link
              className="avatarkit-link-button"
              href={`/dashboard/conversations/${conversation.id}`}
            >
              Open conversation
            </Link>
            <Link
              className="avatarkit-link-button"
              href={`/dashboard/conversations?avatarId=${conversation.avatarId}&channel=${conversation.channel}`}
            >
              Filter by avatar
            </Link>
            <Link
              className="avatarkit-link-button"
              href={`/dashboard/avatars/${conversation.avatarId}/studio`}
            >
              Avatar studio
            </Link>
            {conversation.lead ? (
              <Link
                className="avatarkit-link-button"
                href={`/dashboard/leads/${conversation.lead.id}`}
              >
                Open lead
              </Link>
            ) : null}
          </div>
          <ConversationRowAction
            canManage={canManage}
            conversation={conversation}
            returnPath="/dashboard/conversations"
          />
        </article>
      ))}
    </div>
  )
}

export default async function DashboardConversationsPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string; avatarId?: string; channel?: string; status?: string; q?: string; recent?: string; statusError?: string }>
}) {
  const { workspaceId, avatarId, channel, status, q, recent, statusError } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/conversations"
  })

  if (!context) {
    return null
  }

  const filters = parseConversationListSearchFilters({
    avatarId,
    channel,
    status,
    q,
    recent
  })
  const hasFilters = hasConversationFilters(filters)
  const [avatarOptions, conversations] = await Promise.all([
    fetchConversationAvatarFilters(context.workspace.id),
    fetchConversationList(context.workspace.id, filters)
  ])
  const canManage = canManageConversation(context.workspaceMembership.role)
  const statusErrorMessage = mapStatusMessage(statusError)

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Conversations</p>
        <h1>Conversation Dashboard</h1>
        <p className="hero-copy section-subtitle">
          Review dashboard preview and Phase 12 widget transcripts, then manage conversation status.
        </p>
        <p className="form-helper">
          Widget conversations are created by public published-avatar requests. KIOSK and API remain future channels.
        </p>
        <ConversationFilters currentFilters={filters} avatarOptions={avatarOptions} />
        {statusErrorMessage ? <p className="form-error">{statusErrorMessage}</p> : null}
      </section>
      <section className="content-card">
        <div className="content-card-header">
          <h2>Conversation list</h2>
          <p className="avatar-meta">
            Showing {conversations.length} conversation(s)
            {hasFilters ? " with current filters" : ""}
          </p>
        </div>
        {conversations.length === 0 ? renderEmptyState(hasFilters) : <ConversationList items={conversations} canManage={canManage} />}
      </section>
    </main>
  )
}
