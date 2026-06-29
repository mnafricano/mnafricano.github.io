export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
  appUrl:
    import.meta.env.VITE_APP_URL ||
    `${window.location.origin}/revenue-auditor/`,
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || "",
  authFromEmail: import.meta.env.VITE_AUTH_FROM_EMAIL || "",
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY || "",
  googleAuthEnabled: import.meta.env.VITE_GOOGLE_AUTH_ENABLED !== "false",
  emailAuthEnabled: import.meta.env.VITE_EMAIL_AUTH_ENABLED === "true",
} as const;

export const isCloudConfigured = Boolean(
  config.supabaseUrl && config.supabaseKey,
);
export const isEmailLaunchReady = Boolean(
  config.supportEmail &&
  config.authFromEmail &&
  config.turnstileSiteKey &&
  config.emailAuthEnabled,
);
export const basePath = "/revenue-auditor";
