import { VoiceProvider, VoiceStatus } from "@prisma/client"
import {
  isVoiceLanguageCompatible,
  type AvatarVoiceRecord
} from "@/lib/avatar-voice-shared"
import { prisma } from "@/lib/prisma"

export type AvatarVoiceFieldErrors = {
  avatarId?: string
  voiceId?: string
}

export const STATIC_MOCK_VOICE_CATALOG: AvatarVoiceRecord[] = [
  {
    id: "mock-professional-english-female",
    provider: VoiceProvider.MOCK,
    providerVoiceId: "mock-professional-english-female",
    name: "Professional English Female",
    language: "English",
    style: "Professional",
    presentationStyle: "Female",
    previewUrl: null,
    status: VoiceStatus.ACTIVE
  },
  {
    id: "mock-professional-english-male",
    provider: VoiceProvider.MOCK,
    providerVoiceId: "mock-professional-english-male",
    name: "Professional English Male",
    language: "English",
    style: "Professional",
    presentationStyle: "Male",
    previewUrl: null,
    status: VoiceStatus.ACTIVE
  },
  {
    id: "mock-warm-english-female",
    provider: VoiceProvider.MOCK,
    providerVoiceId: "mock-warm-english-female",
    name: "Warm English Female",
    language: "English",
    style: "Warm",
    presentationStyle: "Female",
    previewUrl: null,
    status: VoiceStatus.ACTIVE
  },
  {
    id: "mock-calm-english-male",
    provider: VoiceProvider.MOCK,
    providerVoiceId: "mock-calm-english-male",
    name: "Calm English Male",
    language: "English",
    style: "Calm",
    presentationStyle: "Male",
    previewUrl: null,
    status: VoiceStatus.ACTIVE
  },
  {
    id: "mock-energetic-english-neutral",
    provider: VoiceProvider.MOCK,
    providerVoiceId: "mock-energetic-english-neutral",
    name: "Energetic English Neutral",
    language: "English",
    style: "Energetic",
    presentationStyle: "Neutral",
    previewUrl: null,
    status: VoiceStatus.ACTIVE
  },
  {
    id: "mock-urdu-friendly-placeholder",
    provider: VoiceProvider.MOCK,
    providerVoiceId: "mock-urdu-friendly-placeholder",
    name: "Urdu Friendly Placeholder",
    language: "Urdu",
    style: "Friendly",
    presentationStyle: "Neutral",
    previewUrl: null,
    status: VoiceStatus.ACTIVE
  },
  {
    id: "mock-arabic-friendly-placeholder",
    provider: VoiceProvider.MOCK,
    providerVoiceId: "mock-arabic-friendly-placeholder",
    name: "Arabic Friendly Placeholder",
    language: "Arabic",
    style: "Friendly",
    presentationStyle: "Neutral",
    previewUrl: null,
    status: VoiceStatus.ACTIVE
  }
]

function voiceCatalogById(voiceId: string): AvatarVoiceRecord | null {
  return STATIC_MOCK_VOICE_CATALOG.find(voice => voice.id === voiceId) ?? null
}

function mapVoiceRecord(raw: AvatarVoiceRecord): AvatarVoiceRecord {
  return {
    id: raw.id,
    provider: raw.provider,
    providerVoiceId: raw.providerVoiceId,
    name: raw.name,
    language: raw.language,
    style: raw.style,
    presentationStyle: raw.presentationStyle,
    previewUrl: raw.previewUrl,
    status: raw.status,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt
  }
}

export async function fetchActiveVoices(): Promise<AvatarVoiceRecord[]> {
  const voices = await prisma.voice.findMany({
    where: { status: VoiceStatus.ACTIVE },
    orderBy: [{ language: "asc" }, { name: "asc" }],
    select: {
      id: true,
      provider: true,
      providerVoiceId: true,
      name: true,
      language: true,
      style: true,
      presentationStyle: true,
      previewUrl: true,
      status: true,
      createdAt: true,
      updatedAt: true
    }
  })

  if (voices.length > 0) {
    return voices.map(mapVoiceRecord)
  }

  return STATIC_MOCK_VOICE_CATALOG
}

export { isVoiceLanguageCompatible }

export async function resolveSelectableVoice(voiceId: string): Promise<AvatarVoiceRecord | null> {
  const persistedVoice = await prisma.voice.findFirst({
    where: {
      id: voiceId,
      status: VoiceStatus.ACTIVE
    },
    select: {
      id: true,
      provider: true,
      providerVoiceId: true,
      name: true,
      language: true,
      style: true,
      presentationStyle: true,
      previewUrl: true,
      status: true,
      createdAt: true,
      updatedAt: true
    }
  })

  if (persistedVoice) {
    return mapVoiceRecord(persistedVoice)
  }

  return voiceCatalogById(voiceId)
}

export async function ensurePersistedVoice(voice: AvatarVoiceRecord): Promise<AvatarVoiceRecord> {
  const persistedVoice = await prisma.voice.upsert({
    where: {
      provider_providerVoiceId: {
        provider: voice.provider,
        providerVoiceId: voice.providerVoiceId
      }
    },
    create: {
      id: voice.id,
      provider: voice.provider,
      providerVoiceId: voice.providerVoiceId,
      name: voice.name,
      language: voice.language,
      style: voice.style,
      presentationStyle: voice.presentationStyle,
      previewUrl: voice.previewUrl,
      status: voice.status
    },
    update: {
      name: voice.name,
      language: voice.language,
      style: voice.style,
      presentationStyle: voice.presentationStyle,
      previewUrl: voice.previewUrl,
      status: voice.status
    },
    select: {
      id: true,
      provider: true,
      providerVoiceId: true,
      name: true,
      language: true,
      style: true,
      presentationStyle: true,
      previewUrl: true,
      status: true,
      createdAt: true,
      updatedAt: true
    }
  })

  return mapVoiceRecord(persistedVoice)
}
