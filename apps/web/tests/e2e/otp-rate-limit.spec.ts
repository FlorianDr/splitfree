import { randomBytes, randomInt } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";
import { OTP_PER_IP_PER_HOUR } from "../../app/lib/auth/otp-limits.server.ts";
import { TURNSTILE_DUMMY_TOKEN } from "./fixtures";

/**
 * Acceptance test for the per-visitor-IP limit on login-code emails (the bot incident: one client
 * requesting codes for many different addresses). The dev server has no reverse proxy, so the test
 * sends the X-Real-IP header itself (CLIENT_IP_HEADER=x-real-ip in the Playwright config).
 *
 * Each run uses a fresh random IPv6 /48 and addresses, because a reused dev server keeps its DB.
 */

const DB_PATH = process.env.E2E_DB_PATH ?? "e2e.db";

/** A random 2001:db8:xxxx:yyyy prefix (no leading zeros, so it matches the app's bucket format). */
function randomPrefix(): string {
  const group = () => (0x1000 + randomInt(0xefff)).toString(16);
  return `2001:db8:${group()}:${group()}`;
}

function requestCode(page: Page, email: string, ip: string) {
  return page.request.post("/login", {
    form: { intent: "request", email, "cf-turnstile-response": TURNSTILE_DUMMY_TOKEN },
    headers: { "X-Real-IP": ip },
    maxRedirects: 0,
  });
}

function auditDetails(event: string): string[] {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    const rows = db.prepare("SELECT detail FROM audit_log WHERE event = ?").all(event) as {
      detail: string | null;
    }[];
    return rows.map((r) => r.detail ?? "");
  } finally {
    db.close();
  }
}

test("one visitor /64 gets OTP_PER_IP_PER_HOUR login codes, whatever addresses it asks for", async ({ page }) => {
  const run = randomBytes(4).toString("hex");
  const net = randomPrefix();

  for (let i = 0; i < OTP_PER_IP_PER_HOUR; i++) {
    const res = await requestCode(page, `otp-${run}-${i}@example.com`, `${net}::${i + 1}`);
    expect(res.status(), `code ${i + 1} of ${OTP_PER_IP_PER_HOUR}`).toBe(200);
    expect(await res.text()).toContain("Check your email");
  }

  // One more address from another host in the same /64 → refused.
  const blocked = await requestCode(page, `otp-${run}-x@example.com`, `${net}:ffff::1`);
  expect(blocked.status()).toBe(429);
  expect(await blocked.text()).not.toContain("Check your email");

  // A different visitor is unaffected.
  const other = await requestCode(page, `otp-${run}-y@example.com`, `${randomPrefix()}::1`);
  expect(other.status()).toBe(200);

  const bucket = `${net}::/64`;
  expect(auditDetails("login.otp.sent").filter((d) => d.includes(bucket))).toHaveLength(OTP_PER_IP_PER_HOUR);
  const limited = auditDetails("login.otp.ratelimited").filter((d) => d.includes(bucket));
  expect(limited).toHaveLength(1);
  expect(limited[0]).toContain('"limit":"ip_hour"');
});

test("an invalid or missing visitor IP falls back to the global limits only", async ({ page }) => {
  const run = randomBytes(4).toString("hex");
  for (let i = 0; i < 4; i++) {
    const res = await requestCode(page, `otp-${run}-noip-${i}@example.com`, "not-an-ip");
    expect(res.status(), `request ${i + 1}`).toBe(200);
  }
});
