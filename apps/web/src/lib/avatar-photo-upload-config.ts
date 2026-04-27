export type AvatarPhotoUploadLimits = {
  maxFileSizeBytes: number
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}

const DEFAULT_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024
const DEFAULT_MIN_WIDTH = 512
const DEFAULT_MIN_HEIGHT = 512
const DEFAULT_MAX_WIDTH = 6000
const DEFAULT_MAX_HEIGHT = 6000

function toInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

export function getAvatarPhotoUploadLimits(): AvatarPhotoUploadLimits {
  return {
    maxFileSizeBytes: toInteger(process.env.AVATAR_PHOTO_MAX_FILE_SIZE_BYTES, DEFAULT_MAX_FILE_SIZE_BYTES),
    minWidth: toInteger(process.env.AVATAR_PHOTO_MIN_WIDTH, DEFAULT_MIN_WIDTH),
    minHeight: toInteger(process.env.AVATAR_PHOTO_MIN_HEIGHT, DEFAULT_MIN_HEIGHT),
    maxWidth: toInteger(process.env.AVATAR_PHOTO_MAX_WIDTH, DEFAULT_MAX_WIDTH),
    maxHeight: toInteger(process.env.AVATAR_PHOTO_MAX_HEIGHT, DEFAULT_MAX_HEIGHT)
  }
}

export function formatUploadLimitLabel(value: number): string {
  if (value >= 1024 * 1024) {
    return `${value / (1024 * 1024)}MB`
  }

  if (value >= 1024) {
    return `${value / 1024}KB`
  }

  return `${value}B`
}
