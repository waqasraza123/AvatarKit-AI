import { AvatarStatus, BillingPlan, WorkspaceRole, type Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { hasWorkspaceRole, type DashboardContext } from "@/lib/workspace"

export type AgencyWorkspaceSummary = {
  id: string
  name: string
  slug: string
  role: WorkspaceRole
  avatarCount: number
  publishedAvatarCount: number
  clientName: string | null
  whiteLabelEnabled: boolean
}

export type WorkspaceBrandingRecord = {
  id: string
  workspaceId: string
  brandName: string | null
  customLogoUrl: string | null
  widgetAccentColor: string | null
  hideAvatarKitBranding: boolean
}

export type WorkspaceClientProfileRecord = {
  id: string
  workspaceId: string
  clientName: string | null
  clientContactName: string | null
  clientContactEmail: string | null
  handoffNotes: string | null
  checklist: AgencyHandoffChecklist
}

export type AgencyHandoffChecklist = {
  avatarReviewed: boolean
  knowledgeReviewed: boolean
  domainConfigured: boolean
  widgetInstalled: boolean
  clientAccepted: boolean
}

export type AgencyDashboardData = {
  workspaces: AgencyWorkspaceSummary[]
  activeBranding: WorkspaceBrandingRecord
  activeClientProfile: WorkspaceClientProfileRecord
  activePlan: BillingPlan
  canUseWhiteLabel: boolean
}

export type AgencyBrandingInput = {
  brandName: string | null
  customLogoUrl: string | null
  widgetAccentColor: string | null
  hideAvatarKitBranding: boolean
  errors: Record<string, string>
}

export type AgencyClientProfileInput = {
  clientName: string | null
  clientContactName: string | null
  clientContactEmail: string | null
  handoffNotes: string | null
  checklist: AgencyHandoffChecklist
  errors: Record<string, string>
}

export type AgencyDuplicateInput = {
  sourceWorkspaceId: string
  sourceAvatarId: string
  targetWorkspaceId: string
  newName: string
  newDisplayName: string
  copyBehavior: boolean
  copyVoice: boolean
  errors: Record<string, string>
}

const BRAND_NAME_MAX_LENGTH = 80
const CLIENT_NAME_MAX_LENGTH = 120
const CONTACT_NAME_MAX_LENGTH = 120
const CONTACT_EMAIL_MAX_LENGTH = 254
const HANDOFF_NOTES_MAX_LENGTH = 2000
const AVATAR_NAME_MAX_LENGTH = 120
const DISPLAY_NAME_MAX_LENGTH = 140

const defaultChecklist: AgencyHandoffChecklist = {
  avatarReviewed: false,
  knowledgeReviewed: false,
  domainConfigured: false,
  widgetInstalled: false,
  clientAccepted: false
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim()
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  const text = normalizeText(value).replace(/\s+/g, " ")
  if (!text) {
    return null
  }

  return text.length <= maxLength ? text : null
}

function normalizeMultilineText(value: unknown, maxLength: number): string | null {
  const text = normalizeText(value)
  if (!text) {
    return null
  }

  return text.length <= maxLength ? text : null
}

function normalizeColor(value: unknown): string | null {
  const raw = normalizeText(value)
  if (!raw) {
    return null
  }

  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.toLowerCase()
  }

  return null
}

function normalizeHttpsUrl(value: unknown): { url: string | null; error: string | null } {
  const raw = normalizeText(value)
  if (!raw) {
    return { url: null, error: null }
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { url: null, error: "Enter a valid URL." }
  }

  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    return { url: null, error: "Use HTTPS outside local development." }
  }

  parsed.hash = ""
  return { url: parsed.toString(), error: null }
}

function normalizeEmail(value: unknown): string | null {
  const email = normalizeText(value).toLowerCase()
  if (!email) {
    return null
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= CONTACT_EMAIL_MAX_LENGTH
    ? email
    : null
}

function checklistFromJson(value: Prisma.JsonValue | null): AgencyHandoffChecklist {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultChecklist
  }

  const record = value as Record<string, unknown>
  return {
    avatarReviewed: record.avatarReviewed === true,
    knowledgeReviewed: record.knowledgeReviewed === true,
    domainConfigured: record.domainConfigured === true,
    widgetInstalled: record.widgetInstalled === true,
    clientAccepted: record.clientAccepted === true
  }
}

function brandingRecord(row: {
  id: string
  workspaceId: string
  brandName: string | null
  customLogoUrl: string | null
  widgetAccentColor: string | null
  hideAvatarKitBranding: boolean
}): WorkspaceBrandingRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    brandName: row.brandName,
    customLogoUrl: row.customLogoUrl,
    widgetAccentColor: row.widgetAccentColor,
    hideAvatarKitBranding: row.hideAvatarKitBranding
  }
}

