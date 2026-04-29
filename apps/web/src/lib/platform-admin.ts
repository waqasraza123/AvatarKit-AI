import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser, requireAuthenticatedUser } from "@/lib/workspace"

export type PlatformAdminContext = {
  user: {
    id: string
    email: string
    displayName: string | null
    isPlatformAdmin: boolean
  }
}

function platformAdminEmailSet(): Set<string> {
  return new Set(
    String(process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map(email => email.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function isPlatformAdminUser(user: { email: string; isPlatformAdmin?: boolean | null } | null | undefined): boolean {
  if (!user) {
    return false
  }

  if (user.isPlatformAdmin) {
    return true
  }

  return platformAdminEmailSet().has(user.email.trim().toLowerCase())
}

export async function getPlatformAdminContext(): Promise<PlatformAdminContext | null> {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: {
      id: true,
      email: true,
      displayName: true,
      isPlatformAdmin: true
    }
  })

  if (!isPlatformAdminUser(user)) {
    return null
  }

  return {
    user: user ?? {
      id: currentUser.id,
      email: currentUser.email,
      displayName: currentUser.displayName,
      isPlatformAdmin: false
    }
  }
}

export async function requirePlatformAdmin(nextPath = "/admin"): Promise<PlatformAdminContext> {
  const authenticatedUser = await requireAuthenticatedUser(nextPath)
  const user = await prisma.user.findUnique({
    where: { id: authenticatedUser.id },
    select: {
      id: true,
      email: true,
      displayName: true,
      isPlatformAdmin: true
    }
  })

  if (!isPlatformAdminUser(user)) {
    redirect("/dashboard?error=platform_admin_required")
  }

  return {
    user: user ?? {
      id: authenticatedUser.id,
      email: authenticatedUser.email,
      displayName: authenticatedUser.displayName,
      isPlatformAdmin: false
    }
  }
}

export async function assertPlatformAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      isPlatformAdmin: true
    }
  })

  if (!isPlatformAdminUser(user)) {
    throw new Error("Platform admin access is required.")
  }
}
