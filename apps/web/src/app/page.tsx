import { Button } from "@avatarkit/ui"
import Link from "next/link"

const foundationItems = [
  "Phase-based SaaS foundation",
  "Clear TypeScript and Python service boundaries",
  "Ready for future Avatar Studio, runtime, and widget work"
]

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-section">
        <div className="hero-content">
          <p className="eyebrow">AvatarKit AI</p>
          <h1>Business talking avatar infrastructure, built phase by phase.</h1>
          <p className="hero-copy">
            The foundation is ready for a multi-tenant product where businesses create,
            publish, and operate safe talking avatars.
          </p>
          <div className="hero-actions">
            <Link href="/dashboard">
              <Button>Open foundation dashboard</Button>
            </Link>
            <a className="secondary-link" href="/api/health">
              Web health
            </a>
          </div>
        </div>
        <div className="foundation-panel" aria-label="Phase 0 foundation status">
          <div className="status-pill">Phase 0</div>
          <h2>Project foundation</h2>
          <ul>
            {foundationItems.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  )
}
