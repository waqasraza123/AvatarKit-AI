export type AvatarVoiceProvider = "MOCK" | "OPENAI" | "ELEVENLABS" | "AZURE" | "CUSTOM"
export type AvatarVoiceStatus = "ACTIVE" | "INACTIVE"

export type AvatarVoiceRecord = {
  id: string
  provider: AvatarVoiceProvider
  providerVoiceId: string
  name: string
  language: string
  style: string
  presentationStyle: string
  previewUrl: string | null
  status: AvatarVoiceStatus
  createdAt?: Date
  updatedAt?: Date
}

const LANGUAGE_ALIASES: Record<string, string[]> = {
  english: ["english", "en", "en-us", "en-gb", "us english", "uk english"],
  urdu: ["urdu", "ur", "ur-pk"],
  arabic: ["arabic", "ar", "ar-sa", "ar-ae"]
}

function normalizeLanguage(value: string): string {
  return value.trim().toLowerCase()
}

export function isVoiceLanguageCompatible(avatarLanguage: string, voiceLanguage: string): boolean {
  const avatar = normalizeLanguage(avatarLanguage)
  const voice = normalizeLanguage(voiceLanguage)

  if (!avatar || !voice) {
    return false
  }

  if (avatar === voice || avatar.includes(voice) || voice.includes(avatar)) {
    return true
  }

  const voiceAliases = LANGUAGE_ALIASES[voice] ?? [voice]
  return voiceAliases.some(alias => avatar === alias || avatar.includes(alias))
}
