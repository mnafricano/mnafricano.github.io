import { useEffect, useState } from "react";
import type { AppIdentity } from "../App";
import { href } from "../App";
import { Brand } from "../components/PublicShell";
import { loadAdminMetrics } from "../lib/cloud";
import type { AdminMetrics } from "../types";

export function AdminPage({ identity }: { identity: AppIdentity }) {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (identity.profile?.is_platform_admin) {
      void loadAdminMetrics()
        .then(setMetrics)
        .catch((caught) => setError(caught.message));
    }
  }, [identity.profile?.is_platform_admin]);

  if (!identity.profile?.is_platform_admin) {
    return (
      <main className="center-screen">
        <p className="eyebrow">Access denied</p>
        <h1>This surface is for platform operations.</h1>
        <p>Workspace roles never grant platform administration.</p>
        <a className="button secondary" href={href("app")}>
          Return to workspace
        </a>
      </main>
    );
  }
  return (
    <div className="account-shell">
      <header>
        <Brand />
        <nav>
          <a href={href("app")}>Customer workspace</a>
          <a href={href("account")}>Account</a>
        </nav>
      </header>
      <main className="account-main">
        <div className="account-title">
          <p className="eyebrow">Metadata-only operations</p>
          <h1>Platform health</h1>
          <p>
            This console intentionally excludes unrestricted access to customer
            contracts and financial records.
          </p>
        </div>
        {error && <div className="notice error">{error}</div>}
        {metrics ? (
          <>
            <section className="metric-grid">
              <article>
                <span>Users</span>
                <strong>{metrics.users}</strong>
              </article>
              <article>
                <span>Workspaces</span>
                <strong>{metrics.workspaces}</strong>
              </article>
              <article>
                <span>Paid workspaces</span>
                <strong>{metrics.paid_workspaces}</strong>
              </article>
              <article>
                <span>Pending deletion</span>
                <strong>{metrics.pending_deletions}</strong>
              </article>
            </section>
            <div className="two-column">
              <section className="panel">
                <h2>Integration health</h2>
                <p className="big-number">{metrics.failed_syncs}</p>
                <p>sync jobs currently require attention.</p>
                <a href="#runbook">Open sync failure runbook →</a>
              </section>
              <section className="panel">
                <h2>Webhook health</h2>
                <p className="big-number">{metrics.failed_webhooks}</p>
                <p>Stripe events failed after retry.</p>
                <a href="#runbook">Open webhook runbook →</a>
              </section>
            </div>
          </>
        ) : (
          <div className="center-panel">
            <span className="spinner" />
            <p>Loading operational metrics…</p>
          </div>
        )}
        <section className="panel" id="runbook">
          <h2>Operator boundaries</h2>
          <ul>
            <li>
              Use provider event IDs and error codes; never log tokens or
              document contents.
            </li>
            <li>
              Do not impersonate users. Ask customers to export a failing record
              or grant scoped support access in a future audited feature.
            </li>
            <li>
              Upgrade Supabase to Pro immediately when the first paid
              subscription succeeds.
            </li>
            <li>
              Review failed webhooks before changing subscription state
              manually.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
