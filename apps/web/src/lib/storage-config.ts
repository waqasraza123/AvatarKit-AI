export type StorageProviderLabel = "LOCAL" | "S3_COMPATIBLE" | "R2" | "SUPABASE"

export type StorageProviderConfig = {
  provider: StorageProviderLabel
  localRootConfigured: boolean
  requiredVariables: string[]
  optionalVariables: string[]
  configured: boolean
  warning: string | null
}

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim())
}

function normalizeProvider(value: string | undefined): StorageProviderLabel {
  const provider = String(value ?? "LOCAL").trim().toUpperCase()
  if (provider === "S3" || provider === "S3_COMPATIBLE") {
    return "S3_COMPATIBLE"
  }

  if (provider === "R2") {
    return "R2"
  }

  if (provider === "SUPABASE") {
    return "SUPABASE"
  }

  return "LOCAL"
}

export function getStorageProviderConfig(): StorageProviderConfig {
  const provider = normalizeProvider(process.env.STORAGE_PROVIDER || process.env.AVATARKIT_STORAGE_PROVIDER)
  const localRootConfigured = hasEnv("LOCAL_STORAGE_ROOT") || hasEnv("AVATAR_ASSET_STORAGE_ROOT")

  if (provider === "S3_COMPATIBLE") {
    const requiredVariables = ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]
    return {
      provider,
      localRootConfigured,
      requiredVariables,
      optionalVariables: [],
      configured: requiredVariables.every(hasEnv),
      warning: "S3-compatible storage is configuration-only until a production adapter is wired."
    }
  }

  if (provider === "R2") {
    const requiredVariables = ["R2_ACCOUNT_ID", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]
    return {
      provider,
      localRootConfigured,
      requiredVariables,
      optionalVariables: ["S3_ENDPOINT", "S3_REGION"],
      configured: requiredVariables.every(hasEnv),
      warning: "R2 storage is configuration-only until a production adapter is wired."
    }
  }

  if (provider === "SUPABASE") {
    const requiredVariables = ["SUPABASE_STORAGE_BUCKET"]
    return {
      provider,
      localRootConfigured,
      requiredVariables,
      optionalVariables: [],
      configured: requiredVariables.every(hasEnv),
      warning: "Supabase storage is configuration-only until a production adapter is wired."
    }
  }

  return {
    provider,
    localRootConfigured,
    requiredVariables: ["LOCAL_STORAGE_ROOT", "AVATAR_ASSET_STORAGE_ROOT"],
    optionalVariables: [],
    configured: true,
    warning: "Local storage is active. Private source photos, generated media, and media tokens need durable object storage before production scale."
  }
}
