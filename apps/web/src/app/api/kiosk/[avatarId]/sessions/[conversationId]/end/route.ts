import { KioskPublicError, endKioskSession } from "@/lib/kiosk"

export const dynamic = "force-dynamic"

type RouteParams = Promise<{ avatarId: string; conversationId: string }>

function jsonResponse(payload: unknown, status: number) {
  return Response.json(payload, { status })
}

export async function POST(
  _request: Request,
  { params }: { params: RouteParams }
) {
  const { avatarId, conversationId } = await params

  try {
    await endKioskSession(avatarId, conversationId)
    return jsonResponse({ status: "ok" }, 200)
  } catch (error) {
    if (error instanceof KioskPublicError) {
      return jsonResponse({
        status: "error",
        code: error.code,
        message: error.message
      }, error.statusCode)
    }

    return jsonResponse({
      status: "error",
      code: "kiosk_end_failed",
      message: "Kiosk session could not be ended."
    }, 500)
  }
}
