import {
  WidgetPublicError,
  buildWidgetCorsHeaders,
  getPublicWidgetConfig
} from "@/lib/widget"

export const dynamic = "force-dynamic"

type RouteParams = Promise<{ avatarId: string }>

function jsonResponse(payload: unknown, status: number, origin: string | null) {
  return Response.json(payload, {
    status,
    headers: buildWidgetCorsHeaders(origin)
  })
}

export async function OPTIONS(
  request: Request,
  { params }: { params: RouteParams }
) {
  const { avatarId } = await params
  const origin = request.headers.get("origin")
  try {
    await getPublicWidgetConfig(avatarId, request)
    return new Response(null, {
      status: 204,
      headers: buildWidgetCorsHeaders(origin)
    })
  } catch (error) {
    const status = error instanceof WidgetPublicError ? error.statusCode : 403
    return new Response(null, {
      status,
      headers: buildWidgetCorsHeaders(origin)
    })
  }
}

export async function GET(
  request: Request,
  { params }: { params: RouteParams }
) {
  const { avatarId } = await params
  const origin = request.headers.get("origin")
  try {
    const config = await getPublicWidgetConfig(avatarId, request)
    return jsonResponse(config, 200, origin)
  } catch (error) {
    if (error instanceof WidgetPublicError) {
      return jsonResponse({
        status: "error",
        code: error.code,
        message: error.message
      }, error.statusCode, origin)
    }

    return jsonResponse({
      status: "error",
      code: "widget_config_failed",
      message: "Widget config could not be loaded."
    }, 500, origin)
  }
}
