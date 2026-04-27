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
