import { useEffect, useRef } from "react";
import { config } from "../config";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          theme: "light";
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function Captcha({ onToken }: { onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!config.turnstileSiteKey || !container.current) return;
    let widgetId = "";
    let canceled = false;
    const render = () => {
      if (canceled || !container.current || !window.turnstile || widgetId)
        return;
      widgetId = window.turnstile.render(container.current, {
        sitekey: config.turnstileSiteKey,
        callback: onToken,
        "expired-callback": () => onToken(""),
        theme: "light",
      });
    };
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-revenue-auditor-turnstile="true"]',
    );
    if (existing) {
      if (window.turnstile) render();
      else existing.addEventListener("load", render, { once: true });
    } else {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.revenueAuditorTurnstile = "true";
      script.addEventListener("load", render, { once: true });
      document.head.append(script);
    }
    return () => {
      canceled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [onToken]);

  if (!config.turnstileSiteKey) return null;
  return <div ref={container} aria-label="Automated abuse check" />;
}
