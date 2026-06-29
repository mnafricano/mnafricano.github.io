import type { Session, User } from "@supabase/supabase-js";
import type {
  ContractRecord,
  Finding,
  InvoiceRecord,
  PaymentRecord,
  TimeEntryRecord,
} from "../../../../supabase/functions/_shared/domain";
import { requireSupabase, supabase } from "./supabase";
import type {
  AdminMetrics,
  AuditDetail,
  AuditListItem,
  DataSource,
  Profile,
  Usage,
  Workspace,
} from "../types";
import type { ImportKind } from "./csv";
import type { LegacyAudit } from "./localMigration";

export interface BootstrapData {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  workspaces: Workspace[];
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function bootstrap(): Promise<BootstrapData> {
  if (!supabase)
    return { session: null, user: null, profile: null, workspaces: [] };
  const { data: auth, error: authError } = await supabase.auth.getSession();
  fail(authError);
  const user = auth.session?.user || null;
  if (!user)
    return { session: null, user: null, profile: null, workspaces: [] };
  const [
    { data: profile, error: profileError },
    { data: workspaces, error: workspaceError },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.rpc("my_workspaces"),
  ]);
  fail(profileError);
  fail(workspaceError);
  return {
    session: auth.session,
    user,
    profile: profile as Profile,
    workspaces: (workspaces || []) as Workspace[],
  };
}

export async function listAudits(
  workspaceId: string,
): Promise<AuditListItem[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("audits")
    .select(
      "id,name,currency,status,current_run_id,updated_at,current_run:audit_runs!audits_current_run_fk(finding_count)",
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  fail(error);
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    name: String(row.name),
    currency: String(row.currency),
    status: row.status as AuditListItem["status"],
    current_run_id: row.current_run_id ? String(row.current_run_id) : null,
    updated_at: String(row.updated_at),
    finding_count: Number(
      (row.current_run as { finding_count?: number } | null)?.finding_count ||
        0,
    ),
  }));
}

export async function createAudit(
  workspaceId: string,
  name: string,
  currency: string,
): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("create_audit", {
    target_workspace_id: workspaceId,
    audit_name: name,
    audit_currency: currency,
  });
  fail(error);
  return String(data);
}

export async function createBusinessWorkspace(name: string): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("create_business_workspace", {
    workspace_name: name,
  });
  fail(error);
  return String(data);
}

export async function archiveAudit(auditId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("audits")
    .update({ status: "archived" })
    .eq("id", auditId);
  fail(error);
}

export async function listMembers(
  workspaceId: string,
): Promise<
  Array<{ user_id: string; role: string; display_name: string; email: string }>
> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("workspace_members", {
    target_workspace_id: workspaceId,
  });
  fail(error);
  return (data || []) as Array<{
    user_id: string;
    role: string;
    display_name: string;
    email: string;
  }>;
}

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: "admin" | "analyst" | "viewer",
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("memberships")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function removeMember(
  workspaceId: string,
  userId: string,
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("memberships")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function loadAudit(auditId: string): Promise<AuditDetail> {
  const client = requireSupabase();
  const [
    auditResult,
    clientsResult,
    contractsResult,
    invoicesResult,
    paymentsResult,
    timeResult,
    findingsResult,
  ] = await Promise.all([
    client.from("audits").select("*").eq("id", auditId).single(),
    client
      .from("clients")
      .select("*")
      .eq("audit_id", auditId)
      .is("deleted_at", null),
    client
      .from("contracts")
      .select("*")
      .eq("audit_id", auditId)
      .is("deleted_at", null),
    client
      .from("invoices")
      .select("*")
      .eq("audit_id", auditId)
      .is("deleted_at", null),
    client
      .from("payments")
      .select("*")
      .eq("audit_id", auditId)
      .is("deleted_at", null),
    client
      .from("time_entries")
      .select("*")
      .eq("audit_id", auditId)
      .is("deleted_at", null),
    client
      .from("findings")
      .select("*")
      .eq("audit_id", auditId)
      .order("amount", { ascending: false }),
  ]);
  [
    auditResult,
    clientsResult,
    contractsResult,
    invoicesResult,
    paymentsResult,
    timeResult,
    findingsResult,
  ].forEach((result) => fail(result.error));
  const audit = auditResult.data;
  return {
    id: audit.id,
    name: audit.name,
    workspaceId: audit.workspace_id,
    currency: audit.currency,
    status: audit.status,
    updatedAt: audit.updated_at,
    clients: (clientsResult.data || []).map((row) => ({
      id: row.id,
      name: row.name,
      externalId: row.external_id,
    })),
    contracts: (contractsResult.data || []).map((row): ContractRecord => ({
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      hourlyRate: row.hourly_rate === null ? null : Number(row.hourly_rate),
      retainerAmount:
        row.retainer_amount === null ? null : Number(row.retainer_amount),
      includedHours:
        row.included_hours === null ? null : Number(row.included_hours),
      paymentTermsDays: row.payment_terms_days,
      annualIncreasePercent:
        row.annual_increase_percent === null
          ? null
          : Number(row.annual_increase_percent),
      startDate: row.start_date || "",
      endDate: row.end_date || "",
      confirmed: row.confirmed,
      sourceName: row.source_name,
    })),
    invoices: (invoicesResult.data || []).map((row): InvoiceRecord => ({
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date || "",
      amount: Number(row.amount),
      hours: row.hours === null ? null : Number(row.hours),
      rate: row.rate === null ? null : Number(row.rate),
      status: row.status,
      externalId: row.external_id,
      source: row.source,
    })),
    payments: (paymentsResult.data || []).map((row): PaymentRecord => ({
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      invoiceNumber: row.invoice_number,
      paymentDate: row.payment_date,
      amount: Number(row.amount),
      externalId: row.external_id,
      source: row.source,
    })),
    timeEntries: (timeResult.data || []).map((row): TimeEntryRecord => ({
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      date: row.entry_date,
      hours: Number(row.hours),
      billable: row.billable,
      invoiced: row.invoiced,
      invoiceNumber: row.invoice_number || "",
      description: row.description,
      externalId: row.external_id,
      source: row.source,
    })),
    findings: (findingsResult.data || [])
      .filter((row) => row.audit_run_id === audit.current_run_id)
      .map((row): Finding => ({
        id: row.id,
        category: row.category,
        clientName: row.client_name,
        amount: row.amount === null ? null : Number(row.amount),
        severity: row.severity,
        confidence: row.confidence,
        title: row.title,
        explanation: row.explanation,
        evidence: row.evidence,
        action: row.recommended_action,
        status: row.status,
      })),
  };
}

export async function importRows(
  workspaceId: string,
  auditId: string,
  kind: ImportKind,
  rows: Record<string, unknown>[],
  sourceName: string,
): Promise<number> {
  const client = requireSupabase();
  const table = kind;
  const clientNames = [
    ...new Set(
      rows.map((row) => String(row.client_name || "").trim()).filter(Boolean),
    ),
  ];
  const { data: existingClients, error: clientReadError } = await client
    .from("clients")
    .select("name")
    .eq("audit_id", auditId)
    .is("deleted_at", null);
  fail(clientReadError);
  const existingNames = new Set(
    (existingClients || []).map((record) => record.name.toLocaleLowerCase()),
  );
  const missingClients = clientNames.filter(
    (name) => !existingNames.has(name.toLocaleLowerCase()),
  );
  if (missingClients.length) {
    const { error: clientInsertError } = await client.from("clients").insert(
      missingClients.map((name) => ({
        workspace_id: workspaceId,
        audit_id: auditId,
        name,
        source: "csv",
      })),
    );
    fail(clientInsertError);
  }
  const payload = rows.map((input) => ({
    ...input,
    ...(kind === "time_entries"
      ? { entry_date: input.date, date: undefined }
      : {}),
    workspace_id: workspaceId,
    audit_id: auditId,
    source: "csv",
    source_name: sourceName,
  }));
  const { data, error } = await client
    .from(table)
    .upsert(payload, {
      onConflict:
        kind === "invoices"
          ? "audit_id,source,invoice_number"
          : kind === "payments"
            ? "audit_id,source,invoice_number,payment_date,amount"
            : "audit_id,source,client_name,entry_date,hours,description",
      ignoreDuplicates: true,
    })
    .select("id");
  fail(error);
  await client.from("audits").update({ status: "ready" }).eq("id", auditId);
  return data?.length || 0;
}

export async function saveContract(
  workspaceId: string,
  auditId: string,
  contract: Omit<ContractRecord, "id"> & { id?: string },
): Promise<void> {
  const client = requireSupabase();
  const payload = {
    id: contract.id,
    workspace_id: workspaceId,
    audit_id: auditId,
    client_id: contract.clientId,
    client_name: contract.clientName,
    hourly_rate: contract.hourlyRate,
    retainer_amount: contract.retainerAmount,
    included_hours: contract.includedHours,
    payment_terms_days: contract.paymentTermsDays,
    annual_increase_percent: contract.annualIncreasePercent,
    start_date: contract.startDate || null,
    end_date: contract.endDate || null,
    confirmed: contract.confirmed,
    source_name: contract.sourceName || "Manual entry",
  };
  const { error } = await client.from("contracts").upsert(payload);
  fail(error);
}

export async function uploadContractFile(
  workspaceId: string,
  auditId: string,
  file: File,
): Promise<string> {
  const client = requireSupabase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${workspaceId}/${auditId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await client.storage.from("contracts").upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  fail(error);
  return path;
}

export async function runCloudAudit(
  auditId: string,
): Promise<{ runId: string; findings: number }> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("run-audit", {
    body: { auditId },
  });
  fail(error);
  return data as { runId: string; findings: number };
}

export async function getUsage(workspaceId: string): Promise<Usage> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("workspace_usage", {
    target_workspace_id: workspaceId,
  });
  fail(error);
  return (data?.[0] || {
    seats: 0,
    clients: 0,
    active_audits: 0,
    storage_bytes: 0,
  }) as Usage;
}

