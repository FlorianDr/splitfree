/**
 * Server-side Cloudflare Turnstile verification for the email-code request (the bot incident: a
 * script using /login to make us email codes to arbitrary addresses). Pure — no env, no `~/` imports,
 * `fetch` injectable — so node:test can load it. Plain `fetch` + `AbortSignal.timeout` instead of an
 * SDK (CLAUDE.md, platform over library).
 *
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Cloudflare's documented maximum token length. */
const MAX_TOKEN_LENGTH = 2048;

/**
 * Cloudflare's dummy keys (1x… always pass, 2x… always fail, 3x… force an interactive challenge).
 * The always-pass secret accepts any non-empty token (not only the dummy one), so they never belong
 * in production.
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const isTurnstileTestKey = (key: string): boolean => /^[123]x0+[A-F]{2}$/.test(key);

export interface TurnstileKeys {
  siteKey: string;
  secretKey: string;
}

/**
 * The configured keys, or null when neither is set: the bot check is then off everywhere (no widget,
 * no siteverify call), e.g. a self-host without Cloudflare. Throws, at boot, on only one key set or on
 * test keys in production (they accept any request).
 */
export function resolveTurnstileKeys(
  siteKey: string | undefined,
  secretKey: string | undefined,
  production: boolean,
): TurnstileKeys | null {
  if (Boolean(siteKey) !== Boolean(secretKey)) {
    throw new Error("Set both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, or neither.");
  }
  if (!siteKey || !secretKey) return null;
  if (production && (isTurnstileTestKey(siteKey) || isTurnstileTestKey(secretKey))) {
    throw new Error("Turnstile test keys are not allowed in production: they accept any request.");
  }
  return { siteKey, secretKey };
}

export type CaptchaResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "rejected" | "hostname" | "action" | "unavailable"; codes?: string[] };

interface SiteverifyResponse {
  success: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
}

/**
 * Verify a widget token. Retries once on a network error, a 5xx or Cloudflare's `internal-error`,
 * reusing the idempotency key so a retry can't count twice. Fails closed (`unavailable`) otherwise:
 * email sign-in pauses during a Cloudflare outage while passkey sign-in keeps working.
 *
 * Hostname and action are only checked when given; callers skip them with test keys, whose responses
 * carry `action: "test"` and the dev hostname.
 */
export async function verifyTurnstileToken(opts: {
  secret: string;
  token: string;
  remoteip: string | null;
  expectedHostname?: string;
  expectedAction?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<CaptchaResult> {
  const { token } = opts;
  if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "missing" };

  const body = new URLSearchParams({
    secret: opts.secret,
    response: token,
    idempotency_key: crypto.randomUUID(),
  });
  if (opts.remoteip) body.set("remoteip", opts.remoteip);
  const doFetch = opts.fetchImpl ?? fetch;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await doFetch(SITEVERIFY_URL, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
      });
    } catch {
      continue; // network error or timeout → retry once
    }
    if (res.status >= 500) {
      await res.body?.cancel();
      continue;
    }
    if (!res.ok) return { ok: false, reason: "unavailable" };
    let data: SiteverifyResponse;
    try {
      data = (await res.json()) as SiteverifyResponse;
    } catch {
      return { ok: false, reason: "unavailable" };
    }
    const codes = data["error-codes"] ?? [];
    if (!data.success) {
      if (codes.includes("internal-error")) continue;
      return { ok: false, reason: "rejected", codes };
    }
    if (opts.expectedHostname && data.hostname !== opts.expectedHostname) {
      return { ok: false, reason: "hostname" };
    }
    if (opts.expectedAction && data.action !== opts.expectedAction) {
      return { ok: false, reason: "action" };
    }
    return { ok: true };
  }
  return { ok: false, reason: "unavailable" };
}
