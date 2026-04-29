import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const configuredStorageRoot = process.env.LOCAL_STORAGE_ROOT || process.env.AVATAR_ASSET_STORAGE_ROOT
const storageRoot = configuredStorageRoot
  ? path.resolve(configuredStorageRoot)
  : path.join(process.cwd(), ".data", "uploads", "avatar-assets")

function assertSafeStorageKey(storageKey: string): void {
  const segments = storageKey.split("/")

  if (segments.some(segment => !segment || segment === "." || segment === "..")) {
    throw new Error("Invalid storage key.")
  }

  if (path.isAbsolute(storageKey)) {
    throw new Error("Invalid storage key.")
  }

  if (!/^[a-zA-Z0-9/._-]+$/.test(storageKey)) {
    throw new Error("Invalid storage key.")
  }
}

function assertInsideStorageRoot(filePath: string): void {
  const relativePath = path.relative(storageRoot, filePath)
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid storage path.")
  }
}

export function getAvatarAssetStorageRoot(): string {
  return storageRoot
}

export function buildAvatarPhotoStorageKey(params: {
  workspaceId: string
  avatarId: string
  assetId: string
  fileExtension: string
}): string {
  return `workspaces/${params.workspaceId}/avatars/${params.avatarId}/${params.assetId}.${params.fileExtension}`
}

export function buildAvatarPhotoDisplayUrl(assetId: string): string {
  return `/api/avatar-assets/${assetId}/preview`
}

export function buildAvatarAudioStorageKey(params: {
  workspaceId: string
  avatarId: string
  conversationId: string
  messageId: string
  assetId: string
  fileExtension: string
}): string {
  return `workspaces/${params.workspaceId}/avatars/${params.avatarId}/conversations/${params.conversationId}/messages/${params.messageId}/audio/${params.assetId}.${params.fileExtension}`
}

export function buildAvatarAudioDisplayUrl(assetId: string): string {
  return `/api/avatar-assets/${assetId}/preview`
}

export function buildAvatarVideoStorageKey(params: {
  workspaceId: string
  avatarId: string
  conversationId: string
  messageId: string
  assetId: string
  fileExtension: string
}): string {
  return `workspaces/${params.workspaceId}/avatars/${params.avatarId}/conversations/${params.conversationId}/messages/${params.messageId}/video/${params.assetId}.${params.fileExtension}`
}

export function buildAvatarVideoDisplayUrl(assetId: string): string {
  return `/api/avatar-assets/${assetId}/preview`
}

export function buildAvatarVoiceInputStorageKey(params: {
  workspaceId: string
  avatarId: string
  conversationId: string
  messageId: string
  assetId: string
  fileExtension: string
}): string {
  return `workspaces/${params.workspaceId}/avatars/${params.avatarId}/conversations/${params.conversationId}/messages/${params.messageId}/voice-input/${params.assetId}.${params.fileExtension}`
}

export function buildAvatarVoiceInputDisplayUrl(assetId: string): string {
  return `/api/avatar-assets/${assetId}/preview`
}

export function resolveAvatarAssetPath(storageKey: string): string {
  assertSafeStorageKey(storageKey)
  const filePath = path.join(storageRoot, storageKey)
  assertInsideStorageRoot(filePath)
  return filePath
}

export async function writeAvatarAssetToDisk(params: {
  storageKey: string
  content: Buffer
}): Promise<void> {
  const filePath = resolveAvatarAssetPath(params.storageKey)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, params.content)
}

export async function readAvatarAssetFromDisk(storageKey: string): Promise<Buffer> {
  const filePath = resolveAvatarAssetPath(storageKey)
  return readFile(filePath)
}

export async function deleteAvatarAssetFromDisk(storageKey: string): Promise<void> {
  const filePath = resolveAvatarAssetPath(storageKey)
  await rm(filePath, { force: true })
}
