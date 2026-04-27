import {
  AvatarAssetValidationStatus
} from "@prisma/client"
import { getAvatarPhotoUploadLimits } from "./avatar-photo-upload-config"

export const ALLOWED_AVATAR_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export const READABLE_AVATAR_PHOTO_SIZE_LIMITS = {
  label: "Upload a JPG, PNG, or WEBP image.",
  oversizedLabel: "Image is too large.",
  tooSmallLabel: "Image must be at least 512×512.",
  unreadableLabel: "We could not read this image."
}

export type AvatarPhotoValidationResult = {
  ok: boolean
  status: AvatarAssetValidationStatus
  validationIssues: string[]
  width?: number
  height?: number
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    default:
      return "bin"
  }
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) {
    return null
  }

  if (
    buffer.readUInt32BE(0) !== 0x89504e47 ||
    buffer.readUInt32BE(4) !== 0x0d0a1a0a
  ) {
    return null
  }

  if (buffer.readUInt32BE(12) !== 0x49484452) {
    return null
  }

  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  return { width, height }
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4) {
    return null
  }

  if (buffer.readUInt16BE(0) !== 0xffd8) {
    return null
  }

  let offset = 2
  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xff) {
      return null
    }

    let marker = buffer[offset + 1]
    if (marker === 0xd9 || marker === 0xda) {
      return null
    }

    offset += 2
    const markerLength = buffer.readUInt16BE(offset)
    if (!markerLength || offset + markerLength > buffer.length) {
      return null
    }

    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb
    ) {
      if (markerLength < 7) {
        return null
      }

      const height = buffer.readUInt16BE(offset + 3)
      const width = buffer.readUInt16BE(offset + 5)
      return { width, height }
    }

    offset += markerLength
  }

  return null
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16)
}

function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 30) {
    return null
  }

  if (
    buffer.readUInt32BE(0) !== 0x52494646 ||
    buffer.readUInt32BE(8) !== 0x57454250
  ) {
    return null
  }

  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("utf8", offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkDataOffset = offset + 8

    if (chunkDataOffset + chunkSize > buffer.length) {
      return null
    }

    if (chunkType === "VP8X") {
      if (chunkSize !== 10) {
        return null
      }
      const width = readUInt24LE(buffer, chunkDataOffset + 4) + 1
      const height = readUInt24LE(buffer, chunkDataOffset + 7) + 1
      return { width, height }
    }

    if (chunkType === "VP8 ") {
      if (chunkSize < 10) {
        return null
      }
      const width = (buffer.readUInt16LE(chunkDataOffset + 6) & 0x3fff)
      const height = (buffer.readUInt16LE(chunkDataOffset + 8) & 0x3fff)
      return { width, height }
    }

    if (chunkType === "VP8L") {
      if (chunkSize < 10 || buffer[chunkDataOffset] !== 0x2f) {
        return null
      }
      const width = 1 + (((buffer[chunkDataOffset + 1] | (buffer[chunkDataOffset + 2] << 8)) & 0x3fff))
      const height = 1 + ((((buffer[chunkDataOffset + 3] << 6) | (buffer[chunkDataOffset + 4] << 14) | (buffer[chunkDataOffset + 5] << 22)) & 0x3fff))
      return { width, height }
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2)
  }

  return null
}

export function getAvatarPhotoFileMetadata(file: File): string {
  return extensionForMimeType(file.type)
}

export function validateAvatarPhotoFile(file: File, buffer: Buffer): AvatarPhotoValidationResult {
  const limits = getAvatarPhotoUploadLimits()
  const validationIssues: string[] = []
  const mimeType = file.type

  if (!ALLOWED_AVATAR_PHOTO_MIME_TYPES.includes(mimeType as (typeof ALLOWED_AVATAR_PHOTO_MIME_TYPES)[number])) {
    validationIssues.push(READABLE_AVATAR_PHOTO_SIZE_LIMITS.label)
    return {
      ok: false,
      status: AvatarAssetValidationStatus.INVALID,
      validationIssues
    }
  }

  if (file.size === 0) {
    validationIssues.push(READABLE_AVATAR_PHOTO_SIZE_LIMITS.unreadableLabel)
    return {
      ok: false,
      status: AvatarAssetValidationStatus.INVALID,
      validationIssues
    }
  }

  if (file.size > limits.maxFileSizeBytes) {
    validationIssues.push(READABLE_AVATAR_PHOTO_SIZE_LIMITS.oversizedLabel)
    return {
      ok: false,
      status: AvatarAssetValidationStatus.INVALID,
      validationIssues
    }
  }

  let dimensions: { width: number; height: number } | null = null
  if (mimeType === "image/png") {
    dimensions = readPngDimensions(buffer)
  } else if (mimeType === "image/jpeg") {
    dimensions = readJpegDimensions(buffer)
  } else if (mimeType === "image/webp") {
    dimensions = readWebpDimensions(buffer)
  }

  if (!dimensions) {
    validationIssues.push(READABLE_AVATAR_PHOTO_SIZE_LIMITS.unreadableLabel)
    return {
      ok: false,
      status: AvatarAssetValidationStatus.INVALID,
      validationIssues
    }
  }

  if (dimensions.width < limits.minWidth || dimensions.height < limits.minHeight) {
    validationIssues.push(READABLE_AVATAR_PHOTO_SIZE_LIMITS.tooSmallLabel)
    return {
      ok: false,
      status: AvatarAssetValidationStatus.INVALID,
      validationIssues,
      width: dimensions.width,
      height: dimensions.height
    }
  }

  if (dimensions.width > limits.maxWidth || dimensions.height > limits.maxHeight) {
    validationIssues.push("Image is too large.")
    return {
      ok: false,
      status: AvatarAssetValidationStatus.INVALID,
      validationIssues,
      width: dimensions.width,
      height: dimensions.height
    }
  }

  return {
    ok: true,
    status: AvatarAssetValidationStatus.VALID,
    validationIssues: [],
    width: dimensions.width,
    height: dimensions.height
  }
}
