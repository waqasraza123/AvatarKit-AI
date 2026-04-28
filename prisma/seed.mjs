import { PrismaClient, VoiceProvider, VoiceStatus } from "@prisma/client"

const prisma = new PrismaClient()

const voices = [
  {
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

async function main() {
  for (const voice of voices) {
    await prisma.voice.upsert({
      where: {
        provider_providerVoiceId: {
          provider: voice.provider,
          providerVoiceId: voice.providerVoiceId
        }
      },
      create: voice,
      update: voice
    })
  }
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
