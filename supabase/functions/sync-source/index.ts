import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  adminClient,
  authenticatedContext,
  errorResponse,
  handleOptions,
  json,
  requireWorkspaceRole,
} from "../_shared/http.ts";
import {
  loadCredential,
  providerGetJson,
  refreshProviderCredential,
} from "../_shared/providers.ts";

interface Normalized {
  clients: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  timeEntries: Record<string, unknown>[];
  accountName: string | null;
  cursor: string;
}

async function quickBooksSync(
  source: Record<string, any>,
  token: string,
): Promise<Normalized> {
  const environment = Deno.env.get("QUICKBOOKS_ENVIRONMENT") === "production"
    ? ""
    : "sandbox-";
  const base =
    `https://${environment}quickbooks.api.intuit.com/v3/company/${source.external_account_id}`;
  const query = async (statement: string) =>
    providerGetJson(
      `${base}/query?minorversion=75&query=${encodeURIComponent(statement)}`,
      token,
      { Accept: "application/json" },
    );
  const since = source.last_synced_at
    ? ` where Metadata.LastUpdatedTime > '${source.last_synced_at}'`
    : "";
  const [company, customers, invoices, payments, timeActivities] = await Promise
    .all([
      providerGetJson(
        `${base}/companyinfo/${source.external_account_id}?minorversion=75`,
        token,
      ),
      query(`select * from Customer${since} maxresults 1000`),
      query(`select * from Invoice${since} maxresults 1000`),
      query(`select * from Payment${since} maxresults 1000`),
      query(`select * from TimeActivity${since} maxresults 1000`),
    ]);
  const customerRows = customers.QueryResponse?.Customer || [];
  const names = new Map(
    customerRows.map((
      record: any,
    ) => [
      String(record.Id),
      record.DisplayName || record.CompanyName || "Unnamed customer",
    ]),
  );
  const invoiceRows = invoices.QueryResponse?.Invoice || [];
  const paymentRows = payments.QueryResponse?.Payment || [];
  const timeRows = timeActivities.QueryResponse?.TimeActivity || [];
  return {
    accountName: company.CompanyInfo?.CompanyName || null,
    cursor: new Date().toISOString(),
    clients: customerRows.map((record: any) => ({
      name: record.DisplayName || record.CompanyName || "Unnamed customer",
      external_id: String(record.Id),
      source: "quickbooks",
      source_updated_at: record.MetaData?.LastUpdatedTime || null,
    })),
    invoices: invoiceRows.map((record: any) => ({
      client_name: names.get(String(record.CustomerRef?.value)) ||
        record.CustomerRef?.name || "Unknown customer",
      invoice_number: record.DocNumber || String(record.Id),
      invoice_date: record.TxnDate,
      due_date: record.DueDate || null,
      amount: Number(record.TotalAmt || 0),
      hours: null,
      rate: null,
      status: Number(record.Balance || 0) <= 0
        ? "paid"
        : Number(record.Balance || 0) < Number(record.TotalAmt || 0)
        ? "partial"
        : "open",
      external_id: String(record.Id),
      source: "quickbooks",
      source_updated_at: record.MetaData?.LastUpdatedTime || null,
    })),
    payments: paymentRows.flatMap((record: any) => {
      const linked = (record.Line || []).flatMap((line: any) =>
        line.LinkedTxn || []
      ).filter((item: any) => item.TxnType === "Invoice");
      return (linked.length ? linked : [{ TxnId: String(record.Id) }]).map((
        item: any,
      ) => ({
        client_name: names.get(String(record.CustomerRef?.value)) ||
          record.CustomerRef?.name || "Unknown customer",
        invoice_number: invoiceRows.find((invoice: any) =>
          String(invoice.Id) === String(item.TxnId)
        )?.DocNumber || String(item.TxnId),
        payment_date: record.TxnDate,
        amount: Number(record.TotalAmt || 0) / Math.max(1, linked.length),
        external_id: `${record.Id}:${item.TxnId}`,
        source: "quickbooks",
        source_updated_at: record.MetaData?.LastUpdatedTime || null,
      }));
    }),
    timeEntries: timeRows.map((record: any) => ({
      client_name: names.get(String(record.CustomerRef?.value)) ||
        record.CustomerRef?.name || "Unknown customer",
      entry_date: record.TxnDate,
      hours: Number(record.Hours || 0) + Number(record.Minutes || 0) / 60,
      billable: record.BillableStatus !== "NotBillable",
      invoiced: record.BillableStatus === "HasBeenBilled",
      invoice_number: "",
      description: record.Description || "",
      external_id: String(record.Id),
      source: "quickbooks",
      source_updated_at: record.MetaData?.LastUpdatedTime || null,
    })),
  };
}

