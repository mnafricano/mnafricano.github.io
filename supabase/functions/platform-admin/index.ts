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
    const { user, admin } = await authenticatedContext(request);
    const { data: profile } = await admin.from("profiles").select(
      "is_platform_admin",
    ).eq("id", user.id).single();
    if (!profile?.is_platform_admin) {
      return json({ error: "Platform administrator access required" }, 403);
    }
    const [
      users,
      workspaces,
      paid,
      failedSyncs,
      failedWebhooks,
      deletions,
    ] = await Promise.all([
      admin.from("profiles").select("*", { count: "exact", head: true }),
      admin.from("workspaces").select("*", { count: "exact", head: true }),
      admin.from("subscriptions").select("*", { count: "exact", head: true })
        .in("status", ["active", "trialing"]).neq("plan_code", "free"),
      admin.from("sync_jobs").select("*", { count: "exact", head: true }).eq(
        "status",
        "failed",
      ),
      admin.from("webhook_events").select("*", { count: "exact", head: true })
        .eq("status", "failed"),
      admin.from("profiles").select("*", { count: "exact", head: true }).not(
        "deletion_requested_at",
        "is",
        null,
      ),
    ]);
    return json({
      users: users.count || 0,
      workspaces: workspaces.count || 0,
      paid_workspaces: paid.count || 0,
      failed_syncs: failedSyncs.count || 0,
      failed_webhooks: failedWebhooks.count || 0,
      pending_deletions: deletions.count || 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
