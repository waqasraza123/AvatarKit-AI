import { WorkspaceRole } from "@prisma/client"
import { formatWorkspaceLocalTime } from "@/lib/avatar"
import {
  listApiKeysForWorkspace,
  listWebhookEndpointsForWorkspace
} from "@/lib/public-api"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"
import {
  ApiKeyCreateForm,
  ApiKeyRevokeForm,
  WebhookEndpointCreateForm,
  WebhookEndpointRevokeForm
} from "./_components/developer-forms"

function canManageDeveloperAccess(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.ADMIN)
}

function statusLabel(revokedAt: Date | null): string {
  return revokedAt ? "Revoked" : "Active"
}

export default async function DashboardDevelopersPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string }>
}) {
  const { workspaceId } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/developers"
  })

  if (!context) {
    return null
  }

  const [apiKeys, webhookEndpoints] = await Promise.all([
    listApiKeysForWorkspace(context.workspace.id),
    listWebhookEndpointsForWorkspace(context.workspace.id)
  ])
  const canManage = canManageDeveloperAccess(context.workspaceMembership.role)
  const activeApiKeys = apiKeys.filter(key => !key.revokedAt).length
  const activeWebhooks = webhookEndpoints.filter(endpoint => !endpoint.revokedAt).length

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Developer platform</p>
        <h1>Public API and SDK</h1>
        <p className="hero-copy section-subtitle">
          Manage workspace API keys, webhook endpoints, and the Phase 19 integration surface for published avatars.
        </p>
        <div className="embed-status-grid">
          <div className={activeApiKeys > 0 ? "ready" : "warning"}>
            <span>{activeApiKeys}</span>
            <p>Active API keys</p>
          </div>
          <div className={activeWebhooks > 0 ? "ready" : "warning"}>
            <span>{activeWebhooks}</span>
            <p>Active webhooks</p>
          </div>
          <div>
            <span>v1</span>
            <p>Public API</p>
          </div>
        </div>
        {!canManage ? (
          <p className="form-error">
            Your role can inspect developer settings but cannot create or revoke credentials.
          </p>
        ) : null}
      </section>

      <section className="content-card">
        <div className="content-card-header">
          <div>
            <h2>API keys</h2>
            <p className="avatar-meta">Keys are shown once, stored as hashes, and scoped to this workspace.</p>
          </div>
        </div>
        <ApiKeyCreateForm canManage={canManage} />
        <div className="developer-list">
          {apiKeys.length === 0 ? (
            <p className="avatar-empty-state">No API keys have been created for this workspace.</p>
          ) : apiKeys.map(key => (
            <article className="developer-list-card" key={key.id}>
              <div>
                <p className="eyebrow">{statusLabel(key.revokedAt)}</p>
                <h3>{key.name}</h3>
                <p className="avatar-meta">Prefix: {key.prefix}</p>
                <p className="avatar-meta">Scopes: {key.scopes.join(", ")}</p>
                <p className="avatar-meta">Created: {formatWorkspaceLocalTime(key.createdAt)}</p>
                <p className="avatar-meta">Last used: {key.lastUsedAt ? formatWorkspaceLocalTime(key.lastUsedAt) : "Never"}</p>
                {key.revokedAt ? <p className="avatar-meta">Revoked: {formatWorkspaceLocalTime(key.revokedAt)}</p> : null}
              </div>
              <ApiKeyRevokeForm apiKeyId={key.id} disabled={!canManage || Boolean(key.revokedAt)} />
            </article>
          ))}
        </div>
      </section>

      <section className="content-card">
        <div className="content-card-header">
          <div>
            <h2>Webhook endpoints</h2>
            <p className="avatar-meta">Webhook signing secrets are shown once. Store them in the receiving service.</p>
          </div>
        </div>
        <WebhookEndpointCreateForm canManage={canManage} />
        <div className="developer-list">
          {webhookEndpoints.length === 0 ? (
            <p className="avatar-empty-state">No webhook endpoints have been registered for this workspace.</p>
          ) : webhookEndpoints.map(endpoint => (
            <article className="developer-list-card" key={endpoint.id}>
              <div>
                <p className="eyebrow">{statusLabel(endpoint.revokedAt)}</p>
                <h3>{endpoint.description || endpoint.url}</h3>
                <p className="avatar-meta">URL: {endpoint.url}</p>
                <p className="avatar-meta">Secret prefix: {endpoint.signingSecretPrefix}</p>
                <p className="avatar-meta">Events: {endpoint.events.join(", ")}</p>
                <p className="avatar-meta">Created: {formatWorkspaceLocalTime(endpoint.createdAt)}</p>
                <p className="avatar-meta">Last delivery: {endpoint.lastDeliveryAt ? formatWorkspaceLocalTime(endpoint.lastDeliveryAt) : "Never"}</p>
                {endpoint.revokedAt ? <p className="avatar-meta">Revoked: {formatWorkspaceLocalTime(endpoint.revokedAt)}</p> : null}
              </div>
              <WebhookEndpointRevokeForm webhookEndpointId={endpoint.id} disabled={!canManage || Boolean(endpoint.revokedAt)} />
            </article>
          ))}
        </div>
      </section>

      <section className="content-card">
        <h2>Integration endpoints</h2>
        <div className="embed-instructions">
          <p><code>GET /api/public/v1/avatars/:avatarId/config</code></p>
          <p><code>POST /api/public/v1/conversations</code></p>
          <p><code>POST /api/public/v1/conversations/:conversationId/messages</code></p>
          <p><code>GET /api/public/v1/conversations/:conversationId</code></p>
          <p><code>POST /api/public/v1/conversations/:conversationId/lead</code></p>
        </div>
      </section>
    </main>
  )
}
