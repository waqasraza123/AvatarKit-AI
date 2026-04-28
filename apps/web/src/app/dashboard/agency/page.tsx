import Link from "next/link"
import { AvatarStatus } from "@prisma/client"
import {
  canManageAgencyWorkspace,
  fetchAgencyDashboardData
} from "@/lib/agency"
import { prisma } from "@/lib/prisma"
import { getWorkspaceContextForRequest } from "@/lib/workspace"
import {
  AgencyBrandingForm,
  AgencyClientProfileForm,
  AgencyDuplicateAvatarForm
} from "./_components/agency-forms"

function checklistProgress(checklist: {
  avatarReviewed: boolean
  knowledgeReviewed: boolean
  domainConfigured: boolean
  widgetInstalled: boolean
  clientAccepted: boolean
}): string {
  const values = Object.values(checklist)
  const completed = values.filter(Boolean).length
  return `${completed} of ${values.length}`
}

function buildClientInstructions(params: {
  workspaceName: string
  clientName: string | null
  brandName: string | null
  customLogoUrl: string | null
  hideBranding: boolean
}): string {
  return [
    `Workspace: ${params.workspaceName}`,
    `Client: ${params.clientName ?? "Not set"}`,
    `Widget brand: ${params.brandName ?? params.workspaceName}`,
    `Logo URL: ${params.customLogoUrl ?? "Not configured"}`,
    `AvatarKit branding: ${params.hideBranding ? "Hidden" : "Visible"}`,
    "Before handoff: confirm avatar answers, approved knowledge, widget domain, installed script, and client sign-off."
  ].join("\n")
}

export default async function DashboardAgencyPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string }>
}) {
  const { workspaceId } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/agency"
  })

  if (!context) {
    return null
  }

  const agency = await fetchAgencyDashboardData(context)
  const canManage = canManageAgencyWorkspace(context.workspaceMembership.role)
  const workspaceIds = context.workspaceMemberships.map(member => member.workspace.id)
  const avatars = await prisma.avatar.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      status: { in: [AvatarStatus.DRAFT, AvatarStatus.READY, AvatarStatus.PUBLISHED] }
    },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      workspaceId: true,
      name: true,
      displayName: true,
      status: true
    }
  })
  const handoffInstructions = buildClientInstructions({
    workspaceName: context.workspace.name,
    clientName: agency.activeClientProfile.clientName,
    brandName: agency.activeBranding.brandName,
    customLogoUrl: agency.activeBranding.customLogoUrl,
    hideBranding: agency.activeBranding.hideAvatarKitBranding
  })

  return (
    <main className="content-area">
      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Agency workspace</p>
            <h1>Agency and White Label</h1>
            <p className="hero-copy section-subtitle">
              Manage client workspaces, duplicate avatar templates safely, configure white-label widget branding, and prepare client handoff details.
            </p>
          </div>
          <Link className="avatarkit-link-button" href="/dashboard/settings">
            Workspace settings
          </Link>
        </div>
        <div className="agency-summary-grid">
          <div>
            <span>{agency.workspaces.length}</span>
            <p>Client workspaces</p>
          </div>
          <div>
            <span>{agency.workspaces.reduce((sum, workspace) => sum + workspace.avatarCount, 0)}</span>
            <p>Total avatars</p>
          </div>
          <div>
            <span>{agency.canUseWhiteLabel ? agency.activePlan : "Plan gated"}</span>
            <p>White-label access</p>
          </div>
          <div>
            <span>{checklistProgress(agency.activeClientProfile.checklist)}</span>
            <p>Handoff checklist</p>
          </div>
        </div>
        {!canManage ? (
          <p className="form-error">
            Your role can view agency settings but cannot update client profiles, duplicate avatars, or change white-label settings.
          </p>
        ) : null}
      </section>

      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Client portfolio</p>
            <h2>Workspace overview</h2>
          </div>
        </div>
        <div className="agency-workspace-grid">
          {agency.workspaces.map(workspace => (
            <article className={workspace.id === context.workspace.id ? "agency-workspace-card agency-workspace-card-active" : "agency-workspace-card"} key={workspace.id}>
              <div className="avatar-card-header">
                <div>
                  <h3>{workspace.name}</h3>
                  <p className="avatar-meta">{workspace.slug}</p>
                </div>
                <span className="status-pill">{workspace.role}</span>
              </div>
              <dl className="readonly-grid">
                <div>
                  <dt>Client</dt>
                  <dd>{workspace.clientName ?? "Not set"}</dd>
                </div>
                <div>
                  <dt>Avatars</dt>
                  <dd>{workspace.avatarCount} total / {workspace.publishedAvatarCount} published</dd>
                </div>
                <div>
                  <dt>White label</dt>
                  <dd>{workspace.whiteLabelEnabled ? "Enabled" : "Default branding"}</dd>
                </div>
              </dl>
              <Link className="avatarkit-link-button" href={`/dashboard/agency?workspaceId=${workspace.id}`}>
                Open workspace
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="content-card">
        <div className="agency-management-grid">
          <AgencyBrandingForm
            branding={agency.activeBranding}
            canManage={canManage}
            canUseWhiteLabel={agency.canUseWhiteLabel}
          />
          <AgencyClientProfileForm
            profile={agency.activeClientProfile}
            canManage={canManage}
          />
        </div>
      </section>

      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Template workflow</p>
            <h2>Safe avatar duplication</h2>
          </div>
        </div>
        <AgencyDuplicateAvatarForm
          workspaces={agency.workspaces}
          avatars={avatars}
          canManage={canManage}
        />
      </section>

      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Client export</p>
            <h2>Setup instructions</h2>
          </div>
        </div>
        <pre className="embed-script-block">{handoffInstructions}</pre>
      </section>
    </main>
  )
}
