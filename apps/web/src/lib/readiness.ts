import { getRateLimitProvider } from "@/lib/rate-limit"
import { getStorageProviderConfig } from "@/lib/storage-config"

export type ReadinessState = "configured" | "missing" | "warning" | "optional"

export type ReadinessItem = {
  label: string
  state: ReadinessState
  variables: string[]
  detail: string
  docsHref?: string
}

export type ReadinessSection = {
  title: string
  items: ReadinessItem[]
}

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim())
}

function item(label: string, variables: string[], state: ReadinessState, detail: string, docsHref?: string): ReadinessItem {
  return {
    label,
    variables,
    state,
    detail,
    docsHref
  }
}

function configuredOrMissing(configured: boolean): ReadinessState {
  return configured ? "configured" : "missing"
}

function anyConfigured(names: string[]): boolean {
  return names.some(hasEnv)
}

export function getConfigurationReadiness(): ReadinessSection[] {
  const storage = getStorageProviderConfig()
  const rateLimitProvider = getRateLimitProvider()
  const llmProvider = process.env.AI_RUNTIME_PROVIDER?.trim().toUpperCase() || "MOCK"
  const ttsProvider = process.env.AI_RUNTIME_TTS_PROVIDER?.trim().toUpperCase() || "MOCK"
  const sttProvider = process.env.AI_RUNTIME_STT_PROVIDER?.trim().toUpperCase() || "MOCK"
  const avatarProvider = process.env.AI_RUNTIME_AVATAR_MEDIA_PROVIDER?.trim().toUpperCase() || "MOCK"
  const platformAdminConfigured = hasEnv("PLATFORM_ADMIN_EMAILS")

  return [
    {
      title: "Core app",
      items: [
        item("Database URL", ["DATABASE_URL"], configuredOrMissing(hasEnv("DATABASE_URL")), "Required for Prisma-backed product data.", "/docs/architecture/deployment-readiness.md"),
        item("Session secret", ["SESSION_SECRET"], configuredOrMissing(hasEnv("SESSION_SECRET")), "Required for durable session integrity where configured by deployment.", "/docs/architecture/security.md"),
        item("Public app URL", ["NEXT_PUBLIC_APP_URL"], configuredOrMissing(hasEnv("NEXT_PUBLIC_APP_URL")), "Used for widget, kiosk, SDK, and public URL generation.", "/docs/architecture/deployment-readiness.md")
      ]
    },
    {
      title: "Database",
      items: [
        item("Prisma database", ["DATABASE_URL"], configuredOrMissing(hasEnv("DATABASE_URL")), "Configuration only; this page does not test live database connectivity.", "/docs/development.md"),
        item("AuditLog schema readiness", ["AUDIT_LOG_ENABLED", "AUDIT_LOG_METADATA_MAX_LENGTH"], "configured", "Audit logging is enabled by default unless AUDIT_LOG_ENABLED is false.", "/docs/architecture/audit-logging.md")
      ]
    },
    {
      title: "Redis and rate limits",
      items: [
        item("Rate-limit provider", ["RATE_LIMIT_PROVIDER"], rateLimitProvider === "redis-rest" ? "configured" : "warning", rateLimitProvider === "redis-rest" ? "Redis REST is selected by configuration. Connectivity is not probed here." : "In-memory rate limits are active for this process only.", "/docs/architecture/rate-limiting.md"),
        item("Redis REST", ["REDIS_REST_URL", "REDIS_REST_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"], rateLimitProvider === "redis-rest" ? "configured" : "optional", "Optional Redis REST configuration for shared rate-limit counters.", "/docs/architecture/rate-limiting.md"),
        item("Public message policy", ["RATE_LIMIT_PUBLIC_API_MESSAGE_MAX", "RATE_LIMIT_PUBLIC_API_MESSAGE_WINDOW_MS", "RATE_LIMIT_WIDGET_MESSAGE_MAX", "RATE_LIMIT_WIDGET_MESSAGE_WINDOW_MS"], "configured", "Policy values default to moderate limits when env vars are missing.", "/docs/architecture/rate-limiting.md")
      ]
    },
    {
      title: "Storage",
      items: [
        item("Storage provider", ["STORAGE_PROVIDER", "AVATARKIT_STORAGE_PROVIDER"], storage.provider === "LOCAL" ? "warning" : configuredOrMissing(storage.configured), storage.warning ?? "Storage provider configuration is present.", "/docs/architecture/deployment-readiness.md"),
        item("Local storage root", ["LOCAL_STORAGE_ROOT", "AVATAR_ASSET_STORAGE_ROOT"], storage.localRootConfigured ? "configured" : "warning", "Local storage remains the active adapter unless a real cloud adapter is implemented.", "/docs/architecture/deployment-readiness.md"),
        item("Cloud storage variables", storage.requiredVariables, storage.provider === "LOCAL" ? "optional" : configuredOrMissing(storage.configured), "Cloud provider variables are readiness metadata only in Phase 26.", "/docs/architecture/deployment-readiness.md")
      ]
    },
    {
      title: "AI runtime",
      items: [
        item("Runtime service token", ["AI_RUNTIME_SERVICE_TOKEN", "AVATAR_RUNTIME_SERVICE_TOKEN"], configuredOrMissing(anyConfigured(["AI_RUNTIME_SERVICE_TOKEN", "AVATAR_RUNTIME_SERVICE_TOKEN"])), "Required before TypeScript can call the private Python runtime.", "/docs/architecture/security.md"),
        item("Runtime URL", ["AI_RUNTIME_BASE_URL", "AI_RUNTIME_URL", "AVATAR_RUNTIME_URL"], configuredOrMissing(anyConfigured(["AI_RUNTIME_BASE_URL", "AI_RUNTIME_URL", "AVATAR_RUNTIME_URL"])), "Private runtime endpoint configuration; no live probe is performed.", "/docs/architecture/deployment-readiness.md")
      ]
    },
    {
      title: "LLM",
      items: [
        item("LLM provider", ["AI_RUNTIME_PROVIDER", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"], llmProvider === "MOCK" ? "warning" : configuredOrMissing(anyConfigured(["OPENAI_API_KEY", "ANTHROPIC_API_KEY"])), llmProvider === "MOCK" ? "MOCK LLM provider is selected." : "A non-mock LLM provider is selected by env.", "/docs/architecture/deployment-readiness.md")
      ]
    },
    {
      title: "TTS/STT",
      items: [
        item("TTS provider", ["AI_RUNTIME_TTS_PROVIDER", "OPENAI_API_KEY", "ELEVENLABS_API_KEY"], ttsProvider === "MOCK" ? "warning" : configuredOrMissing(anyConfigured(["OPENAI_API_KEY", "ELEVENLABS_API_KEY"])), ttsProvider === "MOCK" ? "MOCK TTS provider is selected." : "A non-mock TTS provider is selected by env.", "/docs/architecture/deployment-readiness.md"),
        item("STT provider", ["AI_RUNTIME_STT_PROVIDER", "OPENAI_API_KEY", "DEEPGRAM_API_KEY"], sttProvider === "MOCK" ? "warning" : configuredOrMissing(anyConfigured(["OPENAI_API_KEY", "DEEPGRAM_API_KEY"])), sttProvider === "MOCK" ? "MOCK STT provider is selected." : "A non-mock STT provider is selected by env.", "/docs/architecture/deployment-readiness.md")
      ]
    },
    {
      title: "Avatar video",
      items: [
        item("Avatar video provider", ["AI_RUNTIME_AVATAR_MEDIA_PROVIDER", "AI_RUNTIME_MOCK_AVATAR_VIDEO_URL", "DID_API_KEY", "TAVUS_API_KEY"], avatarProvider === "MOCK" ? "warning" : configuredOrMissing(anyConfigured(["DID_API_KEY", "TAVUS_API_KEY"])), avatarProvider === "MOCK" ? "MOCK avatar video provider is selected." : "A non-mock avatar video provider is selected by env.", "/docs/architecture/deployment-readiness.md"),
        item("Self-hosted renderer", ["AI_RUNTIME_SELF_HOSTED_RENDER_URL"], "optional", "Self-hosted rendering remains research/prototype configuration only.", "/docs/research/self-hosted-avatar-engine.md")
      ]
    },
    {
      title: "Public URLs",
      items: [
        item("Widget URL", ["NEXT_PUBLIC_WIDGET_SCRIPT_URL", "NEXT_PUBLIC_APP_URL"], configuredOrMissing(anyConfigured(["NEXT_PUBLIC_WIDGET_SCRIPT_URL", "NEXT_PUBLIC_APP_URL"])), "Required for production embed snippets.", "/docs/architecture/deployment-readiness.md"),
        item("Public API URL", ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_PUBLIC_API_BASE_URL"], configuredOrMissing(anyConfigured(["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_PUBLIC_API_BASE_URL"])), "Required for SDK setup and public API docs.", "/docs/architecture/deployment-readiness.md")
      ]
    },
    {
      title: "Billing",
      items: [
        item("Billing provider", ["BILLING_PROVIDER", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], anyConfigured(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) ? "warning" : "optional", "Billing remains foundation-only until production checkout and portal are implemented.", "/docs/architecture/deployment-readiness.md")
      ]
    },
    {
      title: "Platform admin",
      items: [
        item("Platform admin bootstrap", ["PLATFORM_ADMIN_EMAILS"], platformAdminConfigured ? "configured" : "missing", "Platform admin access uses User.isPlatformAdmin or explicit bootstrap emails; workspace OWNER is not enough.", "/docs/architecture/security.md")
      ]
    },
    {
      title: "Webhooks",
      items: [
        item("Webhook signing", ["WEBHOOK_SIGNING_SECRET", "STRIPE_WEBHOOK_SECRET"], "optional", "Workspace webhook secrets are generated per endpoint; provider webhook env remains optional until integrations are enabled.", "/docs/architecture/security.md")
      ]
    }
  ]
}
