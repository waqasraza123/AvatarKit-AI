import { KioskPublicError, getPublicKioskConfig } from "@/lib/kiosk"

export const dynamic = "force-dynamic"

type RouteParams = Promise<{ avatarId: string }>

function jsonResponse(payload: unknown, status: number) {
  return Response.json(payload, { status })
}

export async function GET(
  _request: Request,
  { params }: { params: RouteParams }
) {
  const { avatarId } = await params

  try {
    const config = await getPublicKioskConfig(avatarId)
    return jsonResponse(config, 200)
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
      code: "kiosk_config_failed",
      message: "Kiosk config could not be loaded."
    }, 500)
  }
}
