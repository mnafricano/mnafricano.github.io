import {
  authenticatedContext,
  errorResponse,
  handleOptions,
  json,
} from "../_shared/http.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { action, workspaceId } = await request.json();
    const { user, admin } = await authenticatedContext(request);
    const { data: memberships, error: membershipError } = await admin.from(
      "memberships",
    ).select("workspace_id,role,workspaces(*)").eq("user_id", user.id);
    if (membershipError) throw membershipError;
    const workspaceIds = (memberships || []).map((record) =>
      record.workspace_id
    );
    if (action === "export") {
      const output: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        memberships,
      };
      for (
        const table of [
          "subscriptions",
          "audits",
          "clients",
          "contracts",
          "invoices",
          "payments",
          "time_entries",
          "data_sources",
          "sync_jobs",
          "audit_runs",
          "findings",
          "operational_events",
          "consent_acceptances",
        ]
      ) {
        const query = admin.from(table).select("*");
        const result = table === "consent_acceptances"
          ? await query.eq("user_id", user.id)
          : workspaceIds.length
          ? await query.in("workspace_id", workspaceIds)
          : { data: [], error: null };
        if (result.error) throw result.error;
        output[table] = result.data;
      }
      return json(output);
    }
    if (action === "delete") {
      const owned = (memberships || []).filter((record) =>
        record.role === "owner"
      );
      for (const record of owned) {
        const { count } = await admin.from("memberships").select("*", {
          count: "exact",
          head: true,
        }).eq("workspace_id", record.workspace_id);
        if ((count || 0) > 1) {
          throw new Error(
            "Transfer ownership of shared workspaces before deleting the account",
          );
        }
      }
      const purgeAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
      await admin.from("profiles").update({
        deletion_requested_at: new Date().toISOString(),
        purge_after: purgeAt,
      }).eq("id", user.id);
      if (owned.length) {
        await admin.from("workspaces").update({
          deletion_requested_at: new Date().toISOString(),
          purge_after: purgeAt,
        }).in("id", owned.map((record) => record.workspace_id));
      }
      await admin.from("operational_events").insert(owned.map((record) => ({
        workspace_id: record.workspace_id,
        actor_id: user.id,
        event_type: "account.deletion_scheduled",
        entity_type: "profile",
        entity_id: user.id,
        metadata: { purge_after: purgeAt },
      })));
      return json({ purgeAt });
    }
    if (action === "delete-workspace") {
      const membership = (memberships || []).find((record) =>
        record.workspace_id === workspaceId
      );
      if (!workspaceId || membership?.role !== "owner") {
        throw new Error("Only the workspace owner can schedule deletion");
      }
      const purgeAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
      const { error: updateError } = await admin.from("workspaces").update({
        deletion_requested_at: new Date().toISOString(),
        purge_after: purgeAt,
      }).eq("id", workspaceId);
      if (updateError) throw updateError;
      await admin.from("operational_events").insert({
        workspace_id: workspaceId,
        actor_id: user.id,
        event_type: "workspace.deletion_scheduled",
        entity_type: "workspace",
        entity_id: workspaceId,
        metadata: { purge_after: purgeAt },
      });
      return json({ purgeAt });
    }
    throw new Error("Unsupported lifecycle action");
  } catch (error) {
    return errorResponse(error);
  }
});
