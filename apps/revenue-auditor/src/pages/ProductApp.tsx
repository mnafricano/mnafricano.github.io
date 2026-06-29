import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AppIdentity } from "../App";
import { href } from "../App";
import {
  PLAN_ENTITLEMENTS,
  analyzeAudit,
  summarizeFindings,
  type Finding,
  type PlanCode,
} from "../../../../supabase/functions/_shared/domain";
import {
  archiveAudit,
  createAudit,
  createBusinessWorkspace,
  getUsage,
  importRows,
  inviteMember,
  listAudits,
  listDataSources,
  listMembers,
  loadAudit,
  migrateLegacyAudit,
  openBillingPortal,
  openCheckout,
  removeMember,
  runCloudAudit,
  saveContract,
  scheduleWorkspaceDeletion,
  startProviderConnect,
  syncDataSource,
  updateMemberRole,
  uploadContractFile,
} from "../lib/cloud";
import { mapCsv, parseCsv, type ImportKind } from "../lib/csv";
import { createDemoAudit } from "../lib/demo";
import {
  deleteLegacyAudit,
  listLegacyAudits,
  type LegacyAudit,
} from "../lib/localMigration";
import { readContractPdf, type ContractCandidates } from "../lib/pdf";
import { supabase } from "../lib/supabase";
import type {
  AuditDetail,
  AuditListItem,
  DataSource,
  Usage,
  Workspace,
} from "../types";
import { Brand } from "../components/PublicShell";

type Panel =
  "dashboard" | "audit" | "integrations" | "team" | "billing" | "onboarding";

const currency = (value: number | null, code = "USD") =>
  value === null
    ? "Needs a confirmed value"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code,
      }).format(value);

function appUrl(panel: Panel, extra: Record<string, string> = {}) {
  const parameters = new URLSearchParams({ view: panel, ...extra });
  return href("app", `?${parameters}`);
}

function currentPanel(): Panel {
  return (
    (new URLSearchParams(window.location.search).get("view") as Panel) ||
    "dashboard"
  );
}

