import type { AppIdentity } from "../App";
import { href } from "../App";
import {
  PLAN_ENTITLEMENTS,
  type PlanCode,
} from "../../../../supabase/functions/_shared/domain";
import { PublicLayout } from "../components/PublicShell";

const featureRows = [
  [
    "Explainable leak detection",
    "Every estimate exposes its formula, evidence, confidence, and next action.",
  ],
  [
    "Contract-aware analysis",
    "Confirm rates, retainers, annual increases, payment terms, and renewal dates.",
  ],
  [
    "Cloud collaboration",
    "Move from a personal audit to a controlled business workspace with roles.",
  ],
  [
    "Connected data",
    "Bring CSV and PDF records, then connect QuickBooks and Stripe on paid plans.",
  ],
  [
    "Versioned audit runs",
    "Keep an immutable trail of what data was analyzed, when, and by which engine.",
  ],
  [
    "Private by default",
    "Workspace-scoped authorization, private documents, export, and deletion controls.",
  ],
];

const planCopy: Record<PlanCode, string[]> = {
  free: [
    "1 personal seat",
    "3 clients",
    "1 active audit",
    "Manual CSV and PDF imports",
    "50 MB secure storage",
  ],
  solo: [
    "1 personal seat",
    "25 clients and audits",
    "QuickBooks + Stripe",
    "Weekly scheduled audits",
    "1 GB secure storage",
  ],
  team: [
    "5 workspace seats",
    "100 clients and audits",
    "Owner/admin/analyst/viewer roles",
    "Invitations + priority support",
    "5 GB secure storage",
  ],
};

