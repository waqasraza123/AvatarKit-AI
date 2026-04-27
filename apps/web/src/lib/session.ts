import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { prisma } from "./prisma"

const sessionCookieName = "avatarkit_session"
const activeWorkspaceCookieName = "avatarkit_active_workspace"
const sessionDurationDays = 14
const workspaceCookieDurationDays = 30

function isSecureCookie(): boolean {
  return process.env.NODE_ENV === "production"
}

function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
    maxAge: Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 1000))
  }
}

export function generateSessionToken(): string {
  return randomBytes(48).toString("hex")
}

export async function createSessionForUser(userId: string): Promise<string> {
  const token = generateSessionToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + sessionDurationDays)

  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt
    }
  })

  const store = await cookies()
  store.set(sessionCookieName, token, sessionCookieOptions(expiresAt))
  return token
}

export async function clearSessionCookie() {
  const store = await cookies()
  const token = store.get(sessionCookieName)?.value
  store.delete(sessionCookieName)
  store.set(activeWorkspaceCookieName, "", { maxAge: 0, path: "/" })

  if (token) {
    await prisma.session.deleteMany({
      where: { token }
    })
  }
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(sessionCookieName)?.value ?? null
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  const store = await cookies()
  return store.get(activeWorkspaceCookieName)?.value ?? null
}

export async function setActiveWorkspaceId(workspaceId: string): Promise<void> {
  const store = await cookies()
  store.set({
    name: activeWorkspaceCookieName,
    value: workspaceId,
    path: "/",
    secure: isSecureCookie(),
    sameSite: "lax",
    maxAge: workspaceCookieDurationDays * 24 * 60 * 60
  })
}

export async function clearActiveWorkspaceId(): Promise<void> {
  const store = await cookies()
  store.delete(activeWorkspaceCookieName)
}
