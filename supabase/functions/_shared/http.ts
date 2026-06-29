import {
  createClient,
  type SupabaseClient,
  type User,
} from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ||
    "https://mnafricano.github.io",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature, x-schedule-secret",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Vary": "Origin",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function errorResponse(error: unknown, status = 400): Response {
  const message = error instanceof Error ? error.message : "Request failed";
  return json({ error: message }, status);
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SECRET_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function authenticatedContext(request: Request): Promise<{
  user: User;
  userClient: SupabaseClient;
  admin: SupabaseClient;
}> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Authentication required");
  }
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error("Authentication required");
  return { user: data.user, userClient, admin: adminClient() };
}

export async function requireWorkspaceRole(
  client: SupabaseClient,
  workspaceId: string,
  roles: string[] = ["owner", "admin", "analyst", "viewer"],
): Promise<string> {
  const { data, error } = await client.from("memberships").select("role")
    .eq("workspace_id", workspaceId)
    .single();
  if (error || !data || !roles.includes(data.role)) {
    throw new Error("Workspace access denied");
  }
  return data.role;
}

export function handleOptions(request: Request): Response | null {
  return request.method === "OPTIONS"
    ? new Response("ok", { headers: corsHeaders })
    : null;
}
