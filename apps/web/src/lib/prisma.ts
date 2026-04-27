import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  __avatarkitPrisma?: PrismaClient
}

export const prisma = globalForPrisma.__avatarkitPrisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__avatarkitPrisma = prisma
}