async function stripeSync(
  source: Record<string, any>,
  token: string,
): Promise<Normalized> {
  const since = source.last_synced_at
    ? Math.floor(new Date(source.last_synced_at).getTime() / 1000)
    : null;
  const suffix = `limit=100${since ? `&created[gte]=${since}` : ""}`;
  const [account, customers, invoices, intents, refunds] = await Promise.all([
    providerGetJson("https://api.stripe.com/v1/account", token),
    providerGetJson(`https://api.stripe.com/v1/customers?${suffix}`, token),
    providerGetJson(`https://api.stripe.com/v1/invoices?${suffix}`, token),
    providerGetJson(
      `https://api.stripe.com/v1/payment_intents?${suffix}`,
      token,
    ),
    providerGetJson(`https://api.stripe.com/v1/refunds?${suffix}`, token),
  ]);
  const customerNames = new Map(
    (customers.data || []).map((
      record: any,
    ) => [record.id, record.name || record.email || record.id]),
  );
  const invoiceNumbers = new Map(
    (invoices.data || []).map((
      record: any,
    ) => [record.id, record.number || record.id]),
  );
  const minor = (amount: number, currency: string) =>
    ["jpy", "krw"].includes(currency) ? amount : amount / 100;
  return {
    accountName: account.business_profile?.name ||
      account.settings?.dashboard?.display_name || account.email ||
      source.external_account_id,
    cursor: new Date().toISOString(),
    clients: (customers.data || []).map((record: any) => ({
      name: record.name || record.email || record.id,
      external_id: record.id,
      source: "stripe",
      source_updated_at: new Date(record.created * 1000).toISOString(),
    })),
    invoices: (invoices.data || []).map((record: any) => ({
      client_name: customerNames.get(record.customer) || record.customer_name ||
        record.customer_email || "Unknown customer",
      invoice_number: record.number || record.id,
      invoice_date: new Date(record.created * 1000).toISOString().slice(0, 10),
      due_date: record.due_date
        ? new Date(record.due_date * 1000).toISOString().slice(0, 10)
        : null,
      amount: minor(record.total, record.currency),
      hours: null,
      rate: null,
      status: record.status,
      external_id: record.id,
      source: "stripe",
      source_updated_at: new Date(
        (record.status_transitions?.finalized_at || record.created) * 1000,
      ).toISOString(),
    })),
    payments: [
      ...(intents.data || []).filter((record: any) =>
        record.status === "succeeded"
      ).map((record: any) => ({
        client_name: customerNames.get(record.customer) ||
          record.receipt_email || "Unknown customer",
        invoice_number: invoiceNumbers.get(record.invoice) ||
          record.metadata?.invoice_number || record.invoice || record.id,
        payment_date: new Date(record.created * 1000).toISOString().slice(
          0,
          10,
        ),
        amount: minor(record.amount_received, record.currency),
        external_id: record.id,
        source: "stripe",
        source_updated_at: new Date(record.created * 1000).toISOString(),
      })),
      ...(refunds.data || []).map((record: any) => ({
        client_name: "Refunded customer",
        invoice_number: record.metadata?.invoice_number ||
          record.payment_intent || record.charge,
        payment_date: new Date(record.created * 1000).toISOString().slice(
          0,
          10,
        ),
        amount: -minor(record.amount, record.currency),
        external_id: record.id,
        source: "stripe",
        source_updated_at: new Date(record.created * 1000).toISOString(),
      })),
    ],
    timeEntries: [],
  };
}

