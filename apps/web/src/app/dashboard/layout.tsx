import Link from "next/link"
import { activateWorkspaceAction } from "@/app/actions/workspace"
import { signOutAction } from "@/app/actions/auth"
import { getDashboardContext } from "@/lib/workspace"

const navigationItems = [
  { label: "Overview", href: "/dashboard" },
  { label: "Avatars", href: "/dashboard/avatars" },
  { label: "Knowledge", href: "/dashboard/knowledge" },
  { label: "Conversations", href: "/dashboard/conversations" },
  { label: "Analytics", href: "/dashboard/analytics" },
  { label: "Leads", href: "/dashboard/leads" },
  { label: "Embed", href: "/dashboard/embed" },
  { label: "Kiosk", href: "/dashboard/kiosk" },
  { label: "Usage", href: "/dashboard/usage" },
  { label: "Billing", href: "/dashboard/billing" },
  { label: "Safety", href: "/dashboard/safety" },
  { label: "Operations", href: "/dashboard/operations" },
  { label: "Agency", href: "/dashboard/agency" },
  { label: "Developers", href: "/dashboard/developers" },
  { label: "Settings", href: "/dashboard/settings" }
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getDashboardContext("/dashboard")
  const membershipCount = context.workspaceMemberships.length
  const canSwitchWorkspace = membershipCount > 1

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div>
          <p className="eyebrow">AvatarKit AI</p>
          <h1>Workspace</h1>
          <p className="workspace-name">{context.workspace.name}</p>
          <p className="workspace-meta">{context.workspace.slug}</p>
        </div>
        <nav aria-label="Dashboard navigation">
          {navigationItems.map(item => (
            <Link className="dashboard-nav-link" href={item.href} key={item.label}>
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={activateWorkspaceAction} className="workspace-switcher">
          <label>
            Active workspace
            <select
              name="workspaceId"
              defaultValue={context.workspace.id}
              disabled={!canSwitchWorkspace}
            >
              {context.workspaceMemberships.map(member => (
                <option value={member.workspace.id} key={member.workspace.id}>
                  {member.workspace.name}
                </option>
              ))}
            </select>
          </label>
          {canSwitchWorkspace ? (
            <>
              <input type="hidden" name="next" value="/dashboard" />
              <button className="avatarkit-button avatarkit-button-primary" type="submit">
                Switch
              </button>
            </>
          ) : (
            <p className="hero-copy">You are currently in your only workspace.</p>
          )}
        </form>
        <form action={signOutAction} className="user-menu-form">
          <p className="user-label">
            Signed in as {context.user.displayName ?? context.user.email}
          </p>
          <p className="user-role">Workspace role: {context.workspaceMembership.role}</p>
          <button className="avatarkit-button avatarkit-button-secondary" type="submit">
            Sign out
          </button>
        </form>
      </aside>
      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <h2>Dashboard shell</h2>
          <p className="hero-copy">Workspace aware routing and role-aware placeholders are active.</p>
        </header>
        <div>{children}</div>
      </main>
    </div>
  )
}
