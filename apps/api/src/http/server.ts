import type { HealthResponse } from "@avatarkit/types"
import Fastify from "fastify"

export function createApiServer() {
  const server = Fastify({
    logger: true
  })

  server.get("/health", async (): Promise<HealthResponse> => ({
    service: "avatarkit-api",
    status: "ok",
    timestamp: new Date().toISOString()
  }))

  return server
}
