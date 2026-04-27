import { NextResponse } from "next/server"
import { AvatarAssetValidationStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/session"
import { readAvatarAssetFromDisk } from "@/lib/avatar-asset-storage"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ avatarAssetId: string }> }
) {
  const { avatarAssetId } = await params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 })
  }

  const asset = await prisma.avatarAsset.findUnique({
    where: { id: avatarAssetId },
    select: {
      id: true,
      workspaceId: true,
      storageKey: true,
      mimeType: true,
      validationStatus: true
    }
  })

  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 })
  }

  const member = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspaceId: asset.workspaceId
    },
    select: { id: true }
  })

  if (!member) {
    return NextResponse.json({ error: "Not allowed." }, { status: 404 })
  }

  if (asset.validationStatus !== AvatarAssetValidationStatus.VALID) {
    return NextResponse.json({ error: "Asset is not available." }, { status: 404 })
  }

  try {
    const content = await readAvatarAssetFromDisk(asset.storageKey)
    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType || "application/octet-stream",
        "Cache-Control": "private, no-store"
      }
    })
  } catch {
    return NextResponse.json({ error: "Asset not available." }, { status: 404 })
  }
}
