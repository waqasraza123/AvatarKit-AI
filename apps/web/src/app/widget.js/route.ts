import { widgetBrowserScript } from "@avatarkit/widget"

export const dynamic = "force-dynamic"

export function GET() {
  return new Response(widgetBrowserScript, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  })
}