function clientProfileRecord(row: {
  id: string
  workspaceId: string
  clientName: string | null
  clientContactName: string | null
  clientContactEmail: string | null
  handoffNotes: string | null
  checklist: Prisma.JsonValue | null
}): WorkspaceClientProfileRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    clientName: row.clientName,
    clientContactName: row.clientContactName,
    clientContactEmail: row.clientContactEmail,
    handoffNotes: row.handoffNotes,
    checklist: checklistFromJson(row.checklist)
  }
}

export function canManageAgencyWorkspace(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, WorkspaceRole.OPERATOR)
}

export function canUseWhiteLabelPlan(plan: BillingPlan | string | null | undefined): boolean {
  return plan === BillingPlan.AGENCY || plan === BillingPlan.ENTERPRISE || plan === "AGENCY" || plan === "ENTERPRISE"
}

export async function fetchOrCreateWorkspaceBranding(workspaceId: string): Promise<WorkspaceBrandingRecord> {
  const existing = await prisma.workspaceBranding.findUnique({
    where: { workspaceId }
  })

  if (existing) {
    return brandingRecord(existing)
  }

  const created = await prisma.workspaceBranding.create({
    data: { workspaceId }
  })

  return brandingRecord(created)
}

export async function fetchWorkspaceBrandingOrDefault(workspaceId: string): Promise<WorkspaceBrandingRecord> {
  const existing = await prisma.workspaceBranding.findUnique({
    where: { workspaceId }
  })

  if (existing) {
    return brandingRecord(existing)
  }

  return {
    id: "",
    workspaceId,
    brandName: null,
    customLogoUrl: null,
    widgetAccentColor: null,
    hideAvatarKitBranding: false
  }
}

export async function fetchOrCreateWorkspaceClientProfile(workspaceId: string): Promise<WorkspaceClientProfileRecord> {
  const existing = await prisma.workspaceClientProfile.findUnique({
    where: { workspaceId }
  })

  if (existing) {
    return clientProfileRecord(existing)
  }

  const created = await prisma.workspaceClientProfile.create({
    data: {
      workspaceId,
      checklist: defaultChecklist
    }
  })

  return clientProfileRecord(created)
}

export async function fetchAgencyDashboardData(context: DashboardContext): Promise<AgencyDashboardData> {
  const workspaceIds = context.workspaceMemberships.map(member => member.workspace.id)
  const [workspaceRows, activeBranding, activeClientProfile, billingAccount] = await Promise.all([
    prisma.workspace.findMany({
      where: { id: { in: workspaceIds } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        branding: true,
        clientProfile: true,
        _count: {
          select: { avatars: true }
        },
        avatars: {
          where: { status: AvatarStatus.PUBLISHED },
          select: { id: true }
        }
      }
    }),
    fetchOrCreateWorkspaceBranding(context.workspace.id),
    fetchOrCreateWorkspaceClientProfile(context.workspace.id),
    prisma.billingAccount.findUnique({
      where: { workspaceId: context.workspace.id },
      select: { plan: true }
    })
  ])
  const membershipRoleByWorkspace = new Map(context.workspaceMemberships.map(member => [
    member.workspace.id,
    member.role
  ]))
  const activePlan = billingAccount?.plan ?? BillingPlan.FREE

  return {
    workspaces: workspaceRows.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: membershipRoleByWorkspace.get(workspace.id) ?? WorkspaceRole.VIEWER,
      avatarCount: workspace._count.avatars,
      publishedAvatarCount: workspace.avatars.length,
      clientName: workspace.clientProfile?.clientName ?? null,
      whiteLabelEnabled: Boolean(workspace.branding?.hideAvatarKitBranding)
    })),
    activeBranding,
    activeClientProfile,
    activePlan,
    canUseWhiteLabel: canUseWhiteLabelPlan(activePlan)
  }
}

export function parseAgencyBrandingInput(formData: FormData, canUseWhiteLabel: boolean): AgencyBrandingInput {
  const brandName = normalizeOptionalText(formData.get("brandName"), BRAND_NAME_MAX_LENGTH)
  const customLogo = normalizeHttpsUrl(formData.get("customLogoUrl"))
  const widgetAccentColor = normalizeColor(formData.get("widgetAccentColor"))
  const hideAvatarKitBranding = formData.get("hideAvatarKitBranding") === "on"
  const errors: Record<string, string> = {}

  if (normalizeText(formData.get("brandName")) && !brandName) {
    errors.brandName = `Brand name must be ${BRAND_NAME_MAX_LENGTH} characters or fewer.`
  }

  if (normalizeText(formData.get("customLogoUrl")) && customLogo.error) {
    errors.customLogoUrl = customLogo.error
  }

  if (normalizeText(formData.get("widgetAccentColor")) && !widgetAccentColor) {
    errors.widgetAccentColor = "Use a 6-digit hex color such as #355cff."
  }

  if (hideAvatarKitBranding && !canUseWhiteLabel) {
    errors.hideAvatarKitBranding = "AvatarKit branding can be hidden only on Agency or Enterprise plans."
  }

  return {
    brandName,
    customLogoUrl: customLogo.url,
    widgetAccentColor,
    hideAvatarKitBranding,
    errors
  }
}