export function MarketingPage({ identity }: { identity: AppIdentity }) {
  return (
    <PublicLayout identity={identity}>
      <main id="main">
        <section className="marketing-hero">
          <div>
            <p className="eyebrow">
              Revenue intelligence for service businesses
            </p>
            <h1>Find the money your business already earned.</h1>
            <p className="lede">
              Revenue Leak Auditor compares contracts, invoices, payments, and
              time to surface underbilling, overdue balances, missed increases,
              and scope creep—with evidence your team can act on.
            </p>
            <div className="actions">
              <a
                className="button primary"
                href={
                  identity.session ? href("app") : href("login", "?mode=signup")
                }
              >
                Start free
              </a>
              <a className="button secondary" href={href("app", "?demo=1")}>
                Explore the product demo
              </a>
            </div>
            <p className="micro">
              No credit card for Free. Upgrade only when the recovered value
              justifies it.
            </p>
          </div>
          <div className="hero-product" aria-label="Example revenue report">
            <div className="product-toolbar">
              <span />
              <span />
              <span />
              <b>Northstar Studio</b>
            </div>
            <div className="product-total">
              <small>Potentially recoverable</small>
              <strong>$13,500</strong>
              <em>8 high-priority findings</em>
            </div>
            <div className="product-row">
              <span className="signal high" />
              <div>
                <b>24 unbilled hours</b>
                <small>Acme Health · high confidence</small>
              </div>
              <strong>$4,800</strong>
            </div>
            <div className="product-row">
              <span className="signal critical" />
              <div>
                <b>Invoice 40 days overdue</b>
                <small>Acme Health · high confidence</small>
              </div>
              <strong>$3,500</strong>
            </div>
            <div className="product-row">
              <span className="signal medium" />
              <div>
                <b>Annual increase may be missing</b>
                <small>Human review recommended</small>
              </div>
              <strong>$650</strong>
            </div>
          </div>
        </section>

        <section className="trust-strip" aria-label="Product guarantees">
          <span>Human-confirmed contract terms</span>
          <span>Workspace-scoped access</span>
          <span>Transparent calculations</span>
          <span>Exportable evidence</span>
        </section>

        <section className="marketing-section" id="how-it-works">
          <div className="section-intro">
            <p className="eyebrow">From source data to action</p>
            <h2>A complete audit trail, not a mysterious score.</h2>
          </div>
          <div className="three-steps">
            <article>
              <span>01</span>
              <h3>Connect the evidence</h3>
              <p>
                Import source files or securely connect QuickBooks and Stripe.
                Duplicates are reconciled by source identity.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Confirm the agreement</h3>
              <p>
                Review detected contract terms before they influence a
                calculation. Uncertain facts remain visibly incomplete.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Recover the value</h3>
              <p>
                Rank findings by amount and urgency, inspect their evidence,
                assign the next action, and retain every audit run.
              </p>
            </article>
          </div>
        </section>

        <section className="marketing-section">
          <div className="section-intro">
            <p className="eyebrow">Built like a business system</p>
            <h2>Everything the prototype was missing.</h2>
          </div>
          <div className="feature-grid">
            {featureRows.map(([title, copy]) => (
              <article key={title}>
                <span aria-hidden="true">✓</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-section security-band" id="security">
          <div>
            <p className="eyebrow">Security and control</p>
            <h2>Your financial records belong to your workspace.</h2>
          </div>
          <div>
            <p>
              Documents are private, provider credentials stay server-side, and
              every customer table is protected by row-level authorization. The
              platform administrator can see operational health—not browse
              customer financial records.
            </p>
            <a href={href("legal", "?doc=security")}>
              Read the security overview →
            </a>
          </div>
        </section>

        <section className="marketing-section" id="pricing">
          <div className="section-intro">
            <p className="eyebrow">Simple pricing</p>
            <h2>Start free. Pay when it becomes operational.</h2>
          </div>
          <div className="pricing-grid">
            {(Object.keys(PLAN_ENTITLEMENTS) as PlanCode[]).map((code) => {
              const plan = PLAN_ENTITLEMENTS[code];
              return (
                <article
                  className={code === "solo" ? "featured" : ""}
                  key={code}
                >
                  {code === "solo" && (
                    <span className="popular">Most popular</span>
                  )}
                  <h3>{plan.name}</h3>
                  <p className="price">
                    <strong>${plan.monthlyPrice}</strong>
                    <span>{code === "free" ? " forever" : " / month"}</span>
                  </p>
                  {code !== "free" && (
                    <p className="annual">
                      $
                      {plan.annualPrice
                        ? `$${plan.annualPrice}/year · two months free`
                        : ""}
                    </p>
                  )}
                  <ul>
                    {planCopy[code].map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <a
                    className={`button ${code === "solo" ? "primary" : "secondary"}`}
                    href={
                      code === "free"
                        ? href("login", "?mode=signup")
                        : href("login", `?mode=signup&plan=${code}`)
                    }
                  >
                    {code === "free" ? "Start free" : `Choose ${plan.name}`}
                  </a>
                </article>
              );
            })}
          </div>
        </section>

        <section className="marketing-section faq">
          <div className="section-intro">
            <p className="eyebrow">Questions, answered</p>
            <h2>Before you connect the books.</h2>
          </div>
          <details>
            <summary>Does the app replace my accountant?</summary>
            <p>
              No. It provides explainable decision support and a review queue.
              Your team remains responsible for validating findings and applying
              accounting, tax, and legal judgment.
            </p>
          </details>
          <details>
            <summary>Can teammates see every workspace?</summary>
            <p>
              No. Membership is explicit and role-based. A user can belong to
              several personal or business workspaces without data crossing
              between them.
            </p>
          </details>
          <details>
            <summary>What happens when I cancel?</summary>
            <p>
              You retain access through the paid period, then paid-only sync and
              scheduling stop. You can export your data or request permanent
              deletion at any time.
            </p>
          </details>
          <details>
            <summary>Is this intended for regulated health data?</summary>
            <p>
              No. Do not upload HIPAA-regulated or similarly restricted data.
              The launch product is designed for ordinary business contracts and
              billing records.
            </p>
          </details>
        </section>

        <section className="final-cta">
          <p className="eyebrow">Start with one client</p>
          <h2>Let the records tell you where the money went.</h2>
          <a className="button primary" href={href("login", "?mode=signup")}>
            Create a free workspace
          </a>
        </section>
      </main>
    </PublicLayout>
  );
}
