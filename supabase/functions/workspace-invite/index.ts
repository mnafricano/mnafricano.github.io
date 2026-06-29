import {
  authenticatedContext,
  errorResponse,
  handleOptions,
  json,
  requireWorkspaceRole,
} from "../_shared/http.ts";
import { randomToken, sha256 } from "../_shared/crypto.ts";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(
    ">",
    "&gt;",
  ).replaceAll('"', "&quot;");
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { workspaceId, email, role } = await request.json();
    if (
      !workspaceId || !email || !["admin", "analyst", "viewer"].includes(role)
    ) throw new Error("Valid workspace, email, and role are required");
    const { user, userClient, admin } = await authenticatedContext(request);
    await requireWorkspaceRole(userClient, workspaceId, ["owner", "admin"]);
    const [{ data: usage }, { data: planCode }] = await Promise.all([
      userClient.rpc("workspace_usage", { target_workspace_id: workspaceId }),
      admin.rpc("plan_for_workspace", { target_workspace_id: workspaceId }),
    ]);
    const { data: plan } = await admin.from("plans").select("seat_limit").eq(
      "code",
      planCode || "free",
    ).single();
    if (Number(usage?.[0]?.seats || 0) >= Number(plan?.seat_limit || 1)) {
      throw new Error("Workspace seat limit reached");
    }
    const rawToken = randomToken();
    const { data: invitation, error } = await admin.from("invitations").insert({
      workspace_id: workspaceId,
      email: String(email).trim().toLowerCase(),
      role,
      token_hash: await sha256(rawToken),
      invited_by: user.id,
    }).select("id").single();
    if (error) throw error;
    const { data: workspace } = await admin.from("workspaces").select("name")
      .eq("id", workspaceId).single();
    const from = Deno.env.get("AUTH_FROM_EMAIL");
    const apiKey = Deno.env.get("SENDGRID_API_KEY");
    if (!from || !apiKey) {
      throw new Error("Transactional email is not configured");
    }
    const appUrl = Deno.env.get("APP_URL")!;
    const invitationUrl = `${appUrl}login/?mode=signup&invite=${
      encodeURIComponent(rawToken)
    }`;
    const safeWorkspace = escapeHtml(
      workspace?.name || "a Revenue Leak Auditor workspace",
    );
    const safeRole = escapeHtml(role);
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email }],
          dynamic_template_data: {
            workspace_name: workspace?.name,
            invitation_url: invitationUrl,
            role,
          },
        }],
        from: { email: from, name: "Revenue Leak Auditor" },
        subject: `You’re invited to ${
          workspace?.name || "a Revenue Leak Auditor workspace"
        }`,
        content: [
          {
            type: "text/plain",
            value:
              `You were invited as ${role}. Accept the invitation: ${invitationUrl}`,
          },
          {
            type: "text/html",
            value:
              `<p>You were invited to <strong>${safeWorkspace}</strong> as ${safeRole}.</p><p><a href="${invitationUrl}">Accept invitation</a></p><p>This link expires in seven days.</p>`,
          },
        ],
      }),
    });
    if (!response.ok) {
      await admin.from("invitations").delete().eq("id", invitation.id);
      throw new Error(`Email delivery failed (${response.status})`);
    }
    await admin.from("operational_events").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      event_type: "invitation.sent",
      entity_type: "invitation",
      entity_id: invitation.id,
      metadata: { role },
    });
    return json({ invitationId: invitation.id });
  } catch (error) {
    return errorResponse(error);
  }
});
