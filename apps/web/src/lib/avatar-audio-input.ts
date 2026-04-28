export const AVATAR_VOICE_INPUT_MAX_BYTES = 10 * 1024 * 1024
export const AVATAR_VOICE_INPUT_MAX_DURATION_SECONDS = 60
export const AVATAR_VOICE_INPUT_ACCEPTED_MIME_TYPES = [
  "audio/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4"
] as const

export type AvatarVoiceInputMimeType = (typeof AVATAR_VOICE_INPUT_ACCEPTED_MIME_TYPES)[number]

export type AvatarVoiceInputValidation = {
  ok: boolean
  mimeType: AvatarVoiceInputMimeType | null
  fileExtension: string
  validationIssues: string[]
  durationSeconds: number | null
}

function normalizeMimeType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? ""
}

export function isAvatarVoiceInputMimeType(value: string): value is AvatarVoiceInputMimeType {
  return (AVATAR_VOICE_INPUT_ACCEPTED_MIME_TYPES as readonly string[]).includes(normalizeMimeType(value))
}

export function getAvatarVoiceInputFileExtension(mimeType: string, fileName: string): string {
  const normalizedMimeType = normalizeMimeType(mimeType)
  if (normalizedMimeType === "audio/webm") {
    return "webm"
  }
  if (normalizedMimeType === "audio/mpeg") {
    return "mp3"
  }
  if (normalizedMimeType === "audio/wav") {
    return "wav"
  }
  if (normalizedMimeType === "audio/mp4") {
    return "mp4"
  }

  const extension = fileName.split(".").pop()?.toLowerCase() ?? ""
  return /^[a-z0-9]{2,8}$/.test(extension) ? extension : "bin"
}

export function parseVoiceInputDurationSeconds(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return Math.round(parsed * 10) / 10
}

export function validateAvatarVoiceInputFile(
  file: File,
  durationSeconds: number | null
): AvatarVoiceInputValidation {
  const normalizedMimeType = normalizeMimeType(file.type)
  const validationIssues: string[] = []

  if (!isAvatarVoiceInputMimeType(normalizedMimeType)) {
    validationIssues.push("Recording must be WEBM, MP3, WAV, or MP4 audio.")
  }

  if (file.size <= 0) {
    validationIssues.push("Recording is empty.")
  }

  if (file.size > AVATAR_VOICE_INPUT_MAX_BYTES) {
    validationIssues.push("Recording must be 10MB or smaller.")
  }

  if (durationSeconds === null) {
    validationIssues.push("Recording duration could not be confirmed.")
  } else if (durationSeconds > AVATAR_VOICE_INPUT_MAX_DURATION_SECONDS) {
    validationIssues.push("Recording must be 60 seconds or shorter.")
  }

  return {
    ok: validationIssues.length === 0,
    mimeType: isAvatarVoiceInputMimeType(normalizedMimeType) ? normalizedMimeType : null,
    fileExtension: getAvatarVoiceInputFileExtension(normalizedMimeType, file.name),
    validationIssues,
    durationSeconds
  }
}
