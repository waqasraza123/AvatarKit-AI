export type RateLimitProviderName = "memory" | "redis-rest"

export type RateLimitPolicy = {
  name: string
  limit: number
  windowMs: number
}

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: Date
  retryAfterSeconds?: number
  provider: RateLimitProviderName
}

type MemoryBucket = {
  count: number
  resetAt: number
}

const memoryBuckets = new Map<string, MemoryBucket>()

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function configuredRedisRest(): { url: string; token: string } | null {
  const url = (process.env.REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim()
  const token = (process.env.REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim()
  if (!url || !token) {
    return null
  }

  return { url: url.replace(/\/+$/, ""), token }
}

export function getRateLimitProvider(): RateLimitProviderName {
  const configured = String(process.env.RATE_LIMIT_PROVIDER ?? "memory").trim().toLowerCase()
  if ((configured === "redis" || configured === "redis-rest" || configured === "upstash") && configuredRedisRest()) {
    return "redis-rest"
  }

  return "memory"
}

export function buildRateLimitKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .map(part => String(part ?? "unknown").trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "_").slice(0, 120) || "unknown")
    .join(":")
}

function retryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
}

function cleanupMemoryBuckets(now: number): void {
  if (memoryBuckets.size < 5000) {
    return
  }

  for (const [key, bucket] of memoryBuckets.entries()) {
    if (bucket.resetAt <= now) {
      memoryBuckets.delete(key)
    }
  }
}

function memoryResult(policy: RateLimitPolicy, key: string, consume: boolean): RateLimitResult {
  const now = Date.now()
  cleanupMemoryBuckets(now)
  const bucket = memoryBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + policy.windowMs
    const count = consume ? 1 : 0
    memoryBuckets.set(key, { count, resetAt })
    return {
      allowed: true,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - count),
      resetAt: new Date(resetAt),
      provider: "memory"
    }
  }

  const count = consume ? bucket.count + 1 : bucket.count
  if (consume) {
    bucket.count = count
  }

  const allowed = count <= policy.limit
  return {
    allowed,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - count),
    resetAt: new Date(bucket.resetAt),
    retryAfterSeconds: allowed ? undefined : retryAfterSeconds(bucket.resetAt),
    provider: "memory"
  }
}

async function redisCommand(config: { url: string; token: string }, command: unknown[]): Promise<unknown> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command),
    cache: "no-store"
  })

  if (!response.ok) {
    throw new Error("Redis REST command failed.")
  }

  const payload = await response.json() as { result?: unknown }
  return payload.result
}

async function redisCheck(policy: RateLimitPolicy, key: string): Promise<RateLimitResult> {
  const config = configuredRedisRest()
  if (!config) {
    return memoryResult(policy, key, false)
  }

  const [rawCount, rawTtl] = await Promise.all([
    redisCommand(config, ["GET", key]),
    redisCommand(config, ["PTTL", key])
  ])
  const count = Number.parseInt(String(rawCount ?? "0"), 10) || 0
  const ttl = Number.parseInt(String(rawTtl ?? policy.windowMs), 10)
  const resetAt = Date.now() + (ttl > 0 ? ttl : policy.windowMs)
  const allowed = count < policy.limit

  return {
    allowed,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - count),
    resetAt: new Date(resetAt),
    retryAfterSeconds: allowed ? undefined : retryAfterSeconds(resetAt),
    provider: "redis-rest"
  }
}

async function redisConsume(policy: RateLimitPolicy, key: string): Promise<RateLimitResult> {
  const config = configuredRedisRest()
  if (!config) {
    return memoryResult(policy, key, true)
  }

  const count = Number.parseInt(String(await redisCommand(config, ["INCR", key]) ?? "0"), 10) || 0
  let ttl = Number.parseInt(String(await redisCommand(config, ["PTTL", key]) ?? "-1"), 10)
  if (ttl < 0 || count === 1) {
    await redisCommand(config, ["PEXPIRE", key, policy.windowMs])
    ttl = policy.windowMs
  }

  const resetAt = Date.now() + ttl
  const allowed = count <= policy.limit

  return {
    allowed,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - count),
    resetAt: new Date(resetAt),
    retryAfterSeconds: allowed ? undefined : retryAfterSeconds(resetAt),
    provider: "redis-rest"
  }
}

export async function checkRateLimit(policy: RateLimitPolicy, key: string): Promise<RateLimitResult> {
  if (getRateLimitProvider() === "redis-rest") {
    try {
      return await redisCheck(policy, key)
    } catch {
      return memoryResult(policy, key, false)
    }
  }

  return memoryResult(policy, key, false)
}

export async function consumeRateLimit(policy: RateLimitPolicy, key: string): Promise<RateLimitResult> {
  if (getRateLimitProvider() === "redis-rest") {
    try {
      return await redisConsume(policy, key)
    } catch {
      return memoryResult(policy, key, true)
    }
  }

  return memoryResult(policy, key, true)
}

export function rateLimitPolicyFromEnv(name: string, defaults: { limit: number; windowMs: number }, envPrefix: string): RateLimitPolicy {
  return {
    name,
    limit: positiveInteger(process.env[`${envPrefix}_MAX`], defaults.limit),
    windowMs: positiveInteger(process.env[`${envPrefix}_WINDOW_MS`], defaults.windowMs)
  }
}
