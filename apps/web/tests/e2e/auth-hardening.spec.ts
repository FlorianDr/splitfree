import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./fixtures";

/**
 * OWASP A07 acceptance tests: passkey-login account enumeration (M4) and step-up auth for adding a
 * passkey (L4). The L4 test forges a still-valid-but-old session cookie — it signs the JWT itself
 * with the test server's known JWT_SECRET — to simulate a long-lived/hijacked session.
 */

const SECRET = "e2e-test-secret-change-me-0123456789"; // must match the Playwright config's JWT_SECRET
const COOKIE = "__sf_session";

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function signJwt(payload: Record<string, unknown>): string {
  const data = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}`;
  return `${data}.${createHmac("sha256", SECRET).update(data).digest("base64url")}`;
}

test("M4: passkey-login options never reveal whether an account exists", async ({ page }) => {
  async function allowCredsFor(body?: object): Promise<unknown[]> {
    const res = await page.request.post("/api/webauthn/login/options", body ? { data: body } : {});
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.challengeId, "a challenge is always issued").toBeTruthy();
    return (json.options.allowCredentials ?? []) as unknown[];
  }

  // A real-looking email, a definitely-unknown one, and no email at all must all return the same
  // shape — an empty credential list — so the endpoint leaks nothing about account existence.
  expect(await allowCredsFor({ email: "stepup@example.com" })).toHaveLength(0);
  expect(await allowCredsFor({ email: "nobody-here-xyz@example.com" })).toHaveLength(0);
  expect(await allowCredsFor()).toHaveLength(0);
});

test("L4: adding a passkey requires a recently authenticated session (step-up)", async ({ page }) => {
  await loginAs(page, "stepup@example.com");

  // Freshly authenticated → step-up passes, registration options are issued.
  const fresh = await page.request.post("/api/webauthn/register/options");
  expect(fresh.status()).toBe(200);

  // Forge a still-valid session (same sid/sub/cid, valid signature, unexpired) but authenticated an
  // hour ago — i.e. a long-lived/hijacked cookie. Step-up must reject it.
  const current = (await page.context().cookies()).find((c) => c.name === COOKIE);
  expect(current, "session cookie should be set after login").toBeTruthy();
  const claims = JSON.parse(Buffer.from(current!.value.split(".")[1], "base64url").toString());
  const nowSec = Math.floor(Date.now() / 1000);
  const stale = signJwt({
    sub: claims.sub,
    cid: claims.cid,
    sid: claims.sid, // same (still-active) session row → passes requireUser, fails freshness
    iat: nowSec - 3600, // outside the 15-minute step-up window
    exp: nowSec + 86_400,
  });
  await page.context().addCookies([
    { name: COOKIE, value: stale, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);

  const stepUp = await page.request.post("/api/webauthn/register/options");
  expect(stepUp.status()).toBe(401);
});