export async function listDataSources(
  workspaceId: string,
): Promise<DataSource[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("data_sources")
    .select(
      "id,provider,status,external_account_name,last_synced_at,last_error_code",
    )
    .eq("workspace_id", workspaceId);
  fail(error);
  return (data || []) as DataSource[];
}

export async function startProviderConnect(
  workspaceId: string,
  provider: "quickbooks" | "stripe",
): Promise<void> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("oauth-start", {
    body: { workspaceId, provider },
  });
  fail(error);
  window.location.assign(data.url);
}

export async function syncDataSource(sourceId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.functions.invoke("sync-source", {
    body: { sourceId },
  });
  fail(error);
}

export async function openCheckout(
  workspaceId: string,
  plan: "solo" | "team",
  interval: "month" | "year",
): Promise<void> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("billing-checkout", {
    body: { workspaceId, plan, interval },
  });
  fail(error);
  window.location.assign(data.url);
}

export async function openBillingPortal(workspaceId: string): Promise<void> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("billing-portal", {
    body: { workspaceId },
  });
  fail(error);
  window.location.assign(data.url);
}

export async function inviteMember(
  workspaceId: string,
  email: string,
  role: "admin" | "analyst" | "viewer",
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.functions.invoke("workspace-invite", {
    body: { workspaceId, email, role },
  });
  fail(error);
}

export async function migrateLegacyAudit(
  workspaceId: string,
  legacy: LegacyAudit,
): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(
    "migrate-legacy-audit",
    {
      body: { workspaceId, legacy },
    },
  );
  fail(error);
  return data.auditId;
}

export async function requestDataExport(): Promise<Blob> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("account-lifecycle", {
    body: { action: "export" },
  });
  fail(error);
  return new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
}

export async function scheduleAccountDeletion(): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("account-lifecycle", {
    body: { action: "delete" },
  });
  fail(error);
  return data.purgeAt;
}

export async function scheduleWorkspaceDeletion(
  workspaceId: string,
): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("account-lifecycle", {
    body: { action: "delete-workspace", workspaceId },
  });
  fail(error);
  return data.purgeAt;
}

export async function loadAdminMetrics(): Promise<AdminMetrics> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("platform-admin", {
    body: { action: "metrics" },
  });
  fail(error);
  return data as AdminMetrics;
}
