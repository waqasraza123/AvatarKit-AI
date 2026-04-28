import Link from "next/link"
import { headers } from "next/headers"
import { WorkspaceRole } from "@prisma/client"
import {
  fetchAvatarsForWorkspace,
  formatWorkspaceLocalTime,
  getCurrentSourcePhoto
} from "@/lib/avatar"
import { fetchOrCreateKioskSettings } from "@/lib/kiosk"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"
import { KioskSettingsForm } from "./_components/kiosk-forms"

function canManageKiosk(role: WorkspaceRole): boolean {
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

export default async function DashboardKioskPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string; avatarId?: string }>
}) {
  const { workspaceId, avatarId } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/kiosk"
  })

  if (!context) {
    return null
  }

  const [avatars, headersList] = await Promise.all([
    fetchAvatarsForWorkspace(context.workspace.id),
    headers()
  ])
  const publishedAvatars = avatars.filter(avatar => avatar.status === "PUBLISHED")
  const selectedAvatar = publishedAvatars.find(avatar => avatar.id === avatarId) ?? publishedAvatars[0] ?? null
  const canManage = canManageKiosk(context.workspaceMembership.role)
  const settings = selectedAvatar ? await fetchOrCreateKioskSettings(selectedAvatar) : null
  const currentPhoto = selectedAvatar ? getCurrentSourcePhoto(selectedAvatar) : null
  const kioskUrl = selectedAvatar ? `${buildAppBaseUrl(headersList)}/kiosk/${selectedAvatar.id}` : ""

  return (
    <main className="content-area">
      <section className="content-card">
        <p className="eyebrow">Touchscreen runtime</p>
        <h1>Kiosk Mode</h1>
        <p className="hero-copy section-subtitle">
          Configure full-screen public kiosk sessions for published avatars, with inactivity reset and separate conversation tagging.
        </p>
        <div className="embed-status-grid kiosk-status-grid">
          <div>
            <span>{publishedAvatars.length}</span>
            <p>Published avatars</p>
          </div>
          <div className={settings?.enabled ? "ready" : "warning"}>
            <span>{settings?.enabled ? "Enabled" : "Disabled"}</span>
            <p>Kiosk access</p>
          </div>
          <div>
            <span>{settings ? `${settings.privacyTimeoutSeconds}s` : "Blocked"}</span>
            <p>Privacy timeout</p>
          </div>
        </div>
        {publishedAvatars.length === 0 ? (
          <p className="form-error">
            No published avatars exist yet. Publish an avatar before enabling a kiosk runtime.
          </p>
        ) : null}
        {!canManage ? (
          <p className="form-error">
            Your role can view kiosk settings but cannot change the touchscreen runtime.
          </p>
        ) : null}
      </section>

      <section className="content-card">
        <div className="content-card-header">
          <h2>Published avatars</h2>
          <p className="avatar-meta">Only published avatars can run in public kiosk mode.</p>
        </div>
        {publishedAvatars.length > 0 ? (
          <div className="embed-avatar-grid">
            <form className="form-shell embed-avatar-select" method="get">
              <label>
                Active kiosk avatar
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
                    <p className="eyebrow">Kiosk-ready avatar</p>
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
                      <dt>Language</dt>
                      <dd>{settings?.allowedLanguage ?? selectedAvatar.language}</dd>
                    </div>
                    <div>
                      <dt>Conversation channel</dt>
                      <dd>KIOSK</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ) : null}
          </div>
        ) : (
          <div className="avatar-empty-state">
            <p>Publish a complete avatar first, then return here to configure kiosk mode.</p>
            <Link className="avatarkit-link-button" href="/dashboard/avatars">
              Open Avatar Studio
            </Link>
          </div>
        )}
      </section>

      {selectedAvatar && settings ? (
        <>
          <section className="content-card">
            <KioskSettingsForm
              settings={settings}
              canManage={canManage}
            />
          </section>

          <section className="content-card">
            <div className="content-card-header">
              <h2>Kiosk URL</h2>
              {settings.enabled ? (
                <Link className="avatarkit-link-button" href={`/kiosk/${selectedAvatar.id}`} target="_blank" rel="noreferrer">
                  Open kiosk
                </Link>
              ) : null}
            </div>
            <pre className="embed-script-block">{kioskUrl}</pre>
            <div className="kiosk-preview-grid">
              <div>
                <span>{settings.inactivityTimeoutSeconds}s</span>
                <p>Idle reset</p>
              </div>
              <div>
                <span>{settings.leadCaptureEnabled ? "On" : "Off"}</span>
                <p>Lead capture</p>
              </div>
              <div>
                <span>{settings.qrHandoffUrl ? "Ready" : "None"}</span>
                <p>QR handoff</p>
              </div>
              <div>
                <span>{settings.staffCallUrl ? "Ready" : "None"}</span>
                <p>Staff call</p>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}
