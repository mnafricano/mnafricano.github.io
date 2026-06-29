import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { decryptSecret, encryptSecret } from "./crypto.ts";

interface Credential {
  accessToken: string;
  refreshToken: string | null;
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
  scopes: string[];
}

export async function saveCredential(
  admin: SupabaseClient,
  sourceId: string,
  credential: Credential,
) {
  const { error } = await admin.from("oauth_credentials").upsert({
    data_source_id: sourceId,
    encrypted_access_token: await encryptSecret(credential.accessToken),
    encrypted_refresh_token: credential.refreshToken
      ? await encryptSecret(credential.refreshToken)
      : null,
    access_token_expires_at: credential.accessExpiresAt,
    refresh_token_expires_at: credential.refreshExpiresAt,
    scopes: credential.scopes,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function loadCredential(
  admin: SupabaseClient,
  sourceId: string,
): Promise<Credential> {
  const { data, error } = await admin.from("oauth_credentials").select("*").eq(
    "data_source_id",
    sourceId,
  ).single();
  if (error || !data) throw new Error("Provider credential not found");
  return {
    accessToken: await decryptSecret(data.encrypted_access_token),
    refreshToken: data.encrypted_refresh_token
      ? await decryptSecret(data.encrypted_refresh_token)
      : null,
    accessExpiresAt: data.access_token_expires_at,
    refreshExpiresAt: data.refresh_token_expires_at,
    scopes: data.scopes || [],
  };
}

async function formRequest(
  url: string,
  values: Record<string, string>,
  headers: Record<string, string> = {},
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      ...headers,
    },
    body: new URLSearchParams(values),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Provider token exchange failed (${response.status})`);
  }
  return body;
}

export async function exchangeProviderCode(
  provider: "quickbooks" | "stripe",
  code: string,
  redirectUri: string,
) {
  if (provider === "quickbooks") {
    const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID")!;
    const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET")!;
    const body = await formRequest(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      },
      { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
    );
    return {
      accessToken: body.access_token as string,
      refreshToken: body.refresh_token as string,
      accessExpiresAt: new Date(Date.now() + Number(body.expires_in) * 1000)
        .toISOString(),
      refreshExpiresAt: new Date(
        Date.now() + Number(body.x_refresh_token_expires_in) * 1000,
      ).toISOString(),
      scopes: String(body.scope || "").split(" ").filter(Boolean),
    };
  }
  const body = await formRequest("https://connect.stripe.com/oauth/token", {
    grant_type: "authorization_code",
    code,
    client_secret: Deno.env.get("STRIPE_CONNECT_CLIENT_SECRET")!,
  });
  return {
    accessToken: body.access_token as string,
    refreshToken: body.refresh_token as string | null,
    accessExpiresAt: null,
    refreshExpiresAt: null,
    scopes: [body.scope || "read_only"],
    stripeUserId: body.stripe_user_id as string,
  };
}

export async function refreshProviderCredential(
  admin: SupabaseClient,
  provider: "quickbooks" | "stripe",
  sourceId: string,
  credential: Credential,
): Promise<Credential> {
  if (!credential.refreshToken) return credential;
  if (
    credential.accessExpiresAt &&
    new Date(credential.accessExpiresAt).getTime() > Date.now() + 120_000
  ) return credential;
  let next;
  if (provider === "quickbooks") {
    const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID")!;
    const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET")!;
    const body = await formRequest(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        grant_type: "refresh_token",
        refresh_token: credential.refreshToken,
      },
      { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
    );
    next = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token || credential.refreshToken,
      accessExpiresAt: new Date(Date.now() + Number(body.expires_in) * 1000)
        .toISOString(),
      refreshExpiresAt: new Date(
        Date.now() + Number(body.x_refresh_token_expires_in) * 1000,
      ).toISOString(),
      scopes: String(body.scope || "").split(" ").filter(Boolean),
    };
  } else {
    const body = await formRequest("https://connect.stripe.com/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: credential.refreshToken,
      client_secret: Deno.env.get("STRIPE_CONNECT_CLIENT_SECRET")!,
    });
    next = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token || credential.refreshToken,
      accessExpiresAt: null,
      refreshExpiresAt: null,
      scopes: [body.scope || "read_only"],
    };
  }
  await saveCredential(admin, sourceId, next);
  return next;
}

export async function providerGetJson(
  url: string,
  token: string,
  headers: Record<string, string> = {},
) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...headers,
    },
  });
  if (response.status === 401) throw new Error("PROVIDER_REAUTH_REQUIRED");
  if (response.status === 429) throw new Error("PROVIDER_RATE_LIMITED");
  if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
  return response.json();
}
