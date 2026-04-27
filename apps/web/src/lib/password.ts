import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto"

const passwordHashIterations = 120000
const passwordHashLength = 64
const passwordHashDigest = "sha512"

const passwordHashAlgorithm = "pbkdf2"

function isValidStoredHash(value: string): boolean {
  return value.split(":").length === 3 && value.startsWith(`${passwordHashAlgorithm}:`)
}

function splitStoredHash(value: string): [string, string, string] {
  const [, algorithm, salt, digest] = value.split(":")
  return [algorithm, salt, digest]
}

export function hashPassword(password: string): string {
  const normalizedPassword = password.trim()
  const salt = randomBytes(16).toString("hex")
  const hash = pbkdf2Sync(
    normalizedPassword,
    salt,
    passwordHashIterations,
    passwordHashLength,
    passwordHashDigest
  ).toString("hex")
  return `${passwordHashAlgorithm}:${salt}:${hash}`
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!isValidStoredHash(storedHash)) {
    return false
  }

  const [, salt, digest] = splitStoredHash(storedHash)
  const normalizedPassword = password.trim()
  const candidate = pbkdf2Sync(
    normalizedPassword,
    salt,
    passwordHashIterations,
    passwordHashLength,
    passwordHashDigest
  )
  const stored = Buffer.from(digest, "hex")

  if (stored.length !== candidate.length) {
    return false
  }

  return timingSafeEqual(stored, candidate)
}
