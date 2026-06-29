import { adminClient, errorResponse, json } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (
    request.headers.get("x-schedule-secret") !== Deno.env.get("SCHEDULE_SECRET")
  ) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  try {
    const now = new Date().toISOString();
    await admin.from("invitations").delete().lt("expires_at", now).is(
      "accepted_at",
      null,
    );
    await admin.from("oauth_states").delete().lt("expires_at", now);
    const { data: profiles, error: profileError } = await admin.from("profiles")
      .select("id").lte("purge_after", now);
    if (profileError) throw profileError;
    for (const profile of profiles || []) {
      const { data: owned } = await admin.from("workspaces").select("id").eq(
        "created_by",
        profile.id,
      );
      for (const workspace of owned || []) {
        const { data: auditFolders } = await admin.storage.from("contracts")
          .list(workspace.id, { limit: 1000 });
        for (const folder of auditFolders || []) {
          const prefix = `${workspace.id}/${folder.name}`;
          const { data: objects } = await admin.storage.from("contracts").list(
            prefix,
            { limit: 1000 },
          );
          if (objects?.length) {
            await admin.storage.from("contracts").remove(
              objects.map((object) => `${prefix}/${object.name}`),
            );
          }
        }
      }
      await admin.auth.admin.deleteUser(profile.id);
    }
    const { data: sources, error: sourceError } = await admin.from(
      "data_sources",
    ).select("id,workspace_id")
      .eq("status", "connected")
      .or(
        `last_synced_at.is.null,last_synced_at.lt.${
          new Date(Date.now() - 7 * 86_400_000).toISOString()
        }`,
      );
    if (sourceError) throw sourceError;
    let queued = 0;
    for (const source of sources || []) {
      const { data: plan } = await admin.rpc("plan_for_workspace", {
        target_workspace_id: source.workspace_id,
      });
      if (!["solo", "team"].includes(plan)) continue;
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-source`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-schedule-secret": Deno.env.get("SCHEDULE_SECRET")!,
        },
        body: JSON.stringify({ sourceId: source.id, scheduled: true }),
      });
      queued += 1;
    }
    return json({ purgedUsers: profiles?.length || 0, scheduledSyncs: queued });
  } catch (error) {
    return errorResponse(error, 500);
  }
});
