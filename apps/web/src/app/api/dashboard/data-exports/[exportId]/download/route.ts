import { WorkspaceRole } from "@prisma/client"
import { buildWorkspaceExportPayload } from "@/lib/data-governance"
import { prisma } from "@/lib/prisma"
import { getCurrentUser, hasWorkspaceRole } from "@/lib/workspace"

export const dynamic = "force-dynamic"

type RouteContext = {
  params: Promise<{ exportId: string }>
}

function jsonResponse(payload: unknown, status: number): Response {
  return Response.json(payload, { status })
}

function downloadFilename(workspaceSlug: string, exportId: string): string {
  const safeSlug = workspaceSlug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace"
  return `${safeSlug}-export-${exportId}.json`
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const user = await getCurrentUser()
  if (!user) {
    return jsonResponse({ status: "error", message: "Authentication is required." }, 401)
  }

  const { exportId } = await context.params
  const exportRecord = await prisma.workspaceDataExport.findUnique({
    where: { id: exportId },
    select: {
      id: true,
      workspaceId: true,
      expiresAt: true,
      workspace: {
        select: { slug: true }
      }
    }
  })

  if (!exportRecord) {
    return jsonResponse({ status: "error", message: "Export was not found." }, 404)
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: exportRecord.workspaceId,
        userId: user.id
      }
    },
    select: { role: true }
  })

  if (!membership || !hasWorkspaceRole(membership.role, WorkspaceRole.ADMIN)) {
    return jsonResponse({ status: "error", message: "You do not have access to this export." }, 403)
  }

  if (exportRecord.expiresAt <= new Date()) {
    return jsonResponse({ status: "error", message: "Export has expired. Create a new export." }, 410)
  }

  const payload = await buildWorkspaceExportPayload(exportId)
  if (!payload) {
    return jsonResponse({ status: "error", message: "Export is no longer available." }, 410)
  }

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${downloadFilename(exportRecord.workspace.slug, exportRecord.id)}"`,
      "Cache-Control": "private, no-store"
    }
  })
}
