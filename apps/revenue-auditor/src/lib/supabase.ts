import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config, isCloudConfigured } from "../config";

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
      global: {
        headers: { "x-client-info": "revenue-leak-auditor/2.0.0" },
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase)
    throw new Error("Cloud services are not configured for this deployment.");
  return supabase;
}