export function parseAgencyClientProfileInput(formData: FormData): AgencyClientProfileInput {
  const clientName = normalizeOptionalText(formData.get("clientName"), CLIENT_NAME_MAX_LENGTH)
  const clientContactName = normalizeOptionalText(formData.get("clientContactName"), CONTACT_NAME_MAX_LENGTH)
  const clientContactEmail = normalizeEmail(formData.get("clientContactEmail"))
  const handoffNotes = normalizeMultilineText(formData.get("handoffNotes"), HANDOFF_NOTES_MAX_LENGTH)
  const errors: Record<string, string> = {}

  if (normalizeText(formData.get("clientName")) && !clientName) {
    errors.clientName = `Client name must be ${CLIENT_NAME_MAX_LENGTH} characters or fewer.`
  }

  if (normalizeText(formData.get("clientContactName")) && !clientContactName) {
    errors.clientContactName = `Contact name must be ${CONTACT_NAME_MAX_LENGTH} characters or fewer.`
  }

  if (normalizeText(formData.get("clientContactEmail")) && !clientContactEmail) {
    errors.clientContactEmail = "Enter a valid contact email."
  }

  if (normalizeText(formData.get("handoffNotes")) && !handoffNotes) {
    errors.handoffNotes = `Handoff notes must be ${HANDOFF_NOTES_MAX_LENGTH} characters or fewer.`
  }

  return {
    clientName,
    clientContactName,
    clientContactEmail,
    handoffNotes,
    checklist: {
      avatarReviewed: formData.get("avatarReviewed") === "on",
      knowledgeReviewed: formData.get("knowledgeReviewed") === "on",
      domainConfigured: formData.get("domainConfigured") === "on",
      widgetInstalled: formData.get("widgetInstalled") === "on",
      clientAccepted: formData.get("clientAccepted") === "on"
    },
    errors
  }
}

export function parseAgencyDuplicateInput(formData: FormData): AgencyDuplicateInput {
  const sourceWorkspaceId = normalizeText(formData.get("sourceWorkspaceId"))
  const sourceAvatarId = normalizeText(formData.get("sourceAvatarId"))
  const targetWorkspaceId = normalizeText(formData.get("targetWorkspaceId"))
  const newName = normalizeText(formData.get("newName"))
  const newDisplayName = normalizeText(formData.get("newDisplayName"))
  const errors: Record<string, string> = {}

  if (!sourceWorkspaceId) {
    errors.sourceWorkspaceId = "Source workspace is required."
  }

  if (!sourceAvatarId) {
    errors.sourceAvatarId = "Source avatar is required."
  }

  if (!targetWorkspaceId) {
    errors.targetWorkspaceId = "Target workspace is required."
  }

  if (!newName) {
    errors.newName = "New avatar name is required."
  } else if (newName.length > AVATAR_NAME_MAX_LENGTH) {
    errors.newName = `Avatar name must be ${AVATAR_NAME_MAX_LENGTH} characters or fewer.`
  }

  if (!newDisplayName) {
    errors.newDisplayName = "New display name is required."
  } else if (newDisplayName.length > DISPLAY_NAME_MAX_LENGTH) {
    errors.newDisplayName = `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`
  }

  return {
    sourceWorkspaceId,
    sourceAvatarId,
    targetWorkspaceId,
    newName,
    newDisplayName,
    copyBehavior: formData.get("copyBehavior") === "on",
    copyVoice: formData.get("copyVoice") === "on",
    errors
  }
}

export async function allocateAvatarName(workspaceId: string, requestedName: string): Promise<string> {
  const existing = await prisma.avatar.findMany({
    where: {
      workspaceId,
      name: { startsWith: requestedName, mode: "insensitive" }
    },
    select: { name: true }
  })
  const taken = new Set(existing.map(avatar => avatar.name.toLowerCase()))
  if (!taken.has(requestedName.toLowerCase())) {
    return requestedName
  }

  let counter = 2
  let candidate = `${requestedName} ${counter}`
  while (taken.has(candidate.toLowerCase())) {
    counter += 1
    candidate = `${requestedName} ${counter}`
  }

  return candidate
}
