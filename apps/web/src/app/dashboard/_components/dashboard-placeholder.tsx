type DashboardPlaceholderProps = {
  title: string
  subtitle: string
  intro: string
  workspaceName: string
  cards?: DashboardPlaceholderCard[]
  actionHint?: string
}

type DashboardPlaceholderCard = {
  title: string
  description: string
}

export function DashboardPlaceholder({
  title,
  subtitle,
  intro,
  workspaceName,
  cards = [],
  actionHint
}: DashboardPlaceholderProps) {
  return (
    <section className="content-card">
      <p className="eyebrow">{workspaceName}</p>
      <h1>{title}</h1>
      <p className="hero-copy section-subtitle">{subtitle}</p>
      <p>{intro}</p>
      {actionHint ? <p className="action-hint">{actionHint}</p> : null}
      {cards.length > 0 ? (
        <div className="dashboard-card-grid">
          {cards.map(card => (
            <div className="dashboard-card" key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
