import type { HealthResponse } from "@avatarkit/types"
import { NextResponse } from "next/server"

export function GET() {
  const response: HealthResponse = {
    service: "avatarkit-web",
    status: "ok",
    timestamp: new Date().toISOString()
  }

  return NextResponse.json(response)
}
