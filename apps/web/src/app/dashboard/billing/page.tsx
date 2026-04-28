import Link from "next/link"
import {
  billingStatusLabel,
  fetchBillingDashboardData,
  formatBillingLimit,
  formatBillingPeriod,
  formatBillingValue,
  type BillingLimitUsage
} from "@/lib/billing"
import { getWorkspaceContextForRequest } from "@/lib/workspace"

function limitStatusLabel(status: BillingLimitUsage["status"]): string {
  if (status === "over_limit") {
    return "Over limit"
  }

  if (status === "near_limit") {
    return "Near limit"
  }

  if (status === "unlimited") {
    return "Custom"
  }

  return "On track"
}

function limitStatusClass(status: BillingLimitUsage["status"]): string {
  if (status === "over_limit") {
    return "billing-limit-status billing-limit-status-danger"
  }

  if (status === "near_limit") {
    return "billing-limit-status billing-limit-status-warning"
  }

  return "billing-limit-status"
}

function BillingLimitCard({ row }: { row: BillingLimitUsage }) {
  return (
    <article className="billing-limit-card">
      <div className="billing-limit-card-header">
        <h3>{row.label}</h3>
        <span className={limitStatusClass(row.status)}>{limitStatusLabel(row.status)}</span>
      </div>
      <p>
        {formatBillingValue(row.usage, row.unit)} of {formatBillingLimit(row.limit, row.unit)} {row.unit === "minutes" ? "minutes" : "used"}
      </p>
      <div className="billing-limit-bar" aria-hidden="true">
        <span style={{ width: `${row.percentUsed ?? 0}%` }} />
      </div>
    </article>
  )
}

export default async function DashboardBillingPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string }>
}) {
  const { workspaceId } = await searchParams
  const context = await getWorkspaceContextForRequest({
    requestedWorkspaceId: workspaceId,
    nextPath: "/dashboard/billing"
  })

  if (!context) {
    return null
  }

  const billing = await fetchBillingDashboardData(context.workspace.id)

  return (
    <main className="content-area">
      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Billing foundation</p>
            <h1>Plan and limits</h1>
            <p className="hero-copy section-subtitle">
              Review the current workspace plan, current-month usage, and the soft limits that prepare AvatarKit for payment integration later.
            </p>
          </div>
          <div className="usage-billing-note">
            <strong>{billing.plan.label}</strong>
            <span>{billing.plan.monthlyPriceLabel}</span>
          </div>
        </div>
        <div className="billing-current-grid">
          <div>
            <p className="eyebrow">Current plan</p>
            <h2>{billing.plan.label}</h2>
            <p>{billing.plan.description}</p>
          </div>
          <div>
            <p className="eyebrow">Billing status</p>
            <h2>{billingStatusLabel(billing.status)}</h2>
            <p>{billing.billingEmail ? `Billing email: ${billing.billingEmail}` : "No billing email is configured yet."}</p>
          </div>
          <div>
            <p className="eyebrow">Current period</p>
            <h2>{formatBillingPeriod(billing.periodStart)}</h2>
            <p>Resets on {formatBillingPeriod(billing.periodEnd)}.</p>
          </div>
        </div>
        {billing.warnings.length > 0 ? (
          <div className="usage-warning-list">
            {billing.warnings.map(warning => (
              <p className="form-error" key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Usage this month</p>
            <h2>Plan limits</h2>
          </div>
          <Link className="avatarkit-link-button" href="/dashboard/usage">
            Open usage
          </Link>
        </div>
        <div className="billing-limit-grid">
          {billing.limitRows.map(row => (
            <BillingLimitCard row={row} key={row.key} />
          ))}
        </div>
      </section>

      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Upgrade placeholder</p>
            <h2>Available plans</h2>
          </div>
          <button className="avatarkit-button avatarkit-button-primary" type="button" disabled>
            Upgrade disabled
          </button>
        </div>
        <div className="billing-plan-grid">
          {billing.availablePlans.map(plan => (
            <article className={plan.key === billing.plan.key ? "billing-plan-card billing-plan-card-active" : "billing-plan-card"} key={plan.key}>
              <p className="eyebrow">{plan.monthlyPriceLabel}</p>
              <h3>{plan.label}</h3>
              <p>{plan.description}</p>
              <ul>
                {plan.features.map(feature => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="content-card">
        <div className="content-card-header">
          <div>
            <p className="eyebrow">Billing history</p>
            <h2>Invoices and payments</h2>
          </div>
        </div>
        {billing.billingHistory.length === 0 ? (
          <p className="avatar-empty-state">
            Billing history is not connected yet. This placeholder is reserved for a future payment provider integration.
          </p>
        ) : null}
      </section>
    </main>
  )
}
