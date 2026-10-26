import { randomBytes, randomInt } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";
import { TURNSTILE_DUMMY_TOKEN } from "./fixtures";

/**
 * Acceptance tests for the Turnstile bot check on the email-code request. The Playwright server runs
 * with Cloudflare's always-pass test keys, so the real siteverify endpoint is called (needs network).
 */

const DB_PATH = process.env.E2E_DB_PATH ?? "e2e.db";

/** A fresh visitor per request, so these tests never meet the per-IP email limits. */
const freshIp = () => `2001:db8:${(0x1000 + randomInt(0xefff)).toString(16)}:${(0x1000 + randomInt(0xefff)).toString(16)}::1`;

function requestCode(page: Page, email: string, token?: string) {
  return page.request.post("/login", {
    form: { intent: "request", email, ...(token ? { "cf-turnstile-response": token } : {}) },
    headers: { "X-Real-IP": freshIp() },
    maxRedirects: 0,
  });
}

function countEvents(event: string): number {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    return (db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE event = ?").get(event) as { n: number }).n;
  } finally {
    db.close();
  }
}

test("a code request without a Turnstile token is refused and audited", async ({ page }) => {
  await page.request.get("/healthz"); // first request opens (and migrates) a fresh e2e.db
  const before = countEvents("login.captcha.fail");
  const res = await requestCode(page, `captcha-${randomBytes(4).toString("hex")}@example.com`);
  expect(res.status()).toBe(400);
  expect(await res.text()).not.toContain("Check your email");
  expect(countEvents("login.captcha.fail")).toBe(before + 1);
});

test("a code request with a valid token goes to the code step", async ({ page }) => {
  const res = await requestCode(page, `captcha-${randomBytes(4).toString("hex")}@example.com`, TURNSTILE_DUMMY_TOKEN);
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("Check your email");
});

test("the widget renders, issues a token and enables the submit button", async ({ page }) => {
  // Not "networkidle": the Turnstile iframe keeps a connection open. The token only appears after
  // hydration ran the widget's effect, so waiting for it also means typing can't race hydration.
  await page.goto("/login", { waitUntil: "load" });
  const submit = page.getByRole("button", { name: "Email me a code" });
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 15_000 });
  await expect(submit).toBeEnabled();

  await page.getByLabel("Email").fill(`captcha-${randomBytes(4).toString("hex")}@example.com`);
  await submit.click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
});
