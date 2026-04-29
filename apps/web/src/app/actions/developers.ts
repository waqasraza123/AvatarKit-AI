"use server"

import { revalidatePath } from "next/cache"
import { WorkspaceRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { recordMutationAuditEvent } from "@/lib/audit"
import {
  createPublicApiKeySecret,
  createWebhookSigningSecret,
  normalizeApiKeyName,
  normalizeWebhookUrl,
  parseWebhookEvents
} from "@/lib/public-api"
import {
  RateLimitExceededError,
  assertRateLimit,
  rateLimitPolicies
} from "@/lib/rate-limit-policies"
import { getWorkspaceContextForRequest, hasWorkspaceRole } from "@/lib/workspace"

export type DeveloperActionState = {
  status: "idle" | "error" | "success"
  message?: string
  secret?: string
  fieldErrors?: Record<string, string>
}

function actionError(message: string, fieldErrors?: Record<string, string>): DeveloperActionState {
  return {
    status: "error",
    message,
    fieldErrors
  }
}

function canManageDeveloperAccess(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.ADMIN)
}

function normalizeField(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

export async function createApiKeyAction(
  _state: DeveloperActionState,
  formData: FormData
): Promise<DeveloperActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/developers" })
  if (!context) {
    return actionError("Authentication is required.")
  }

  if (!canManageDeveloperAccess(context.workspaceMembership.role)) {
    return actionError("Only owners and admins can create API keys.")
  }

  try {
    await assertRateLimit(rateLimitPolicies.apiKeyCreate, [
      context.workspace.id,
      context.user.id
    ])
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return actionError("Too many API key creation attempts. Please try again shortly.")
    }

    throw error
  }

  const normalized = normalizeApiKeyName(formData.get("name"))
  if (!normalized.name) {
    return actionError(normalized.error ?? "Enter a valid API key name.", {
      name: normalized.error ?? "Enter a valid API key name."
    })
  }

  const secret = createPublicApiKeySecret()
  const apiKey = await prisma.apiKey.create({
    data: {
      workspaceId: context.workspace.id,
      name: normalized.name,
      prefix: secret.prefix,
      keyHash: secret.keyHash,
      scopes: ["avatars:read", "conversations:write", "conversations:read", "leads:write"],
      createdByUserId: context.user.id
    },
    select: { id: true }
  })

  await recordMutationAuditEvent({
    workspaceId: context.workspace.id,
    actorUserId: context.user.id,
    eventType: "api_key.created",
    metadata: {
      apiKeyName: normalized.name,
      apiKeyId: apiKey.id,
      apiKeyPrefix: secret.prefix,
      scopes: ["avatars:read", "conversations:write", "conversations:read", "leads:write"]
    }
  })

  revalidatePath("/dashboard/developers")
  return {
    status: "success",
    message: `API key created. Copy it now; it will not be shown again. Prefix: ${secret.prefix}`,
    secret: secret.rawKey
  }
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/developers" })
  if (!context || !canManageDeveloperAccess(context.workspaceMembership.role)) {
    return
  }

  const apiKeyId = normalizeField(formData, "apiKeyId")
  if (!apiKeyId) {
    return
  }

  const updated = await prisma.apiKey.updateMany({
    where: {
      id: apiKeyId,
      workspaceId: context.workspace.id,
      revokedAt: null
    },
    data: {
      revokedAt: new Date(),
      revokedByUserId: context.user.id
    }
  })

  if (updated.count > 0) {
    await recordMutationAuditEvent({
      workspaceId: context.workspace.id,
      actorUserId: context.user.id,
      eventType: "api_key.revoked",
      metadata: { apiKeyId }
    })
  }

  revalidatePath("/dashboard/developers")
}

export async function createWebhookEndpointAction(
  _state: DeveloperActionState,
  formData: FormData
): Promise<DeveloperActionState> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/developers" })
  if (!context) {
    return actionError("Authentication is required.")
  }

  if (!canManageDeveloperAccess(context.workspaceMembership.role)) {
    return actionError("Only owners and admins can create webhook endpoints.")
  }

  const normalizedUrl = normalizeWebhookUrl(formData.get("url"))
  const description = normalizeField(formData, "description") || null
  const parsedEvents = parseWebhookEvents(formData.getAll("events"))
  const fieldErrors: Record<string, string> = {}

  if (!normalizedUrl.url) {
    fieldErrors.url = normalizedUrl.error ?? "Enter a valid webhook URL."
  }

  if (parsedEvents.error) {
    fieldErrors.events = parsedEvents.error
  }

  if (description && description.length > 120) {
    fieldErrors.description = "Description must be 120 characters or fewer."
  }

  if (Object.keys(fieldErrors).length > 0) {
    return actionError("Please fix the highlighted webhook fields.", fieldErrors)
  }

  const secret = createWebhookSigningSecret()
  const webhookEndpoint = await prisma.webhookEndpoint.create({
    data: {
      workspaceId: context.workspace.id,
      url: normalizedUrl.url,
      description,
      events: parsedEvents.events,
      signingSecretHash: secret.secretHash,
      signingSecretPrefix: secret.prefix,
      createdByUserId: context.user.id
    },
    select: { id: true }
  })

  await recordMutationAuditEvent({
    workspaceId: context.workspace.id,
    actorUserId: context.user.id,
    eventType: "webhook.created",
    metadata: {
      webhookUrl: normalizedUrl.url,
      webhookEndpointId: webhookEndpoint.id,
      webhookDescription: description,
      events: parsedEvents.events,
      signingSecretPrefix: secret.prefix
    }
  })

  revalidatePath("/dashboard/developers")
  return {
    status: "success",
    message: `Webhook endpoint created. Copy the signing secret now; it will not be shown again. Prefix: ${secret.prefix}`,
    secret: secret.rawSecret
  }
}

export async function revokeWebhookEndpointAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContextForRequest({ nextPath: "/dashboard/developers" })
  if (!context || !canManageDeveloperAccess(context.workspaceMembership.role)) {
    return
  }

  const webhookEndpointId = normalizeField(formData, "webhookEndpointId")
  if (!webhookEndpointId) {
    return
  }

  const updated = await prisma.webhookEndpoint.updateMany({
    where: {
      id: webhookEndpointId,
      workspaceId: context.workspace.id,
      revokedAt: null
    },
    data: {
      revokedAt: new Date(),
      revokedByUserId: context.user.id
    }
  })

  if (updated.count > 0) {
    await recordMutationAuditEvent({
      workspaceId: context.workspace.id,
      actorUserId: context.user.id,
      eventType: "webhook.revoked",
      metadata: { webhookEndpointId }
    })
  }

  revalidatePath("/dashboard/developers")
}
