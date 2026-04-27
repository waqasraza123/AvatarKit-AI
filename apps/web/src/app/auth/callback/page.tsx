import Link from "next/link"

export default async function AuthCallbackPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next: requestedNext } = await searchParams
  const next = requestedNext ?? "/dashboard"
  const fallbackNext = "/onboarding/workspace"

  return (
    <main className="page-shell">
      <section className="content-card">
        <p className="eyebrow">Auth callback</p>
        <h1>Authentication callback complete</h1>
        <p className="hero-copy">
          This implementation uses local credentials, so sign-in and sign-up return directly to your
          destination.
        </p>
        <Link className="avatarkit-button avatarkit-button-secondary" href={next}>
          Continue to application
        </Link>
        <Link className="avatarkit-link-button" href={fallbackNext}>
          Continue to workspace onboarding
        </Link>
      </section>
    </main>
  )
}
