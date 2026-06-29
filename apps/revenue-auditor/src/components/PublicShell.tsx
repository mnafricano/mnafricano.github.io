import type { ReactNode } from "react";
import { href, type AppIdentity } from "../App";
import { config } from "../config";

export function Brand() {
  return (
    <a
      className="brand"
      href={href("marketing")}
      aria-label="Revenue Leak Auditor home"
    >
      <span>R</span>
      <strong>Revenue Leak Auditor</strong>
    </a>
  );
}

export function PublicHeader({ identity }: { identity?: AppIdentity }) {
  return (
    <header className="public-header">
      <Brand />
      <nav aria-label="Primary navigation">
        <a href={`${href("marketing")}#how-it-works`}>How it works</a>
        <a href={`${href("marketing")}#pricing`}>Pricing</a>
        <a href={`${href("marketing")}#security`}>Security</a>
        {identity?.session ? (
          <a className="button small primary" href={href("app")}>
            Open workspace
          </a>
        ) : (
          <a className="button small secondary" href={href("login")}>
            Sign in
          </a>
        )}
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div>
        <Brand />
        <p>Private, explainable revenue recovery for service businesses.</p>
      </div>
      <nav aria-label="Product links">
        <a href={href("legal", "?doc=privacy")}>Privacy</a>
        <a href={href("legal", "?doc=terms")}>Terms</a>
        <a href={href("legal", "?doc=security")}>Security</a>
        <a
          href={
            config.supportEmail
              ? `mailto:${config.supportEmail}`
              : href("legal", "?doc=contact")
          }
        >
          Contact
        </a>
      </nav>
      <p>
        © {new Date().getFullYear()} Marcello Africano. Decision support—not
        accounting or legal advice.
      </p>
    </footer>
  );
}

export function PublicLayout({
  children,
  identity,
}: {
  children: ReactNode;
  identity?: AppIdentity;
}) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <PublicHeader identity={identity} />
      {children}
      <PublicFooter />
    </>
  );
}
