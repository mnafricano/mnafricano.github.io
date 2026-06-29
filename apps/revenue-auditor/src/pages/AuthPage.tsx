import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AppIdentity } from "../App";
import { href } from "../App";
import { config, isCloudConfigured, isEmailLaunchReady } from "../config";
import { PublicLayout } from "../components/PublicShell";
import { Captcha } from "../components/Captcha";
import { supabase } from "../lib/supabase";

type Mode = "login" | "signup" | "reset" | "update";

export function AuthPage({ identity }: { identity: AppIdentity }) {
  const parameters = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const [mode, setMode] = useState<Mode>(
    (parameters.get("mode") as Mode) || "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const invite =
      parameters.get("invite") ||
      localStorage.getItem("auditor-pending-invite");
    if (parameters.get("invite"))
      localStorage.setItem("auditor-pending-invite", parameters.get("invite")!);
    if (identity.session && mode !== "update") {
      if (invite && supabase) {
        void supabase
          .rpc("accept_workspace_invitation", { raw_token: invite })
          .then(({ error: inviteError }) => {
            if (inviteError) {
              setError(inviteError.message);
              localStorage.removeItem("auditor-pending-invite");
            } else {
              localStorage.removeItem("auditor-pending-invite");
              window.location.replace(href("app"));
            }
          });
      } else {
        window.location.replace(href("app"));
      }
    }
  }, [identity.session, mode, parameters]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setError(
        "Cloud accounts are awaiting production configuration. The complete product demo remains available.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken },
        });
        if (authError) throw authError;
        window.location.assign(parameters.get("next") || href("app"));
      } else if (mode === "signup") {
        if (!isEmailLaunchReady)
          throw new Error(
            "Email registration is disabled until the verified sender and abuse protection are configured.",
          );
        if (!consent)
          throw new Error(
            "Accept the Terms and Privacy Policy to create an account.",
          );
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            captchaToken,
            emailRedirectTo: `${config.appUrl}login/?mode=login`,
            data: { display_name: name, consent_version: "2026-06-28" },
          },
        });
        if (authError) throw authError;
        setMessage("Check your email to confirm the account.");
      } else if (mode === "reset") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(
          email,
          {
            captchaToken,
            redirectTo: `${config.appUrl}login/?mode=update`,
          },
        );
        if (authError) throw authError;
        setMessage(
          "If that address has an account, a secure reset link is on its way.",
        );
      } else {
        const { error: authError } = await supabase.auth.updateUser({
          password,
        });
        if (authError) throw authError;
        setMessage("Password updated. You can return to your workspace.");
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    if (!supabase) {
      setError("Google sign-in is awaiting Supabase production configuration.");
      return;
    }
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${config.appUrl}app/`, scopes: "email profile" },
    });
    if (authError) setError(authError.message);
  }

  return (
    <PublicLayout identity={identity}>
      <main id="main" className="auth-layout">
        <section className="auth-promise">
          <p className="eyebrow">A workspace with boundaries</p>
          <h1>Revenue recovery your team can trust.</h1>
          <ul>
            <li>Personal and business workspaces</li>
            <li>Role-based collaboration</li>
            <li>Private cloud documents</li>
            <li>Immutable audit history</li>
          </ul>
          <a href={href("app", "?demo=1")}>
            Explore the demo without an account →
          </a>
        </section>
        <section className="auth-card" aria-labelledby="auth-title">
          <p className="eyebrow">
            {mode === "signup"
              ? "Create an account"
              : mode === "reset"
                ? "Account recovery"
                : mode === "update"
                  ? "Choose a new password"
                  : "Welcome back"}
          </p>
          <h2 id="auth-title">
            {mode === "signup"
              ? "Start your free workspace."
              : mode === "reset"
                ? "Reset your password."
                : mode === "update"
                  ? "Secure your account."
                  : "Sign in to continue."}
          </h2>

          {!isCloudConfigured && (
            <div className="notice warning">
              <strong>Launch preview</strong>
              <p>
                Cloud credentials are intentionally absent from this build.
                Account buttons are wired and activate when production
                environment variables are supplied.
              </p>
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="notice success" role="status">
              {message}
            </div>
          )}

          {config.googleAuthEnabled &&
            mode !== "reset" &&
            mode !== "update" && (
              <button
                className="button google"
                type="button"
                onClick={() => void googleLogin()}
              >
                <span>G</span> Continue with Google
              </button>
            )}
          {mode !== "reset" && mode !== "update" && (
            <div className="or">
              <span>or use email</span>
            </div>
          )}

          <form onSubmit={submit}>
            {mode === "signup" && (
              <label>
                Full name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  autoComplete="name"
                />
              </label>
            )}
            {mode !== "update" && (
              <label>
                Email address
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                {mode === "update" ? "New password" : "Password"}
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={10}
                  required
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
                <small>At least 10 characters</small>
              </label>
            )}
            {mode === "signup" && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>
                  I agree to the <a href={href("legal", "?doc=terms")}>Terms</a>{" "}
                  and <a href={href("legal", "?doc=privacy")}>Privacy Policy</a>
                  .
                </span>
              </label>
            )}
            {mode !== "update" && <Captcha onToken={setCaptchaToken} />}
            <button
              className="button primary full"
              disabled={busy || (mode === "signup" && !isEmailLaunchReady)}
            >
              {busy
                ? "Working…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "reset"
                    ? "Send reset link"
                    : mode === "update"
                      ? "Update password"
                      : "Sign in"}
            </button>
          </form>

          <div className="auth-links">
            {mode === "login" && (
              <>
                <button onClick={() => setMode("reset")}>
                  Forgot password?
                </button>
                <button onClick={() => setMode("signup")}>
                  Create an account
                </button>
              </>
            )}
            {mode !== "login" && mode !== "update" && (
              <button onClick={() => setMode("login")}>
                Return to sign in
              </button>
            )}
            {mode === "update" && <a href={href("app")}>Return to workspace</a>}
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
