import {
  WidgetPublicError,
  buildWidgetCorsHeaders,
  resolveWidgetMedia
} from "@/lib/widget"

export const dynamic = "force-dynamic"

type RouteParams = Promise<{ messageId: string }>

function parseKind(request: Request): "audio" | "video" | null {
  const kind = new URL(request.url).searchParams.get("kind")
  return kind === "audio" || kind === "video" ? kind : null
}

function parseToken(request: Request): string {
  return new URL(request.url).searchParams.get("token")?.trim() ?? ""
}

export async function GET(
  request: Request,
  { params }: { params: RouteParams }
) {
  const { messageId } = await params
  const origin = request.headers.get("origin")
  const kind = parseKind(request)
  const token = parseToken(request)

  if (!kind || !token) {
    return Response.json({
      status: "error",
      code: "bad_media_request",
      message: "Widget media request is missing kind or token."
    }, {
      status: 400,
      headers: buildWidgetCorsHeaders(origin)
    })
  }

  try {
    const media = await resolveWidgetMedia({
      messageId,
      token,
      kind,
      request
    })

    return new Response(media.content, {
      status: 200,
      headers: {
        ...buildWidgetCorsHeaders(origin),
        "Content-Type": media.mimeType,
        "Cache-Control": "private, max-age=300"
      }
    })
  } catch (error) {
    if (error instanceof WidgetPublicError) {
      return Response.json({
        status: "error",
        code: error.code,
        message: error.message
      }, {
        status: error.statusCode,
        headers: buildWidgetCorsHeaders(origin)
      })
    }

    return Response.json({
      status: "error",
      code: "widget_media_failed",
      message: "Widget media could not be loaded."
    }, {
      status: 500,
      headers: buildWidgetCorsHeaders(origin)
    })
  }
}
