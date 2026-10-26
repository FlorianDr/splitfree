import type { Page } from "@playwright/test";

/**
 * Log in as `email` via the env-gated test-login route. `page.request` shares the browser context's
 * cookie jar, so the session cookie it sets is used by subsequent page navigations.
 */
/**
 * Cloudflare's dummy Turnstile token: the always-pass test secret (TURNSTILE_SECRET_KEY in the
 * Playwright config) accepts it and only it.
 */
export const TURNSTILE_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

export async function loginAs(page: Page, email: string): Promise<void> {
  await page.request.post("/api/test-login", { form: { email } });
}