function AppShell({
  identity,
  workspaces,
  workspace,
  panel,
  onWorkspace,
  previewMode,
  children,
}: {
  identity: AppIdentity;
  workspaces: Workspace[];
  workspace: Workspace;
  panel: Panel;
  onWorkspace: (id: string) => void;
  previewMode: boolean;
  children: React.ReactNode;
}) {
  const items: Array<[Panel, string, string]> = [
    ["dashboard", "⌂", "Overview"],
    ["integrations", "↔", "Data sources"],
    ["team", "◎", "People"],
    ["billing", "◇", "Plan & usage"],
  ];
  return (
    <div className="app-frame">
      <a className="skip-link" href="#workspace-main">
        Skip to workspace
      </a>
      <aside className="app-sidebar">
        <Brand />
        <label className="workspace-picker">
          Workspace
          <select
            value={workspace.id}
            onChange={(event) => onWorkspace(event.target.value)}
            disabled={previewMode}
          >
            {workspaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Workspace navigation">
          {items.map(([value, icon, label]) => (
            <a
              key={value}
              className={panel === value ? "active" : ""}
              href={appUrl(value)}
            >
              <span>{icon}</span>
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {previewMode && <span className="demo-chip">Product demo</span>}
          {identity.profile?.is_platform_admin && (
            <a href={href("admin")}>Platform admin</a>
          )}
          <a href={href("account")}>
            {identity.profile?.display_name ||
              identity.session?.user.email ||
              "Account settings"}
          </a>
          {!previewMode && (
            <button onClick={() => void supabase?.auth.signOut()}>
              Sign out
            </button>
          )}
          <a href={href("marketing")}>Product home</a>
        </div>
      </aside>
      <div className="app-mobile-head">
        <Brand />
        <a href={appUrl("dashboard")}>Workspace</a>
      </div>
      <main id="workspace-main" className="app-main">
        {children}
      </main>
    </div>
  );
}

function EmptyCloudState() {
  return (
    <main className="center-screen">
      <p className="eyebrow">Workspace unavailable</p>
      <h1>Your personal workspace is still being prepared.</h1>
      <p>
        Refresh in a moment. If the problem continues, check the Supabase
        trigger and operational events.
      </p>
      <a className="button secondary" href={href("app")}>
        Refresh workspace
      </a>
    </main>
  );
}

export function ProductApp({
  identity,
  previewMode = false,
}: {
  identity: AppIdentity;
  previewMode?: boolean;
}) {
  const panel = currentPanel();
  const demoAudit = useMemo(createDemoAudit, []);
  const previewWorkspace: Workspace = {
    id: "demo",
    name: "Northstar Studio",
    type: "business",
    role: "owner",
    plan_code: "team",
    slug: "northstar-demo",
    created_at: new Date().toISOString(),
  };
  const workspaces = previewMode ? [previewWorkspace] : identity.workspaces;
  const [workspaceId, setWorkspaceId] = useState(
    () => localStorage.getItem("auditor-workspace") || workspaces[0]?.id || "",
  );
  const workspace =
    workspaces.find((item) => item.id === workspaceId) || workspaces[0];
  const [audits, setAudits] = useState<AuditListItem[]>(
    previewMode
      ? [
          {
            id: "demo",
            name: demoAudit.name,
            currency: "USD",
            status: "complete",
            current_run_id: "demo-run",
            updated_at: new Date().toISOString(),
            finding_count: demoAudit.findings.length,
          },
        ]
      : [],
  );
  const [usage, setUsage] = useState<Usage>({
    seats: 0,
    clients: 0,
    active_audits: 0,
    storage_bytes: 0,
  });
  const [sources, setSources] = useState<DataSource[]>([]);
  const [legacy, setLegacy] = useState<LegacyAudit[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshWorkspace() {
    if (previewMode || !workspace) return;
    try {
      const [nextAudits, nextUsage, nextSources, nextLegacy] =
        await Promise.all([
          listAudits(workspace.id),
          getUsage(workspace.id),
          listDataSources(workspace.id),
          listLegacyAudits(),
        ]);
      setAudits(nextAudits);
      setUsage(nextUsage);
      setSources(nextSources);
      setLegacy(nextLegacy);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Workspace data could not be loaded.",
      );
    }
  }

  useEffect(() => {
    void refreshWorkspace();
    // Reload only when the selected workspace changes; the loader is intentionally local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id, previewMode]);

  function chooseWorkspace(id: string) {
    localStorage.setItem("auditor-workspace", id);
    setWorkspaceId(id);
  }

  if (!workspace) return <EmptyCloudState />;

  const plan = PLAN_ENTITLEMENTS[workspace.plan_code];
  const auditId = new URLSearchParams(window.location.search).get("audit");

  return (
    <AppShell
      identity={identity}
      workspaces={workspaces}
      workspace={workspace}
      panel={auditId ? "audit" : panel}
      onWorkspace={chooseWorkspace}
      previewMode={previewMode}
    >
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {message && (
        <div className="notice success" role="status">
          {message}
          <button onClick={() => setMessage("")}>Dismiss</button>
        </div>
      )}
      {auditId ? (
        <AuditWorkspace
          auditId={auditId}
          previewMode={previewMode}
          demoAudit={demoAudit}
          workspace={workspace}
          onMessage={setMessage}
          onError={setError}
          onRefresh={refreshWorkspace}
        />
      ) : panel === "integrations" ? (
        <IntegrationsPanel
          workspace={workspace}
          sources={sources}
          previewMode={previewMode}
          refresh={refreshWorkspace}
          setError={setError}
          setMessage={setMessage}
        />
      ) : panel === "team" ? (
        <TeamPanel
          workspace={workspace}
          previewMode={previewMode}
          setError={setError}
          setMessage={setMessage}
        />
      ) : panel === "billing" ? (
        <BillingPanel
          identity={identity}
          workspace={workspace}
          usage={usage}
          previewMode={previewMode}
          setError={setError}
        />
      ) : panel === "onboarding" ? (
        <OnboardingPanel
          identity={identity}
          workspace={workspace}
          legacy={legacy}
          previewMode={previewMode}
          refresh={refreshWorkspace}
          setError={setError}
          setMessage={setMessage}
        />
      ) : (
        <DashboardPanel
          workspace={workspace}
          plan={plan}
          audits={audits}
          usage={usage}
          legacy={legacy}
          previewMode={previewMode}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          refresh={refreshWorkspace}
        />
      )}
    </AppShell>
  );
}

function DashboardPanel({
  workspace,
  plan,
  audits,
  usage,
  legacy,
  previewMode,
  busy,
  setBusy,
  setError,
  refresh,
}: {
  workspace: Workspace;
  plan: (typeof PLAN_ENTITLEMENTS)[PlanCode];
  audits: AuditListItem[];
  usage: Usage;
  legacy: LegacyAudit[];
  previewMode: boolean;
  busy: boolean;
  setBusy: (value: boolean) => void;
  setError: (value: string) => void;
  refresh: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const completeCount = audits.filter(
    (audit) => audit.status === "complete",
  ).length;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const id = await createAudit(
        workspace.id,
        String(form.get("name")),
        String(form.get("currency")),
      );
      await refresh();
      window.location.assign(appUrl("audit", { audit: id }));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The audit could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="app-page-head">
        <div>
          <p className="eyebrow">
            {workspace.type} workspace · {plan.name} plan
          </p>
          <h1>Good afternoon.</h1>
          <p>
            Here’s the current revenue-control picture for {workspace.name}.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => setCreating(true)}
          disabled={previewMode}
        >
          New audit
        </button>
      </header>
      {previewMode && (
        <div className="notice demo">
          <strong>You’re exploring a complete Team workspace.</strong>
          <p>
            Reports and navigation are live. Writes, billing, and provider OAuth
            activate with production credentials.
          </p>
        </div>
      )}
      {legacy.length > 0 && !previewMode && (
        <a className="migration-banner" href={appUrl("onboarding")}>
          <div>
            <strong>
              {legacy.length} local audit{legacy.length === 1 ? "" : "s"} found
            </strong>
            <p>
              Review and explicitly migrate browser-only data into this
              workspace.
            </p>
          </div>
          <span>Review migration →</span>
        </a>
      )}
      <section className="metric-grid">
        <article>
          <span>Active audits</span>
          <strong>
            {usage.active_audits ||
              audits.filter((audit) => audit.status !== "archived").length}
          </strong>
          <small>of {plan.activeAudits} plan limit</small>
        </article>
        <article>
          <span>Completed reports</span>
          <strong>{completeCount}</strong>
          <small>Immutable audit runs</small>
        </article>
        <article>
          <span>Clients tracked</span>
          <strong>{previewMode ? 3 : usage.clients}</strong>
          <small>of {plan.clients} plan limit</small>
        </article>
        <article>
          <span>Storage</span>
          <strong>
            {previewMode
              ? "2.4 MB"
              : `${(usage.storage_bytes / 1024 / 1024).toFixed(1)} MB`}
          </strong>
          <small>of {(plan.storageBytes / 1024 / 1024).toFixed(0)} MB</small>
        </article>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Audit library</p>
            <h2>Revenue reviews</h2>
          </div>
          <a href={appUrl("integrations")}>Manage data sources</a>
        </div>
        <div className="audit-table">
          <div className="audit-row header">
            <span>Name</span>
            <span>Status</span>
            <span>Findings</span>
            <span>Updated</span>
            <span />
          </div>
          {audits.map((audit) => (
            <div className="audit-row" key={audit.id}>
              <span>
                <b>{audit.name}</b>
                <small>{audit.currency}</small>
              </span>
              <span>
                <i className={`status ${audit.status}`}>{audit.status}</i>
              </span>
              <span>{audit.finding_count ?? "—"}</span>
              <span>{new Date(audit.updated_at).toLocaleDateString()}</span>
              <span>
                <a
                  className="button small secondary"
                  href={appUrl("audit", { audit: audit.id })}
                >
                  Open
                </a>
                {!previewMode && (
                  <button
                    className="icon-button"
                    title="Archive audit"
                    onClick={async () => {
                      await archiveAudit(audit.id);
                      await refresh();
                    }}
                  >
                    •••
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>
      {creating && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-audit-title"
          >
            <button
              className="modal-close"
              onClick={() => setCreating(false)}
              aria-label="Close"
            >
              ×
            </button>
            <p className="eyebrow">New revenue review</p>
            <h2 id="new-audit-title">Create an audit</h2>
            <form onSubmit={submit}>
              <label>
                Audit name
                <input
                  name="name"
                  required
                  maxLength={80}
                  placeholder="Q3 client revenue review"
                />
              </label>
              <label>
                Reporting currency
                <select name="currency">
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                  <option>CAD</option>
                  <option>AUD</option>
                </select>
              </label>
              <button className="button primary full" disabled={busy}>
                {busy ? "Creating…" : "Create audit"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function AuditWorkspace({
  auditId,
  previewMode,
  demoAudit,
  workspace,
  onMessage,
  onError,
  onRefresh,
}: {
  auditId: string;
  previewMode: boolean;
  demoAudit: AuditDetail;
  workspace: Workspace;
  onMessage: (value: string) => void;
  onError: (value: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [audit, setAudit] = useState<AuditDetail | null>(
    previewMode ? demoAudit : null,
  );
  const [tab, setTab] = useState<
    "overview" | "import" | "contracts" | "findings"
  >("findings");
  const [busy, setBusy] = useState(!previewMode);
  const [filter, setFilter] = useState("");
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [candidates, setCandidates] = useState<ContractCandidates | null>(null);

  async function reload() {
    if (previewMode) return;
    setBusy(true);
    try {
      setAudit(await loadAudit(auditId));
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "The audit could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void reload();
    // Reload only when the audit identity changes; the loader is intentionally local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId, previewMode]);

  if (busy || !audit)
    return (
      <div className="center-panel">
        <span className="spinner" />
        <p>Loading audit records…</p>
      </div>
    );
  const currentAudit = audit;
  const summary = summarizeFindings(currentAudit.findings);
  const visibleFindings = currentAudit.findings.filter(
    (finding) => !filter || finding.category === filter,
  );

  async function handleCsv(file: File, kind: ImportKind) {
    if (previewMode) {
      onMessage(
        "The demo is read-only. Create an account to import your own records.",
      );
      return;
    }
    try {
      const result = mapCsv(parseCsv(await file.text()), kind);
      const count = await importRows(
        workspace.id,
        currentAudit.id,
        kind,
        result.rows,
        file.name,
      );
      onMessage(
        `${count} ${kind.replace("_", " ")} imported; ${result.duplicateKeys.length} in-file duplicates skipped.`,
      );
      await reload();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "CSV import failed.");
    }
  }

  async function handlePdf(file: File) {
    try {
      const result = await readContractPdf(file);
      setContractFile(file);
      setCandidates(result.candidates);
      setTab("contracts");
      onMessage(
        "Candidate terms were extracted locally. Confirm them before analysis.",
      );
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Contract extraction failed.",
      );
    }
  }

  async function confirmContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!candidates) return;
    if (previewMode) {
      onMessage(
        "Contract confirmation is demonstrated but not saved in preview mode.",
      );
      setCandidates(null);
      return;
    }
    const form = new FormData(event.currentTarget);
    try {
      let storagePath = "Manual entry";
      if (contractFile)
        storagePath = await uploadContractFile(
          workspace.id,
          currentAudit.id,
          contractFile,
        );
      await saveContract(workspace.id, currentAudit.id, {
        clientName: String(form.get("clientName")),
        hourlyRate: form.get("hourlyRate")
          ? Number(form.get("hourlyRate"))
          : null,
        retainerAmount: form.get("retainerAmount")
          ? Number(form.get("retainerAmount"))
          : null,
        includedHours: form.get("includedHours")
          ? Number(form.get("includedHours"))
          : null,
        paymentTermsDays: form.get("paymentTermsDays")
          ? Number(form.get("paymentTermsDays"))
          : null,
        annualIncreasePercent: form.get("annualIncreasePercent")
          ? Number(form.get("annualIncreasePercent"))
          : null,
        startDate: String(form.get("startDate")),
        endDate: String(form.get("endDate")),
        confirmed: true,
        sourceName: contractFile?.name || storagePath,
      });
      setCandidates(null);
      setContractFile(null);
      onMessage("Confirmed contract terms saved.");
      await reload();
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Contract terms could not be saved.",
      );
    }
  }

  async function run() {
    if (previewMode) {
      setAudit({
        ...currentAudit,
        findings: analyzeAudit(currentAudit),
        updatedAt: new Date().toISOString(),
      });
      onMessage("Demo analysis completed with the shared production engine.");
      return;
    }
    setBusy(true);
    try {
      const result = await runCloudAudit(currentAudit.id);
      onMessage(
        `${result.findings} findings saved in immutable run ${result.runId.slice(0, 8)}.`,
      );
      await reload();
      await onRefresh();
      setTab("findings");
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  function exportFindings() {
    const fields = [
      "clientName",
      "category",
      "severity",
      "confidence",
      "amount",
      "title",
      "explanation",
      "evidence",
      "action",
    ] as const;
    const csv = [
      fields.join(","),
      ...currentAudit.findings.map((finding) =>
        fields
          .map(
            (field) =>
              `"${String(finding[field] ?? "").replaceAll('"', '""')}"`,
          )
          .join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentAudit.name.replace(/\W+/g, "-").toLowerCase()}-findings.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <header className="app-page-head audit-head">
        <div>
          <a className="back-link" href={appUrl("dashboard")}>
            ← Audit library
          </a>
          <p className="eyebrow">
            {audit.status} · {audit.currency}
          </p>
          <h1>{audit.name}</h1>
          <p>Last updated {new Date(audit.updatedAt).toLocaleString()}</p>
        </div>
        <div className="actions">
          <button className="button secondary" onClick={exportFindings}>
            Export CSV
          </button>
          <button className="button secondary" onClick={() => window.print()}>
            Print
          </button>
          <button
            className="button primary"
            onClick={() => void run()}
            disabled={busy}
          >
            Run audit
          </button>
        </div>
      </header>
      <nav className="tabs" aria-label="Audit sections">
        {(["overview", "import", "contracts", "findings"] as const).map(
          (value) => (
            <button
              className={tab === value ? "active" : ""}
              key={value}
              onClick={() => setTab(value)}
            >
              {value === "contracts" ? "Confirmed terms" : value}
              <span>
                {value === "findings"
                  ? audit.findings.length
                  : value === "contracts"
                    ? audit.contracts.length
                    : ""}
              </span>
            </button>
          ),
        )}
      </nav>

      {tab === "overview" && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Source readiness</p>
              <h2>Evidence inventory</h2>
            </div>
            <span className="readiness">
              {audit.contracts.length
                ? "Ready to analyze"
                : "Contract review needed"}
            </span>
          </div>
          <div className="source-grid">
            <article>
              <strong>{audit.clients.length}</strong>
              <span>Clients</span>
            </article>
            <article>
              <strong>{audit.contracts.length}</strong>
              <span>Confirmed contracts</span>
            </article>
            <article>
              <strong>{audit.invoices.length}</strong>
              <span>Invoices</span>
            </article>
            <article>
              <strong>{audit.payments.length}</strong>
              <span>Payments</span>
            </article>
            <article>
              <strong>{audit.timeEntries.length}</strong>
              <span>Time entries</span>
            </article>
          </div>
          <div className="method-note">
            <h3>What happens when you run this audit?</h3>
            <p>
              The server reads only records authorized for this workspace,
              applies engine {`2.0.0`}, and writes an immutable run plus its
              findings. Missing contract facts remain incomplete instead of
              becoming invented dollars.
            </p>
          </div>
        </section>
      )}

      {tab === "import" && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Source records</p>
              <h2>Import evidence</h2>
            </div>
            <a href={appUrl("integrations")}>Connect QuickBooks or Stripe →</a>
          </div>
          <div className="import-grid">
            {(
              [
                [
                  "invoices",
                  "Invoices",
                  "Amounts, issue dates, due dates, hours, and rates.",
                ],
                [
                  "payments",
                  "Payments",
                  "Amounts matched by invoice and client.",
                ],
                [
                  "time_entries",
                  "Time entries",
                  "Billable hours and invoice references.",
                ],
              ] as const
            ).map(([kind, title, description]) => (
              <article key={kind}>
                <span className="file-type">CSV</span>
                <h3>{title}</h3>
                <p>{description}</p>
                <label className="button secondary file-input">
                  Choose file
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) =>
                      event.target.files?.[0] &&
                      void handleCsv(event.target.files[0], kind)
                    }
                  />
                </label>
                <a
                  download
                  href={`../samples/${kind === "time_entries" ? "time-entries" : kind}-template.csv`}
                >
                  Download template
                </a>
              </article>
            ))}
            <article>
              <span className="file-type">PDF</span>
              <h3>Contract</h3>
              <p>
                Text-based PDF, up to 15 MB. Image-only scans require OCR and
                are rejected.
              </p>
              <label className="button secondary file-input">
                Choose contract
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(event) =>
                    event.target.files?.[0] &&
                    void handlePdf(event.target.files[0])
                  }
                />
              </label>
            </article>
          </div>
        </section>
      )}

      {tab === "contracts" && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Human confirmation</p>
              <h2>Contract terms</h2>
            </div>
            <span>{audit.contracts.length} confirmed</span>
          </div>
          {candidates && (
            <form className="contract-form" onSubmit={confirmContract}>
              <div className="notice warning">
                <strong>Candidate values—not facts</strong>
                <p>
                  Compare every value with {contractFile?.name}. Blank means the
                  deterministic extractor found nothing reliable.
                </p>
              </div>
              <div className="form-grid">
                <label className="wide">
                  Client name
                  <input
                    name="clientName"
                    defaultValue={candidates.clientName}
                    required
                  />
                </label>
                <label>
                  Hourly rate
                  <input
                    name="hourlyRate"
                    type="number"
                    min="0"
                    step=".01"
                    defaultValue={candidates.hourlyRate ?? ""}
                  />
                </label>
                <label>
                  Monthly retainer
                  <input
                    name="retainerAmount"
                    type="number"
                    min="0"
                    step=".01"
                    defaultValue={candidates.retainerAmount ?? ""}
                  />
                </label>
                <label>
                  Included hours
                  <input
                    name="includedHours"
                    type="number"
                    min="0"
                    step=".1"
                    defaultValue={candidates.includedHours ?? ""}
                  />
                </label>
                <label>
                  Payment terms (days)
                  <input
                    name="paymentTermsDays"
                    type="number"
                    min="0"
                    defaultValue={candidates.paymentTermsDays ?? ""}
                  />
                </label>
                <label>
                  Annual increase (%)
                  <input
                    name="annualIncreasePercent"
                    type="number"
                    min="0"
                    step=".1"
                    defaultValue={candidates.annualIncreasePercent ?? ""}
                  />
                </label>
                <label>
                  Start date
                  <input
                    name="startDate"
                    type="date"
                    defaultValue={candidates.startDate}
                  />
                </label>
                <label>
                  Renewal / end date
                  <input
                    name="endDate"
                    type="date"
                    defaultValue={candidates.endDate}
                  />
                </label>
              </div>
              <label className="check">
                <input type="checkbox" required />
                <span>
                  I reviewed these values against the source contract.
                </span>
              </label>
              <div className="actions">
                <button className="button primary">Confirm and save</button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setCandidates(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <div className="contract-list">
            {audit.contracts.map((contract) => (
              <article key={contract.id}>
                <div>
                  <span className="status complete">confirmed</span>
                  <h3>{contract.clientName}</h3>
                  <p>{contract.sourceName}</p>
                </div>
                <dl>
                  <div>
                    <dt>Rate</dt>
                    <dd>{currency(contract.hourlyRate, audit.currency)}</dd>
                  </div>
                  <div>
                    <dt>Retainer</dt>
                    <dd>{currency(contract.retainerAmount, audit.currency)}</dd>
                  </div>
                  <div>
                    <dt>Included</dt>
                    <dd>{contract.includedHours ?? "—"} hours</dd>
                  </div>
                  <div>
                    <dt>Terms</dt>
                    <dd>
                      {contract.paymentTermsDays === null
                        ? "—"
                        : `Net ${contract.paymentTermsDays}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Increase</dt>
                    <dd>
                      {contract.annualIncreasePercent
                        ? `${contract.annualIncreasePercent}%`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Renewal</dt>
                    <dd>{contract.endDate || "—"}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          {!audit.contracts.length && !candidates && (
            <div className="empty">
              <h3>No confirmed contracts</h3>
              <p>
                Import a PDF from the Import tab. The analyzer can still
                identify overdue invoices, but rate-based findings will remain
                incomplete.
              </p>
            </div>
          )}
        </section>
      )}

      {tab === "findings" && (
        <section className="report">
          <div className="metric-grid report-metrics">
            <article>
              <span>Potentially recoverable</span>
              <strong>{currency(summary.recoverable, audit.currency)}</strong>
              <small>Unbilled, underbilled, retainers, increases</small>
            </article>
            <article>
              <span>Overdue</span>
              <strong>{currency(summary.overdue, audit.currency)}</strong>
              <small>Outstanding past due date</small>
            </article>
            <article>
              <span>Renewal & scope risk</span>
              <strong>{currency(summary.renewalRisk, audit.currency)}</strong>
              <small>At-risk contract value</small>
            </article>
            <article>
              <span>Critical / high</span>
              <strong>
                {(summary.severity.critical || 0) +
                  (summary.severity.high || 0)}
              </strong>
              <small>{summary.severity.medium || 0} medium findings</small>
            </article>
          </div>
          <div className="findings-layout">
            <aside className="finding-filters">
              <h3>Filter findings</h3>
              <label>
                Category
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                >
                  <option value="">All categories</option>
                  {[
                    ...new Set(
                      audit.findings.map((finding) => finding.category),
                    ),
                  ].map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <button onClick={() => setFilter("")}>Reset</button>
              <hr />
              <p>
                <strong>Decision support</strong>
              </p>
              <p>
                Review source records before contacting a client or changing the
                books.
              </p>
            </aside>
            <div className="finding-list">
              <div className="list-head">
                <h2>{visibleFindings.length} findings</h2>
                <span>Sorted by estimated value</span>
              </div>
              {visibleFindings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  currencyCode={audit.currency}
                />
              ))}
              {!visibleFindings.length && (
                <div className="empty">
                  <h3>No matching findings</h3>
                  <p>Adjust the filter or import additional evidence.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function FindingCard({
  finding,
  currencyCode,
}: {
  finding: Finding;
  currencyCode: string;
}) {
  return (
    <article className={`finding-card ${finding.severity}`}>
      <span className="finding-line" />
      <div>
        <div className="finding-meta">
          <span>{finding.clientName}</span>
          <span>{finding.category}</span>
          <span>{finding.severity}</span>
          <span>{finding.confidence} confidence</span>
        </div>
        <h3>{finding.title}</h3>
        <p>{finding.explanation}</p>
        <details>
          <summary>Supporting evidence</summary>
          <p>{finding.evidence}</p>
        </details>
        <p className="next-action">
          <strong>Next action</strong>
          {finding.action}
        </p>
      </div>
      <strong className="finding-value">
        {currency(finding.amount, currencyCode)}
        <small>
          {finding.status === "incomplete" ? "incomplete" : "estimated value"}
        </small>
      </strong>
    </article>
  );
}

function IntegrationsPanel({
  workspace,
  sources,
  previewMode,
  refresh,
  setError,
  setMessage,
}: {
  workspace: Workspace;
  sources: DataSource[];
  previewMode: boolean;
  refresh: () => Promise<void>;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
}) {
  const providers = [
    {
      id: "quickbooks" as const,
      name: "QuickBooks Online",
      copy: "Customers, invoices, payments, and available time activity.",
      color: "#2ca01c",
    },
    {
      id: "stripe" as const,
      name: "Stripe data connection",
      copy: "Customers, invoices, payments, refunds, and payment status.",
      color: "#635bff",
    },
  ];
  async function connect(provider: "quickbooks" | "stripe") {
    if (previewMode) {
      setMessage("Provider OAuth activates with production credentials.");
      return;
    }
    try {
      await startProviderConnect(workspace.id, provider);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Connection failed.");
    }
  }
  return (
    <>
      <header className="app-page-head">
        <div>
          <p className="eyebrow">Connected evidence</p>
          <h1>Data sources</h1>
          <p>
            Provider tokens remain encrypted server-side and are never exposed
            to this browser.
          </p>
        </div>
      </header>
      <section className="integration-grid">
        {providers.map((provider) => {
          const source = sources.find((item) => item.provider === provider.id);
          return (
            <article key={provider.id}>
              <span
                className="provider-mark"
                style={{ background: provider.color }}
              >
                {provider.name[0]}
              </span>
              <div>
                <h2>{provider.name}</h2>
                <p>{provider.copy}</p>
                {source ? (
                  <>
                    <span className={`status ${source.status}`}>
                      {source.status}
                    </span>
                    <small>
                      {source.last_synced_at
                        ? `Last synced ${new Date(source.last_synced_at).toLocaleString()}`
                        : "Awaiting first sync"}
                    </small>
                  </>
                ) : (
                  <span className="status draft">not connected</span>
                )}
              </div>
              <div className="actions">
                {source ? (
                  <button
                    className="button secondary"
                    onClick={async () => {
                      try {
                        await syncDataSource(source.id);
                        setMessage("Synchronization queued.");
                        await refresh();
                      } catch (caught) {
                        setError(
                          caught instanceof Error
                            ? caught.message
                            : "Sync failed.",
                        );
                      }
                    }}
                  >
                    Sync now
                  </button>
                ) : (
                  <button
                    className="button primary"
                    onClick={() => void connect(provider.id)}
                  >
                    Connect
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
      <section className="panel method-note">
        <h2>How synchronization works</h2>
        <p>
          Imports are incremental and deduplicated using provider IDs. A failed
          refresh changes the source to <em>needs reauthorization</em> without
          deleting previously normalized records. Paid workspaces receive weekly
          scheduled sync and analysis.
        </p>
      </section>
    </>
  );
}

function TeamPanel({
  workspace,
  previewMode,
  setError,
  setMessage,
}: {
  workspace: Workspace;
  previewMode: boolean;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
}) {
  const [members, setMembers] = useState<
    Array<{
      user_id: string;
      role: string;
      display_name: string;
      email: string;
    }>
  >(
    previewMode
      ? [
          {
            user_id: "1",
            role: "owner",
            display_name: "Jordan Lee",
            email: "jordan@example.com",
          },
          {
            user_id: "2",
            role: "analyst",
            display_name: "Sam Rivera",
            email: "sam@example.com",
          },
        ]
      : [],
  );
  useEffect(() => {
    if (!previewMode)
      void listMembers(workspace.id)
        .then(setMembers)
        .catch((error) => setError(error.message));
  }, [workspace.id, previewMode, setError]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (previewMode) {
      setMessage("Invitations activate with production email configuration.");
      return;
    }
    const form = new FormData(event.currentTarget);
    try {
      await inviteMember(
        workspace.id,
        String(form.get("email")),
        String(form.get("role")) as "admin" | "analyst" | "viewer",
      );
      setMessage("Invitation sent.");
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invitation failed.");
    }
  }
  async function changeRole(
    userId: string,
    role: "admin" | "analyst" | "viewer",
  ) {
    try {
      await updateMemberRole(workspace.id, userId, role);
      setMembers((current) =>
        current.map((member) =>
          member.user_id === userId ? { ...member, role } : member,
        ),
      );
      setMessage("Member role updated.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Role update failed.",
      );
    }
  }
  async function remove(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this workspace?`)) return;
    try {
      await removeMember(workspace.id, userId);
      setMembers((current) =>
        current.filter((member) => member.user_id !== userId),
      );
      setMessage("Member removed.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Member removal failed.",
      );
    }
  }
  return (
    <>
      <header className="app-page-head">
        <div>
          <p className="eyebrow">Workspace access</p>
          <h1>People and roles</h1>
          <p>
            Membership controls data access. Platform administration does not
            grant customer-record access.
          </p>
        </div>
      </header>
      <div className="two-column">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Members</h2>
              <p>
                {members.length} of{" "}
                {PLAN_ENTITLEMENTS[workspace.plan_code].seats} seats used
              </p>
            </div>
          </div>
          <div className="member-list">
            {members.map((member) => (
              <article key={member.user_id}>
                <span className="avatar">
                  {(member.display_name || member.email)[0].toUpperCase()}
                </span>
                <div>
                  <strong>{member.display_name || member.email}</strong>
                  <small>{member.email}</small>
                </div>
                {workspace.role === "owner" && member.role !== "owner" ? (
                  <div className="member-actions">
                    <label
                      className="sr-only"
                      htmlFor={`role-${member.user_id}`}
                    >
                      Role for {member.display_name || member.email}
                    </label>
                    <select
                      id={`role-${member.user_id}`}
                      value={member.role}
                      onChange={(event) =>
                        void changeRole(
                          member.user_id,
                          event.target.value as "admin" | "analyst" | "viewer",
                        )
                      }
                    >
                      <option value="admin">Admin</option>
                      <option value="analyst">Analyst</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      className="text-button"
                      onClick={() =>
                        void remove(
                          member.user_id,
                          member.display_name || member.email,
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <span className="role">{member.role}</span>
                )}
              </article>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Invite a teammate</h2>
          <p>Owners and admins can invite analysts or read-only reviewers.</p>
          <form onSubmit={submit}>
            <label>
              Email address
              <input name="email" type="email" required />
            </label>
            <label>
              Role
              <select name="role">
                <option value="analyst">
                  Analyst — edit data and run audits
                </option>
                <option value="viewer">Viewer — read reports</option>
                <option value="admin">Admin — manage people and data</option>
              </select>
            </label>
            <button className="button primary full">Send invitation</button>
          </form>
        </section>
      </div>
    </>
  );
}

function BillingPanel({
  identity,
  workspace,
  usage,
  previewMode,
  setError,
}: {
  identity: AppIdentity;
  workspace: Workspace;
  usage: Usage;
  previewMode: boolean;
  setError: (value: string) => void;
}) {
  const current = PLAN_ENTITLEMENTS[workspace.plan_code];
  const metrics: Array<[string, number, number, string]> = [
    ["Seats", usage.seats, current.seats, ""],
    ["Clients", usage.clients, current.clients, ""],
    ["Active audits", usage.active_audits, current.activeAudits, ""],
    [
      "Storage",
      Math.round(usage.storage_bytes / 1024 / 1024),
      Math.round(current.storageBytes / 1024 / 1024),
      " MB",
    ],
  ];
  async function checkout(plan: "solo" | "team", interval: "month" | "year") {
    if (previewMode) {
      setError("Checkout is disabled in the public demo.");
      return;
    }
    try {
      await openCheckout(workspace.id, plan, interval);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout failed.");
    }
  }
  async function deleteWorkspace() {
    if (
      previewMode ||
      !confirm(
        `Schedule “${workspace.name}” and all of its data for permanent deletion in seven days?`,
      )
    )
      return;
    try {
      const purgeAt = await scheduleWorkspaceDeletion(workspace.id);
      await identity.refresh();
      alert(
        `Workspace deletion is scheduled for ${new Date(purgeAt).toLocaleString()}.`,
      );
      window.location.assign(appUrl("dashboard"));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Workspace deletion failed.",
      );
    }
  }
  return (
    <>
      <header className="app-page-head">
        <div>
          <p className="eyebrow">Subscription and limits</p>
          <h1>{current.name} plan</h1>
          <p>
            Entitlements are enforced by the database—not only hidden in the
            interface.
          </p>
        </div>
        {workspace.plan_code !== "free" && (
          <button
            className="button secondary"
            onClick={async () => {
              try {
                await openBillingPortal(workspace.id);
              } catch (caught) {
                setError(
                  caught instanceof Error ? caught.message : "Portal failed.",
                );
              }
            }}
          >
            Manage in Stripe
          </button>
        )}
      </header>
      <section className="panel">
        <h2>Current usage</h2>
        <div className="usage-list">
          {metrics.map(([label, used, limit, suffix]) => (
            <article key={label}>
              <div>
                <strong>{label}</strong>
                <span>
                  {used}
                  {suffix} of {limit}
                  {suffix}
                </span>
              </div>
              <progress max={limit} value={used} />
            </article>
          ))}
        </div>
      </section>
      <section className="pricing-grid compact">
        {(["solo", "team"] as const).map((code) => {
          const plan = PLAN_ENTITLEMENTS[code];
          return (
            <article
              key={code}
              className={workspace.plan_code === code ? "current" : ""}
            >
              <h3>{plan.name}</h3>
              <p className="price">
                <strong>${plan.monthlyPrice}</strong>
                <span>/month</span>
              </p>
              <ul>
                <li>{plan.clients} clients</li>
                <li>{plan.activeAudits} active audits</li>
                <li>
                  {plan.seats} seat{plan.seats > 1 ? "s" : ""}
                </li>
                <li>Connected data and scheduled audits</li>
              </ul>
              {workspace.plan_code === code ? (
                <span className="button secondary">Current plan</span>
              ) : (
                <div className="stack">
                  <button
                    className="button primary"
                    onClick={() => void checkout(code, "month")}
                  >
                    Choose monthly
                  </button>
                  <button
                    className="text-button"
                    onClick={() => void checkout(code, "year")}
                  >
                    Save with annual · ${plan.annualPrice}/year
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>
      {workspace.role === "owner" && (
        <section className="panel danger-zone">
          <h2>Delete workspace</h2>
          <p>
            Schedule this workspace and its private documents for permanent
            deletion after a seven-day recovery period.
          </p>
          <button
            className="button danger"
            onClick={() => void deleteWorkspace()}
          >
            Delete workspace
          </button>
        </section>
      )}
    </>
  );
}

function OnboardingPanel({
  identity,
  workspace,
  legacy,
  previewMode,
  refresh,
  setError,
  setMessage,
}: {
  identity: AppIdentity;
  workspace: Workspace;
  legacy: LegacyAudit[];
  previewMode: boolean;
  refresh: () => Promise<void>;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
}) {
  const [businessName, setBusinessName] = useState("");
  async function migrate(item: LegacyAudit) {
    try {
      const id = await migrateLegacyAudit(workspace.id, item);
      setMessage(
        `“${item.name}” was copied to the cloud. The local copy remains until you explicitly remove it.`,
      );
      await refresh();
      window.location.assign(appUrl("audit", { audit: id }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Migration failed.");
    }
  }
  const canCreateBusiness = !previewMode && workspace.plan_code === "team";
  return (
    <>
      <header className="app-page-head">
        <div>
          <p className="eyebrow">Guided setup</p>
          <h1>Make the workspace yours.</h1>
          <p>
            Connect a source, migrate prior local work, or create a controlled
            business workspace.
          </p>
        </div>
      </header>
      <div className="onboarding-steps">
        <section className="panel">
          <span className="step-number">1</span>
          <h2>Personal workspace ready</h2>
          <p>
            {identity.profile?.display_name || "Your profile"} owns{" "}
            {workspace.name}. Use it alone or move into a Team workspace.
          </p>
          <span className="status complete">complete</span>
        </section>
        <section className="panel">
          <span className="step-number">2</span>
          <h2>Review local audits</h2>
          {legacy.length ? (
            legacy.map((item) => (
              <article className="legacy-row" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.clients?.length || 0} clients · browser-only
                  </small>
                </div>
                <div>
                  <button
                    className="button small primary"
                    onClick={() => void migrate(item)}
                  >
                    Copy to cloud
                  </button>
                  <button
                    className="text-button"
                    onClick={async () => {
                      if (
                        confirm("Permanently delete this browser-only audit?")
                      ) {
                        await deleteLegacyAudit(item.id);
                        await refresh();
                      }
                    }}
                  >
                    Delete local
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p>No browser-only audits were found on this device.</p>
          )}
        </section>
        <section className="panel">
          <span className="step-number">3</span>
          <h2>Create a business workspace</h2>
          <p>
            Team workspaces support five seats and role-controlled
            collaboration.
          </p>
          {workspace.plan_code !== "team" && (
            <p className="notice">
              Upgrade this workspace to Team in Billing before creating a
              business workspace.
            </p>
          )}
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!canCreateBusiness) return;
              try {
                await createBusinessWorkspace(businessName);
                await identity.refresh();
                window.location.assign(appUrl("dashboard"));
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Workspace creation failed.",
                );
              }
            }}
          >
            <label>
              Business name
              <input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                required
                disabled={!canCreateBusiness}
              />
            </label>
            <button className="button primary" disabled={!canCreateBusiness}>
              Create Team workspace
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
