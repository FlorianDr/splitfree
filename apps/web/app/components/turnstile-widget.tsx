import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Cloudflare Turnstile widget for the email sign-in form, rendered explicitly from an effect so it is
 * SSR-safe (the server renders an empty box) and only loads on the page that uses it. Placed inside a
 * <Form>, Turnstile adds the hidden `cf-turnstile-response` input, which the form submits as-is.
 * Hand-rolled instead of @marsidev/react-turnstile (CLAUDE.md, platform over library).
 *
 * https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */

// Must be loaded from this exact URL; Cloudflare doesn't support proxying or caching api.js.
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** `flexible` needs at least 300 px; narrower containers get the `compact` widget. */
const FLEXIBLE_MIN_WIDTH = 300;

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      size: "flexible" | "compact";
      theme: "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | undefined;

/** Load api.js once per page, surviving re-mounts and StrictMode's double effects. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("no turnstile")));
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function TurnstileWidget({
  siteKey,
  action,
  resetSignal,
  onToken,
}: {
  siteKey: string;
  action: string;
  /** Any value that changes after a failed submit (e.g. actionData): the token is single-use. */
  resetSignal: unknown;
  onToken: (token: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        const el = box.current;
        if (cancelled || !el) return;
        widgetId.current = api.render(el, {
          sitekey: siteKey,
          action,
          size: el.clientWidth >= FLEXIBLE_MIN_WIDTH ? "flexible" : "compact",
          theme: "auto",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load the human check. Check your connection or ad blocker.");
      });
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (!resetSignal || !widgetId.current) return;
    window.turnstile?.reset(widgetId.current);
    onTokenRef.current(null);
  }, [resetSignal]);

  // React never renders children into this box, so Turnstile's own DOM can't cause hydration mismatches.
  return <div ref={box} className="min-h-[65px] w-full" />;
}
