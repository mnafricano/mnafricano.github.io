import {
  analyzeAudit,
  type AuditInput,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  summarizeFindings,
} from "../_shared/domain.ts";
import {
  authenticatedContext,
  errorResponse,
  handleOptions,
  json,
  requireWorkspaceRole,
} from "../_shared/http.ts";
import { sha256 } from "../_shared/crypto.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { auditId } = await request.json();
    if (!auditId) throw new Error("auditId is required");
    const { user, userClient, admin } = await authenticatedContext(request);
    const { data: audit, error: auditError } = await admin.from("audits")
      .select("*").eq("id", auditId).is("deleted_at", null).single();
    if (auditError || !audit) throw new Error("Audit not found");
    await requireWorkspaceRole(userClient, audit.workspace_id, [
      "owner",
      "admin",
      "analyst",
    ]);
    await admin.from("audits").update({ status: "running" }).eq("id", auditId);

    const [clients, contracts, invoices, payments, timeEntries] = await Promise
      .all([
        admin.from("clients").select("*").eq("audit_id", auditId).is(
          "deleted_at",
          null,
        ).order("id"),
        admin.from("contracts").select("*").eq("audit_id", auditId).is(
          "deleted_at",
          null,
        ).order("id"),
        admin.from("invoices").select("*").eq("audit_id", auditId).is(
          "deleted_at",
          null,
        ).order("id"),
        admin.from("payments").select("*").eq("audit_id", auditId).is(
          "deleted_at",
          null,
        ).order("id"),
        admin.from("time_entries").select("*").eq("audit_id", auditId).is(
          "deleted_at",
          null,
        ).order("id"),
      ]);
    for (
      const result of [clients, contracts, invoices, payments, timeEntries]
    ) if (result.error) throw result.error;
    const input: AuditInput = {
      id: audit.id,
      currency: audit.currency,
      clients: (clients.data || []).map((row) => ({
        id: row.id,
        name: row.name,
        externalId: row.external_id,
      })),
      contracts: (contracts.data || []).map((row) => ({
        id: row.id,
        clientId: row.client_id,
        clientName: row.client_name,
        hourlyRate: row.hourly_rate === null ? null : Number(row.hourly_rate),
        retainerAmount: row.retainer_amount === null
          ? null
          : Number(row.retainer_amount),
        includedHours: row.included_hours === null
          ? null
          : Number(row.included_hours),
        paymentTermsDays: row.payment_terms_days,
        annualIncreasePercent: row.annual_increase_percent === null
          ? null
          : Number(row.annual_increase_percent),
        startDate: row.start_date || "",
        endDate: row.end_date || "",
        confirmed: row.confirmed,
        sourceName: row.source_name,
      })),
      invoices: (invoices.data || []).map((row) => ({
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
        source: row.source,
        externalId: row.external_id,
      })),
      payments: (payments.data || []).map((row) => ({
        id: row.id,
        clientId: row.client_id,
        clientName: row.client_name,
        invoiceNumber: row.invoice_number,
        paymentDate: row.payment_date,
        amount: Number(row.amount),
        source: row.source,
        externalId: row.external_id,
      })),
      timeEntries: (timeEntries.data || []).map((row) => ({
        id: row.id,
        clientId: row.client_id,
        clientName: row.client_name,
        date: row.entry_date,
        hours: Number(row.hours),
        billable: row.billable,
        invoiced: row.invoiced,
        invoiceNumber: row.invoice_number || "",
        description: row.description,
        source: row.source,
        externalId: row.external_id,
      })),
    };
    const snapshot = {
      clients: input.clients.length,
      contracts: input.contracts.length,
      invoices: input.invoices.length,
      payments: input.payments.length,
      timeEntries: input.timeEntries.length,
      latestSourceUpdate: [
        ...(invoices.data || []),
        ...(payments.data || []),
        ...(timeEntries.data || []),
      ].map((record) => record.updated_at).filter(Boolean).sort().at(-1) ||
        null,
    };
    const sourceHash = await sha256(JSON.stringify(input));
    const findings = analyzeAudit(input);
    const summary = summarizeFindings(findings);
    const { data: run, error: runError } = await admin.from("audit_runs")
      .insert({
        workspace_id: audit.workspace_id,
        audit_id: auditId,
        engine_version: ENGINE_VERSION,
        schema_version: SCHEMA_VERSION,
        source_snapshot: snapshot,
        source_hash: sourceHash,
        finding_count: findings.length,
        recoverable_amount: summary.recoverable,
        overdue_amount: summary.overdue,
        renewal_risk_amount: summary.renewalRisk,
        requested_by: user.id,
      }).select("id").single();
    if (runError) throw runError;
    if (findings.length) {
      const { error: findingError } = await admin.from("findings").insert(
        findings.map((finding) => ({
          id: finding.id.startsWith("finding-") && finding.id.length > 40
            ? finding.id.slice(8)
            : undefined,
          workspace_id: audit.workspace_id,
          audit_id: auditId,
          audit_run_id: run.id,
          category: finding.category,
          client_name: finding.clientName,
          amount: finding.amount,
          severity: finding.severity,
          confidence: finding.confidence,
          status: finding.status,
          title: finding.title,
          explanation: finding.explanation,
          evidence: finding.evidence,
          recommended_action: finding.action,
        })),
      );
      if (findingError) throw findingError;
    }
    await admin.from("audits").update({
      status: "complete",
      current_run_id: run.id,
    }).eq("id", auditId);
    await admin.from("operational_events").insert({
      workspace_id: audit.workspace_id,
      actor_id: user.id,
      event_type: "audit.completed",
      entity_type: "audit_run",
      entity_id: run.id,
      metadata: {
        engine_version: ENGINE_VERSION,
        finding_count: findings.length,
      },
    });
    return json({ runId: run.id, findings: findings.length });
  } catch (error) {
    return errorResponse(error);
  }
});
