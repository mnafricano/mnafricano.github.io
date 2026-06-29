import {
  authenticatedContext,
  errorResponse,
  handleOptions,
  json,
  requireWorkspaceRole,
} from "../_shared/http.ts";
import { randomToken, sha256 } from "../_shared/crypto.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { workspaceId, provider } = await request.json();
    if (!workspaceId || !["quickbooks", "stripe"].includes(provider)) {
      throw new Error("Valid workspaceId and provider are required");
    }
    const { user, userClient, admin } = await authenticatedContext(request);
    await requireWorkspaceRole(userClient, workspaceId, ["owner", "admin"]);
    const { data: plan } = await admin.rpc("plan_for_workspace", {
      target_workspace_id: workspaceId,
    });
    if (!["solo", "team"].includes(plan)) {
      throw new Error("Connected data requires a Solo or Team plan");
    }
    const rawState = randomToken();
    const { error } = await admin.from("oauth_states").insert({
      workspace_id: workspaceId,
      provider,
      state_hash: await sha256(rawState),
      created_by: user.id,
    });
    if (error) throw error;
    const redirectUri = `${
      Deno.env.get("SUPABASE_URL")
    }/functions/v1/oauth-callback?provider=${provider}`;
    let url: URL;
    if (provider === "quickbooks") {
      url = new URL("https://appcenter.intuit.com/connect/oauth2");
      url.search = new URLSearchParams({
        client_id: Deno.env.get("QUICKBOOKS_CLIENT_ID")!,
        response_type: "code",
        scope: "com.intuit.quickbooks.accounting openid profile email",
        redirect_uri: redirectUri,
        state: rawState,
      }).toString();
    } else {
      url = new URL("https://connect.stripe.com/oauth/authorize");
      url.search = new URLSearchParams({
        client_id: Deno.env.get("STRIPE_CONNECT_CLIENT_ID")!,
        response_type: "code",
        scope: "read_only",
        redirect_uri: redirectUri,
        state: rawState,
      }).toString();
    }
    return json({ url: url.toString() });
  } catch (error) {
    return errorResponse(error);
  }
});
