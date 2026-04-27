import { redirect } from "next/navigation"
import { WorkspaceRole } from "@prisma/client"
import { prisma } from "./prisma"
import { getActiveWorkspaceId, getSessionToken, setActiveWorkspaceId } from "./session"

export type UserIdentity = {
  id: string
  email: string
  displayName: string | null
}

type WorkspaceRoleType = WorkspaceRole

export type WorkspaceSummary = {
  id: string
  name: string
  slug: string
}

export type WorkspaceMembership = {
  id: string
  role: WorkspaceRoleType
  workspace: WorkspaceSummary
}

export type DashboardContext = {
  user: UserIdentity
  workspace: WorkspaceSummary
  workspaceMembership: WorkspaceMembership
  workspaceMemberships: WorkspaceMembership[]
}

const rolePriority: Record<WorkspaceRoleType, number> = {
  OWNER: 3,
  ADMIN: 2,
  OPERATOR: 1,
  VIEWER: 0
}

export function hasWorkspaceRole(role: WorkspaceRoleType, minimumRole: WorkspaceRoleType): boolean {
  return rolePriority[role] >= rolePriority[minimumRole]
}

function isSafeLocalPath(path: string | null): string {
  if (!path) {
    return "/dashboard"
  }

  if (!path.startsWith("/")) {
    return "/dashboard"
  }

  if (path.startsWith("//")) {
    return "/dashboard"
  }

  return path
}

function mapWorkspaceMembership(
  membership: {
    id: string
    role: WorkspaceRoleType
    workspace: {
      id: string
      name: string
      slug: string
    }
  }
): WorkspaceMembership {
  return {
    id: membership.id,
    role: membership.role,
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug
    }
  }
}

async function getWorkspaceMembershipsForUser(userId: string) {
  return prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: true
    },
    orderBy: { createdAt: "asc" }
  })
}

export async function getCurrentUser(): Promise<UserIdentity | null> {
  const token = await getSessionToken()
  if (!token) {
    return null
  }

  const now = new Date()
  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true
        }
      }
    }
  })

  if (!session) {
    return null
  }

  if (session.expiresAt <= now) {
    await prisma.session.deleteMany({
      where: { token }
    })
    return null
  }

  return session.user
}

export async function requireAuthenticatedUser(nextPath: string | null = null): Promise<UserIdentity> {
  const user = await getCurrentUser()

  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(isSafeLocalPath(nextPath))}`)
  }

  return user
}

function buildDashboardContext(
  user: UserIdentity,
  memberships: Awaited<ReturnType<typeof getWorkspaceMembershipsForUser>>,
  selectedWorkspaceId: string | null
): DashboardContext {
  const selectedMembership =
    memberships.find(member => member.workspaceId === selectedWorkspaceId) ??
    memberships[0]

  if (!selectedMembership) {
    redirect("/onboarding/workspace")
  }

  const workspaceMembership = mapWorkspaceMembership(selectedMembership)

  return {
    user,
    workspace: workspaceMembership.workspace,
    workspaceMembership,
    workspaceMemberships: memberships.map(mapWorkspaceMembership)
  }
}

export async function getCurrentWorkspace(): Promise<WorkspaceSummary | null> {
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

  const memberships = await getWorkspaceMembershipsForUser(user.id)
  if (memberships.length === 0) {
    return null
  }

  const activeWorkspaceId = await getActiveWorkspaceId()
  return buildDashboardContext(user, memberships, activeWorkspaceId).workspace
}

export async function getCurrentWorkspaceMembership(): Promise<WorkspaceMembership | null> {
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

  const memberships = await getWorkspaceMembershipsForUser(user.id)
  if (memberships.length === 0) {
    return null
  }

  const activeWorkspaceId = await getActiveWorkspaceId()
  return buildDashboardContext(user, memberships, activeWorkspaceId).workspaceMembership
}

export async function requireWorkspaceMembership(
  workspaceId: string
): Promise<WorkspaceMembership> {
  const user = await requireAuthenticatedUser("/dashboard")
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id
      }
    },
    include: { workspace: true }
  })

  if (!membership) {
    redirect("/dashboard?error=workspace_forbidden")
  }

  return mapWorkspaceMembership(membership)
}

export async function getDashboardContext(nextPath = "/dashboard"): Promise<DashboardContext> {
  const user = await requireAuthenticatedUser(nextPath)
  const memberships = await getWorkspaceMembershipsForUser(user.id)

  if (memberships.length === 0) {
    redirect("/onboarding/workspace")
  }

  const activeWorkspaceId = await getActiveWorkspaceId()
  const context = buildDashboardContext(user, memberships, activeWorkspaceId)
  if (context.workspace.id !== activeWorkspaceId) {
    await setActiveWorkspaceId(context.workspace.id)
  }

  return context
}

type WorkspaceRequirement = {
  requestedWorkspaceId?: string
  nextPath?: string
  requireWorkspace?: boolean
}

export async function getWorkspaceContextForRequest({
  requestedWorkspaceId,
  nextPath = "/dashboard",
  requireWorkspace = true
}: WorkspaceRequirement = {}): Promise<DashboardContext | null> {
  const user = await requireAuthenticatedUser(nextPath)
  const memberships = await getWorkspaceMembershipsForUser(user.id)

  if (memberships.length === 0) {
    if (requireWorkspace) {
      redirect("/onboarding/workspace")
    }

    return null
  }

  const activeWorkspaceId = await getActiveWorkspaceId()

  if (
    requestedWorkspaceId &&
    !memberships.some(member => member.workspaceId === requestedWorkspaceId)
  ) {
    redirect("/dashboard?error=workspace_forbidden")
  }

  const selectedWorkspaceId = memberships.find(member => member.workspaceId === requestedWorkspaceId)?.workspaceId ?? activeWorkspaceId ?? memberships[0].workspaceId
  const context = buildDashboardContext(user, memberships, selectedWorkspaceId)

  if (context.workspace.id !== activeWorkspaceId) {
    await setActiveWorkspaceId(context.workspace.id)
  }

  return context
}

function parseWorkspaceSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .replace(/-+/g, "-")
}

export async function generateSafeWorkspaceSlug(baseName: string) {
  const base = parseWorkspaceSlug(baseName) || "workspace"
  const taken = new Set(
    (await prisma.workspace.findMany({ select: { slug: true } })).map(workspace => workspace.slug)
  )

  if (!taken.has(base)) {
    return base
  }

  let candidate = `${base}-1`
  let counter = 1

  while (taken.has(candidate)) {
    counter += 1
    candidate = `${base}-${counter}`
  }

  return candidate
}
