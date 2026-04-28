import Link from "next/link"
import { KioskPublicError, getPublicKioskConfig } from "@/lib/kiosk"
import { KioskExperience } from "./_components/kiosk-experience"

type RouteParams = Promise<{ avatarId: string }>

export default async function KioskPage({ params }: { params: RouteParams }) {
  const { avatarId } = await params

  try {
    const config = await getPublicKioskConfig(avatarId)
    return <KioskExperience config={config} />
  } catch (error) {
    const message = error instanceof KioskPublicError
      ? error.message
      : "Kiosk mode is not available for this avatar."

    return (
      <main className="kiosk-unavailable-shell">
        <section className="kiosk-unavailable-panel">
          <p className="eyebrow">Kiosk unavailable</p>
          <h1>AvatarKit AI</h1>
          <p>{message}</p>
          <Link href="/" className="avatarkit-link-button">
            Return home
          </Link>
        </section>
      </main>
    )
  }
}
