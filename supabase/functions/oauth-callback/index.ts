import { adminClient } from "../_shared/http.ts";
import { sha256 } from "../_shared/crypto.ts";
import { exchangeProviderCode, saveCredential } from "../_shared/providers.ts";

function redirect(status: string, provider: string): Response {
  const app = Deno.env.get("APP_URL") ||
    "https://mnafricano.github.io/revenue-auditor/";
  return Response.redirect(
    `${app}app/?view=integrations&oauth=${
      encodeURIComponent(status)
    }&provider=${encodeURIComponent(provider)}`,
    302,
  );
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") as "quickbooks" | "stripe";
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  if (!state || !code || !["quickbooks", "stripe"].includes(provider)) {
    return redirect("invalid", provider || "unknown");
  }
  const admin = adminClient();
  try {
    const stateHash = await sha256(state);
    const { data: oauthState, error } = await admin.from("oauth_states").select(
      "*",
    )
      .eq("state_hash", stateHash)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();
    if (error || !oauthState || oauthState.provider !== provider) {
      throw new Error("OAuth state is invalid or expired");
    }
    await admin.from("oauth_states").update({
      consumed_at: new Date().toISOString(),
    }).eq("id", oauthState.id);
    const redirectUri = `${
      Deno.env.get("SUPABASE_URL")
    }/functions/v1/oauth-callback?provider=${provider}`;
    const credential = await exchangeProviderCode(provider, code, redirectUri);
    const externalId = provider === "quickbooks"
      ? realmId
      : credential.stripeUserId;
    if (!externalId) throw new Error("Provider account identity missing");
    const { data: source, error: sourceError } = await admin.from(
      "data_sources",
    ).upsert({
      workspace_id: oauthState.workspace_id,
      provider,
      status: "connected",
      external_account_id: externalId,
      created_by: oauthState.created_by,
      last_error_code: null,
    }, { onConflict: "workspace_id,provider,external_account_id" }).select("id")
      .single();
    if (sourceError) throw sourceError;
    await saveCredential(admin, source.id, credential);
    await admin.from("operational_events").insert({
      workspace_id: oauthState.workspace_id,
      actor_id: oauthState.created_by,
      event_type: "data_source.connected",
      entity_type: "data_source",
      entity_id: source.id,
      metadata: { provider },
    });
    return redirect("connected", provider);
  } catch {
    return redirect("error", provider);
  }
});
