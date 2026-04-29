"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { hashPassword, verifyPassword } from "@/lib/password"
import { prisma } from "@/lib/prisma"
import {
  RateLimitExceededError,
  assertRateLimit,
  rateLimitPolicies
} from "@/lib/rate-limit-policies"
import { createSessionForUser, clearSessionCookie } from "@/lib/session"

export type AuthActionState = {
  status: "idle" | "error"
  message?: string
}

function normalizeRedirect(next?: FormDataEntryValue | null): string {
  const defaultPath = "/dashboard"
  if (typeof next !== "string") {
    return defaultPath
  }

  if (!next.startsWith("/")) {
    return defaultPath
  }

  if (next.startsWith("//")) {
    return defaultPath
  }

  return next
}

async function requestIp(): Promise<string> {
  const headerList = await headers()
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip")?.trim() ||
    "unknown"
}

export async function signInAction(
  _state: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const next = normalizeRedirect(formData.get("next"))

  try {
    await assertRateLimit(rateLimitPolicies.authAttempt, ["sign-in", rawEmail || "unknown", await requestIp()])
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return { status: "error", message: "Too many requests. Please try again shortly." }
    }

    throw error
  }

  if (!rawEmail || !rawEmail.includes("@")) {
    return { status: "error", message: "Enter a valid email address." }
  }

  if (password.length < 10) {
    return { status: "error", message: "Password must be at least 10 characters." }
  }

  const user = await prisma.user.findUnique({
    where: { email: rawEmail }
  })

  if (!user) {
    return { status: "error", message: "Invalid credentials." }
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return { status: "error", message: "Invalid credentials." }
  }

  await createSessionForUser(user.id)

  const workspaceCount = await prisma.workspaceMember.count({ where: { userId: user.id } })
  if (workspaceCount === 0) {
    redirect("/onboarding/workspace")
  }

  redirect(next)
}

export async function signUpAction(
  _state: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase()
  const displayName = String(formData.get("displayName") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const confirmPassword = String(formData.get("confirmPassword") ?? "")
  const next = normalizeRedirect(formData.get("next"))

  try {
    await assertRateLimit(rateLimitPolicies.authAttempt, ["sign-up", rawEmail || "unknown", await requestIp()])
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return { status: "error", message: "Too many requests. Please try again shortly." }
    }

    throw error
  }

  if (!rawEmail || !rawEmail.includes("@")) {
    return { status: "error", message: "Enter a valid email address." }
  }

  if (!displayName || displayName.length < 2) {
    return { status: "error", message: "Display name must be at least 2 characters." }
  }

  if (password.length < 10) {
    return { status: "error", message: "Password must be at least 10 characters." }
  }

  if (password !== confirmPassword) {
    return { status: "error", message: "Passwords do not match." }
  }

  const existing = await prisma.user.findUnique({ where: { email: rawEmail } })
  if (existing) {
    return { status: "error", message: "Email is already in use." }
  }

  const passwordHash = hashPassword(password)
  const user = await prisma.user.create({
    data: {
      email: rawEmail,
      displayName,
      passwordHash
    }
  })

  await createSessionForUser(user.id)

  const workspaceCount = await prisma.workspaceMember.count({ where: { userId: user.id } })
  if (workspaceCount === 0) {
    redirect("/onboarding/workspace")
  }

  redirect(next)
}

export async function signOutAction() {
  await clearSessionCookie()
  redirect("/sign-in")
}
