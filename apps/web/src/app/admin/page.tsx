import { redirect } from "next/navigation"
import { requirePlatformAdmin } from "@/lib/platform-admin"

export default async function AdminIndexPage() {
  await requirePlatformAdmin("/admin")
  redirect("/admin/audit-log")
}