async function upsertRows(
  admin: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  workspaceId: string,
  auditId: string,
  conflict: string,
) {
  if (!rows.length) return 0;
  const { data, error } = await admin.from(table).upsert(
    rows.map((row) => ({
      ...row,
      workspace_id: workspaceId,
      audit_id: auditId,
    })),
    { onConflict: conflict, ignoreDuplicates: false },
  ).select("id");
  if (error) throw error;
  return data?.length || 0;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const admin = adminClient();
  let jobId: string | null = null;
  let source: Record<string, any> | null = null;
  try {
    const { sourceId, scheduled = false } = await request.json();
    if (!sourceId) throw new Error("sourceId is required");
    const internalSchedule = scheduled &&
      request.headers.get("x-schedule-secret") ===
        Deno.env.get("SCHEDULE_SECRET");
    const { data: sourceData, error: sourceError } = await admin.from(
      "data_sources",
    ).select("*").eq("id", sourceId).single();
    if (sourceError || !sourceData) throw new Error("Data source not found");
    source = sourceData;
    if (!internalSchedule) {
      const { userClient } = await authenticatedContext(request);
      await requireWorkspaceRole(userClient, source.workspace_id, [
        "owner",
        "admin",
        "analyst",
      ]);
    }
    const { data: plan } = await admin.rpc("plan_for_workspace", {
      target_workspace_id: source.workspace_id,
    });
    if (!["solo", "team"].includes(plan)) {
      throw new Error("Connected synchronization requires a paid plan");
    }
    const { data: job, error: jobError } = await admin.from("sync_jobs").insert(
      {
        workspace_id: source.workspace_id,
        data_source_id: source.id,
        status: "running",
        trigger: internalSchedule ? "scheduled" : "manual",
        started_at: new Date().toISOString(),
      },
    ).select("id").single();
    if (jobError) throw jobError;
    jobId = job.id;
    await admin.from("data_sources").update({ status: "syncing" }).eq(
      "id",
      source.id,
    );
    let credential = await loadCredential(admin, source.id);
    credential = await refreshProviderCredential(
      admin,
      source.provider,
      source.id,
      credential,
    );
    const normalized = source.provider === "quickbooks"
      ? await quickBooksSync(source, credential.accessToken)
      : await stripeSync(source, credential.accessToken);
    let { data: audit } = await admin.from("audits").select("id").eq(
      "workspace_id",
      source.workspace_id,
    )
      .is("deleted_at", null).neq("status", "archived").order("updated_at", {
        ascending: false,
      }).limit(1).maybeSingle();
    if (!audit) {
      const { data: created, error: createError } = await admin.from("audits")
        .insert({
          workspace_id: source.workspace_id,
          name: "Connected revenue monitor",
          currency: "USD",
          status: "ready",
          created_by: source.created_by,
        }).select("id").single();
      if (createError) throw createError;
      audit = created;
    }
    const clientsWritten = await upsertRows(
      admin,
      "clients",
      normalized.clients,
      source.workspace_id,
      audit.id,
      "audit_id,source,external_id",
    );
    const invoicesWritten = await upsertRows(
      admin,
      "invoices",
      normalized.invoices,
      source.workspace_id,
      audit.id,
      "audit_id,source,invoice_number",
    );
    const paymentsWritten = await upsertRows(
      admin,
      "payments",
      normalized.payments,
      source.workspace_id,
      audit.id,
      "audit_id,source,invoice_number,payment_date,amount",
    );
    const timeWritten = await upsertRows(
      admin,
      "time_entries",
      normalized.timeEntries,
      source.workspace_id,
      audit.id,
      "audit_id,source,client_name,entry_date,hours,description",
    );
    const written = clientsWritten + invoicesWritten + paymentsWritten +
      timeWritten;
    await admin.from("data_sources").update({
      status: "connected",
      external_account_name: normalized.accountName,
      last_synced_at: normalized.cursor,
      last_cursor: normalized.cursor,
      last_error_code: null,
    }).eq("id", source.id);
    await admin.from("sync_jobs").update({
      status: "complete",
      records_read: written,
      records_written: written,
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);
    await admin.from("operational_events").insert({
      workspace_id: source.workspace_id,
      event_type: "data_source.synced",
      entity_type: "data_source",
      entity_id: source.id,
      metadata: { provider: source.provider, records_written: written },
    });
    return json({ jobId, auditId: audit.id, recordsWritten: written });
  } catch (error) {
    const code = error instanceof Error
      ? error.message.slice(0, 80)
      : "SYNC_FAILED";
    if (jobId) {
      await admin.from("sync_jobs").update({
        status: "failed",
        error_code: code,
        finished_at: new Date().toISOString(),
      }).eq("id", jobId);
    }
    if (source) {
      await admin.from("data_sources").update({
        status: code === "PROVIDER_REAUTH_REQUIRED" ? "needs_reauth" : "error",
        last_error_code: code,
      }).eq("id", source.id);
    }
    return errorResponse(error);
  }
});
