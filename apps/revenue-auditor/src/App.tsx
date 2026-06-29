import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { bootstrap } from "./lib/cloud";
import { supabase } from "./lib/supabase";
import type { Profile, Workspace } from "./types";
import { basePath, isCloudConfigured } from "./config";

const MarketingPage = lazy(() =>
  import("./pages/MarketingPage").then((module) => ({
    default: module.MarketingPage,
  })),
);
const AuthPage = lazy(() =>
  import("./pages/AuthPage").then((module) => ({ default: module.AuthPage })),
);
const ProductApp = lazy(() =>
  import("./pages/ProductApp").then((module) => ({
    default: module.ProductApp,
  })),
);
const AccountPage = lazy(() =>
  import("./pages/AccountPage").then((module) => ({
    default: module.AccountPage,
  })),
);
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })),
);
const LegalPage = lazy(() =>
  import("./pages/LegalPage").then((module) => ({ default: module.LegalPage })),
);

export interface AppIdentity {
  session: Session | null;
  profile: Profile | null;
  workspaces: Workspace[];
  refresh: () => Promise<void>;
}

function routeName():
  "marketing" | "login" | "app" | "account" | "admin" | "legal" {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path.endsWith("/login")) return "login";
  if (path.endsWith("/app")) return "app";
  if (path.endsWith("/account")) return "account";
  if (path.endsWith("/admin")) return "admin";
  if (path.endsWith("/legal")) return "legal";
  return "marketing";
}

export function href(
  route: "marketing" | "login" | "app" | "account" | "admin" | "legal",
  query = "",
): string {
  const suffix = route === "marketing" ? "/" : `/${route}/`;
  return `${basePath}${suffix}${query}`;
}

export function App() {
  const route = useMemo(routeName, []);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      const data = await bootstrap();
      setSession(data.session);
      setProfile(data.profile);
      setWorkspaces(data.workspaces);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The application could not start.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => data.subscription.unsubscribe();
  }, []);

  const identity: AppIdentity = { session, profile, workspaces, refresh };

  if (loading) {
    return (
      <main className="center-screen" aria-live="polite">
        <span className="spinner" />
        <p>Opening your secure workspace…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="center-screen">
        <p className="eyebrow">Startup error</p>
        <h1>We couldn’t open the app.</h1>
        <p>{error}</p>
        <button className="button primary" onClick={() => void refresh()}>
          Try again
        </button>
      </main>
    );
  }

  const load = (page: React.ReactNode) => (
    <Suspense
      fallback={
        <main className="center-screen">
          <span className="spinner" />
          <p>Loading…</p>
        </main>
      }
    >
      {page}
    </Suspense>
  );

  if (route === "marketing") return load(<MarketingPage identity={identity} />);
  if (route === "login") return load(<AuthPage identity={identity} />);
  if (route === "legal") return load(<LegalPage />);

  const demoRequested =
    new URLSearchParams(window.location.search).get("demo") === "1";
  if (!session && !demoRequested) {
    if (!isCloudConfigured)
      return load(<ProductApp identity={identity} previewMode />);
    window.location.replace(
      href(
        "login",
        `?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      ),
    );
    return null;
  }

  if (route === "admin") return load(<AdminPage identity={identity} />);
  if (route === "account") return load(<AccountPage identity={identity} />);
  return load(
    <ProductApp
      identity={identity}
      previewMode={demoRequested || !isCloudConfigured}
    />,
  );
}
