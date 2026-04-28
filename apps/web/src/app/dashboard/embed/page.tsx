import Link from "next/link"
import { headers } from "next/headers"
import { WorkspaceRole } from "@prisma/client"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"
import {
  fetchAvatarsForWorkspace,
  formatWorkspaceLocalTime,
  getCurrentSourcePhoto
} from "@/lib/avatar"
import {
  fetchAllowedDomainsForWorkspace,
  fetchOrCreateWidgetSettings,
  resolveWidgetOutputModes
} from "@/lib/widget"
import { AllowedDomainForm, AllowedDomainList, WidgetSettingsForm } from "./_components/embed-forms"
import { EmbedCopyButton } from "./_components/embed-copy-button"

function canManageEmbed(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

function buildAppBaseUrl(headersList: { get(name: string): string | null }): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
  if (configured) {
    return configured
  }

  const host = headersList.get("x-forwarded-host") || headersList.get("host") || "localhost:3000"
  const protocol = headersList.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")
  return `${protocol}://${host}`
}

function buildEmbedScript(params: {
  baseUrl: string
  avatarId: string
  theme: string
  position: string
}): string {
  return `<script
  src="${params.baseUrl}/widget.js"
  data-avatar-id="${params.avatarId}"
  data-theme="${params.theme}"
  data-position="${params.position}">
</script>`
}

export default async function DashboardEmbedPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string; avatarId?: string }>
}) {
  const { workspaceId, avatarId } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/embed"
  })

  if (!context) {
    return null
  }

  const [avatars, allowedDomains, headersList] = await Promise.all([
    fetchAvatarsForWorkspace(context.workspace.id),
    fetchAllowedDomainsForWorkspace(context.workspace.id),
    headers()
  ])
  const publishedAvatars = avatars.filter(avatar => avatar.status === "PUBLISHED")
  const selectedAvatar = publishedAvatars.find(avatar => avatar.id === avatarId) ?? publishedAvatars[0] ?? null
  const canManage = canManageEmbed(context.workspaceMembership.role)
  const appBaseUrl = buildAppBaseUrl(headersList)
  const settings = selectedAvatar ? await fetchOrCreateWidgetSettings(selectedAvatar) : null
  const outputModes = selectedAvatar ? resolveWidgetOutputModes(selectedAvatar) : null
  const embedScript = selectedAvatar && settings
    ? buildEmbedScript({
      baseUrl: appBaseUrl,
      avatarId: selectedAvatar.id,
      theme: settings.theme,
      position: settings.position
    })
    : ""
  const currentPhoto = selectedAvatar ? getCurrentSourcePhoto(selectedAvatar) : null

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Embeddable widget</p>
        <h1>Website Widget v1</h1>
        <p className="hero-copy section-subtitle">
          Configure the first public widget for published avatars, restrict domains, and copy the local script tag.
        </p>
        <div className="embed-status-grid">
          <div>
            <span>{publishedAvatars.length}</span>
            <p>Published avatars</p>
          </div>
          <div className={allowedDomains.length > 0 ? "ready" : "warning"}>
            <span>{allowedDomains.length}</span>
            <p>Allowed domains</p>
          </div>
          <div>
            <span>{selectedAvatar ? "Ready" : "Blocked"}</span>
            <p>Widget selection</p>
          </div>
        </div>
        {publishedAvatars.length === 0 ? (
          <p className="form-error">
            No published avatars exist yet. Publish an avatar from Avatar Studio before generating an embed script.
          </p>
        ) : null}
        {allowedDomains.length === 0 ? (
          <p className="form-error">
            No production allowed domain is configured. Public widget requests are blocked outside local development until a domain is added.
          </p>
        ) : null}
        {!canManage ? (
          <p className="form-error">
            Your role can view widget settings but cannot change domains or appearance.
          </p>
        ) : null}
      </section>

      <section className="content-card">
        <div className="content-card-header">
          <h2>Published avatars</h2>
          <p className="avatar-meta">Only published avatars can be embedded.</p>
        </div>
        {publishedAvatars.length > 0 ? (
          <div className="embed-avatar-grid">
            <form className="form-shell embed-avatar-select" method="get">
              <label>
                Active embed avatar
                <select name="avatarId" defaultValue={selectedAvatar?.id}>
                  {publishedAvatars.map(avatar => (
                    <option value={avatar.id} key={avatar.id}>
                      {avatar.displayName} / {avatar.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="avatarkit-button avatarkit-button-secondary" type="submit">
                Select avatar
              </button>
            </form>
            {selectedAvatar ? (
              <article className="embed-avatar-card">
                <div className="avatar-card-header">
                  <div>
                    <p className="eyebrow">Embed-ready avatar</p>
                    <h3>{selectedAvatar.displayName}</h3>
                    <p className="avatar-meta">{selectedAvatar.role} / {selectedAvatar.useCase}</p>
                  </div>
                  <span className="status-pill">{selectedAvatar.status}</span>
                </div>
                <div className="embed-avatar-media">
                  {currentPhoto ? (
                    <img alt="Published avatar source preview" src={currentPhoto.displayUrl} />
                  ) : (
                    <div>No source photo preview</div>
                  )}
                  <dl className="readonly-grid">
                    <div>
                      <dt>Published</dt>
                      <dd>{selectedAvatar.publishedAt ? formatWorkspaceLocalTime(selectedAvatar.publishedAt) : "Published"}</dd>
                    </div>
                    <div>
                      <dt>Output modes</dt>
                      <dd>{outputModes?.supportedOutputModes.join(", ") ?? "text"}</dd>
                    </div>
                    <div>
                      <dt>Default response</dt>
                      <dd>{outputModes?.defaultOutputMode ?? "text"}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ) : null}
          </div>
        ) : (
          <div className="avatar-empty-state">
            <p>Publish a complete avatar first, then return here to configure the widget.</p>
            <Link className="avatarkit-link-button" href="/dashboard/avatars">
              Open Avatar Studio
            </Link>
          </div>
        )}
      </section>

      <section className="content-card">
        <div className="content-card-header">
          <h2>Domain allowlist</h2>
          <p className="avatar-meta">Production requests require an allowed hostname. Localhost is permitted in development.</p>
        </div>
        <div className="embed-management-grid">
          <AllowedDomainForm canManage={canManage} />
          <AllowedDomainList domains={allowedDomains} canManage={canManage} />
        </div>
      </section>

      {selectedAvatar && settings ? (
        <>
          <section className="content-card">
            <WidgetSettingsForm settings={settings} canManage={canManage} />
          </section>

          <section className="content-card">
            <div className="content-card-header">
              <h2>Embed script</h2>
              <EmbedCopyButton script={embedScript} />
            </div>
            <pre className="embed-script-block">{embedScript}</pre>
            <div className="embed-instructions">
              <h3>Local test page</h3>
              <p>
                Use this script in any local HTML page while the web app is running. The widget script is served from this app at <code>{appBaseUrl}/widget.js</code>.
              </p>
              <p>
                For production, add the exact site hostname to the allowlist before embedding the script on that site.
              </p>
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}
