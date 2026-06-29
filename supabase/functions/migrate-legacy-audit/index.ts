import {
  authenticatedContext,
  errorResponse,
  handleOptions,
  json,
  requireWorkspaceRole,
} from "../_shared/http.ts";

function list(value: unknown): Record<string, any>[] {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object")
    : [];
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { workspaceId, legacy } = await request.json();
    if (!workspaceId || !legacy?.name) {
      throw new Error("Workspace and legacy audit are required");
    }
    const { user, userClient, admin } = await authenticatedContext(request);
    await requireWorkspaceRole(userClient, workspaceId, [
      "owner",
      "admin",
      "analyst",
    ]);
    const { data: auditId, error: createError } = await userClient.rpc(
      "create_audit",
      {
        target_workspace_id: workspaceId,
        audit_name: `${String(legacy.name).slice(0, 85)} (migrated)`,
        audit_currency: legacy.currency || "USD",
      },
    );
    if (createError) throw createError;
    const clients = list(legacy.clients);
    const contracts = list(legacy.contracts);
    const invoices = list(legacy.invoices);
    const payments = list(legacy.payments);
    const timeEntries = list(legacy.timeEntries);
    if (clients.length) {
      const { error } = await admin.from("clients").insert(
        clients.map((record) => ({
          workspace_id: workspaceId,
          audit_id: auditId,
          name: record.name,
          source: "csv",
        })),
      );
      if (error) throw error;
    }
    if (contracts.length) {
      const { error } = await admin.from("contracts").insert(
        contracts.map((record) => ({
          workspace_id: workspaceId,
          audit_id: auditId,
          client_name: record.clientName,
          hourly_rate: record.hourlyRate,
          retainer_amount: record.retainerAmount,
          included_hours: record.includedHours,
          payment_terms_days: record.paymentTermsDays,
          annual_increase_percent: record.annualIncreasePercent,
          start_date: record.startDate || null,
          end_date: record.endDate || null,
          confirmed: Boolean(record.confirmed),
          source_name: record.sourceName || "Legacy browser audit",
        })),
      );
      if (error) throw error;
    }
    if (invoices.length) {
      const { error } = await admin.from("invoices").upsert(
        invoices.map((record) => ({
          workspace_id: workspaceId,
          audit_id: auditId,
          client_name: record.clientName,
          invoice_number: record.invoiceNumber,
          invoice_date: record.invoiceDate,
          due_date: record.dueDate || null,
          amount: record.amount,
          hours: record.hours,
          rate: record.rate,
          status: record.status || "open",
          source: "csv",
          source_name: "Legacy browser audit",
        })),
        {
          onConflict: "audit_id,source,invoice_number",
          ignoreDuplicates: true,
        },
      );
      if (error) throw error;
    }
    if (payments.length) {
      const { error } = await admin.from("payments").upsert(
        payments.map((record) => ({
          workspace_id: workspaceId,
          audit_id: auditId,
          client_name: record.clientName,
          invoice_number: record.invoiceNumber,
          payment_date: record.paymentDate,
          amount: record.amount,
          source: "csv",
          source_name: "Legacy browser audit",
        })),
        {
          onConflict: "audit_id,source,invoice_number,payment_date,amount",
          ignoreDuplicates: true,
        },
      );
      if (error) throw error;
    }
    if (timeEntries.length) {
      const { error } = await admin.from("time_entries").upsert(
        timeEntries.map((record) => ({
          workspace_id: workspaceId,
          audit_id: auditId,
          client_name: record.clientName,
          entry_date: record.date,
          hours: record.hours,
          billable: record.billable ?? true,
          invoiced: record.invoiced ?? false,
          invoice_number: record.invoiceNumber || "",
          description: record.description || "",
          source: "csv",
          source_name: "Legacy browser audit",
        })),
        {
          onConflict:
            "audit_id,source,client_name,entry_date,hours,description",
          ignoreDuplicates: true,
        },
      );
      if (error) throw error;
    }
    await admin.from("audits").update({ status: "ready" }).eq("id", auditId);
    await admin.from("operational_events").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      event_type: "audit.migrated",
      entity_type: "audit",
      entity_id: auditId,
      metadata: { legacy_schema_version: legacy.schemaVersion || 1 },
    });
    return json({ auditId });
  } catch (error) {
    return errorResponse(error);
  }
});
