import { useState, type FormEvent } from "react";
import type { AppIdentity } from "../App";
import { href } from "../App";
import { Brand } from "../components/PublicShell";
import { requestDataExport, scheduleAccountDeletion } from "../lib/cloud";
import { supabase } from "../lib/supabase";

export function AccountPage({ identity }: { identity: AppIdentity }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mfa, setMfa] = useState<{ factorId: string; qr: string } | null>(null);
  const [code, setCode] = useState("");

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !identity.session) return;
    const form = new FormData(event.currentTarget);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        display_name: String(form.get("displayName")),
      })
      .eq("id", identity.session.user.id);
    if (updateError) setError(updateError.message);
    else {
      setMessage("Profile updated.");
      await identity.refresh();
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const { error: updateError } = await supabase.auth.updateUser({
      password: String(form.get("password")),
    });
    if (updateError) setError(updateError.message);
    else {
      setMessage("Password updated.");
      event.currentTarget.reset();
    }
  }

  async function beginMfa() {
    if (!supabase) return;
    const { data, error: mfaError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Revenue Leak Auditor",
    });
    if (mfaError) setError(mfaError.message);
    else setMfa({ factorId: data.id, qr: data.totp.qr_code });
  }

  async function verifyMfa() {
    if (!supabase || !mfa) return;
    const challenge = await supabase.auth.mfa.challenge({
      factorId: mfa.factorId,
    });
    if (challenge.error) {
      setError(challenge.error.message);
      return;
    }
    const result = await supabase.auth.mfa.verify({
      factorId: mfa.factorId,
      challengeId: challenge.data.id,
      code,
    });
    if (result.error) setError(result.error.message);
    else {
      setMfa(null);
      setMessage("Authenticator MFA enabled.");
    }
  }

  async function exportAccount() {
    try {
      const blob = await requestDataExport();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `revenue-auditor-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Account export created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export failed.");
    }
  }

  async function deleteAccount() {
    if (
      !confirm(
        "Schedule this account and its solely owned workspaces for permanent deletion? You will have seven days to contact support and reverse the request.",
      )
    )
      return;
    try {
      const purgeAt = await scheduleAccountDeletion();
      setMessage(
        `Deletion scheduled for ${new Date(purgeAt).toLocaleString()}.`,
      );
      await identity.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Deletion request failed.",
      );
    }
  }

  return (
    <div className="account-shell">
      <header>
        <Brand />
        <nav>
          <a href={href("app")}>Workspace</a>
          <button
            onClick={() =>
              void supabase?.auth
                .signOut()
                .then(() => window.location.assign(href("marketing")))
            }
          >
            Sign out
          </button>
        </nav>
      </header>
      <main id="main" className="account-main">
        <div className="account-title">
          <p className="eyebrow">Account and security</p>
          <h1>Your profile</h1>
          <p>
            Manage identity, security, portability, and deletion without
            contacting an administrator.
          </p>
        </div>
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
        <div className="settings-grid">
          <section className="panel">
            <h2>Profile</h2>
            <form onSubmit={updateProfile}>
              <label>
                Email
                <input value={identity.session?.user.email || ""} readOnly />
              </label>
              <label>
                Display name
                <input
                  name="displayName"
                  defaultValue={identity.profile?.display_name || ""}
                  required
                />
              </label>
              <button className="button primary">Save profile</button>
            </form>
          </section>
          <section className="panel">
            <h2>Password</h2>
            <form onSubmit={changePassword}>
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  minLength={10}
                  required
                />
              </label>
              <button className="button secondary">Change password</button>
            </form>
          </section>
          <section className="panel">
            <h2>Authenticator MFA</h2>
            <p>Add a time-based authenticator as a second factor.</p>
            {mfa ? (
              <div className="mfa-setup">
                <img src={mfa.qr} alt="Authenticator enrollment QR code" />
                <label>
                  Six-digit code
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                  />
                </label>
                <button
                  className="button primary"
                  onClick={() => void verifyMfa()}
                >
                  Verify and enable
                </button>
              </div>
            ) : (
              <button
                className="button secondary"
                onClick={() => void beginMfa()}
              >
                Set up MFA
              </button>
            )}
          </section>
          <section className="panel">
            <h2>Consent</h2>
            <p>
              Current Terms and Privacy version: <strong>2026-06-28</strong>.
            </p>
            <a href={href("legal", "?doc=privacy")}>
              Review privacy controls →
            </a>
          </section>
          <section className="panel">
            <h2>Export</h2>
            <p>
              Download account, workspace, source-record, audit-run, and
              findings data as JSON.
            </p>
            <button
              className="button secondary"
              onClick={() => void exportAccount()}
            >
              Export my data
            </button>
          </section>
          <section className="panel danger-zone">
            <h2>Deletion</h2>
            <p>
              Deletion enters a seven-day recovery period, then permanently
              purges owned customer data and private objects.
            </p>
            {identity.profile?.deletion_requested_at ? (
              <span className="status high">Deletion pending</span>
            ) : (
              <button
                className="button danger"
                onClick={() => void deleteAccount()}
              >
                Delete account
              </button>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
