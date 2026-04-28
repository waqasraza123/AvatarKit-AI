import { z } from "zod"

export const workspaceRoleSchema = z.enum(["OWNER", "ADMIN", "OPERATOR", "VIEWER"])

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export type User = z.infer<typeof userSchema>

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export type Workspace = z.infer<typeof workspaceSchema>

export const workspaceMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  role: workspaceRoleSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>

export const healthResponseSchema = z.object({
  service: z.string().min(1),
  status: z.literal("ok"),
  timestamp: z.string().datetime()
})

export type HealthResponse = z.infer<typeof healthResponseSchema>

export const authSessionSchema = z.object({
  user: userSchema,
  workspaceId: z.string().nullable()
})

export type AuthSession = z.infer<typeof authSessionSchema>

export const avatarKitOutputModeSchema = z.enum(["text", "audio", "video"])

export type AvatarKitOutputMode = z.infer<typeof avatarKitOutputModeSchema>

export const publicApiAvatarConfigSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  role: z.string(),
  useCase: z.string(),
  language: z.string(),
  status: z.string(),
  supportedOutputModes: z.array(avatarKitOutputModeSchema),
  defaultOutputMode: avatarKitOutputModeSchema,
  publishedAt: z.string().datetime().nullable()
})

export type PublicApiAvatarConfig = z.infer<typeof publicApiAvatarConfigSchema>

export const publicApiConversationSchema = z.object({
  conversationId: z.string(),
  avatarId: z.string(),
  visitorId: z.string().nullable(),
  status: z.string(),
  createdAt: z.string().datetime()
})

export type PublicApiConversation = z.infer<typeof publicApiConversationSchema>

export const publicApiMessageSchema = z.object({
  id: z.string(),
  content: z.string(),
  audioUrl: z.string().nullable(),
  videoUrl: z.string().nullable(),
  outputMode: avatarKitOutputModeSchema,
  runtimeStatus: z.string(),
  leadCapture: z.unknown()
})

export type PublicApiMessage = z.infer<typeof publicApiMessageSchema>

export const publicApiErrorSchema = z.object({
  status: z.literal("error"),
  code: z.string(),
  message: z.string()
})

export type PublicApiError = z.infer<typeof publicApiErrorSchema>
