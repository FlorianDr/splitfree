import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./fixtures";

/**
 * Acceptance tests for the A04 new-participant rate limit and the A09 audit trail.
 *
 * The audit test reads the audit_log table straight from the SQLite file the server writes — the real
 * persisted trail, no special endpoint. DATABASE_PATH defaults to ./e2e.db (set in the Playwright
 * config) and Playwright runs from apps/web, so the path resolves to the same file the server uses.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const DB_PATH = process.env.E2E_DB_PATH ?? "e2e.db";

function billPayload(title: string, payer: string, others: string[], amountCents: number) {
  return {
    title,
    currency: "EUR",
    date: "2026-01-01",
    amountCents,
    participants: [payer, ...others],
    payers: { [payer]: amountCents },
    split: { mode: "equal" as const },
  };
}

function postBill(page: Page, payload: unknown) {
  return page.request.post("/bills/new", {
    form: { payload: JSON.stringify(payload) },
    maxRedirects: 0,
  });
}

async function matchId(page: Page, url: string, kind: "people" | "bills"): Promise<string> {
  const res = await page.request.get(url);
  expect(res.ok(), `GET ${url} should succeed`).toBeTruthy();
  const m = (await res.text()).match(new RegExp(`/${kind}/(${UUID})`));
  expect(m, `expected a /${kind}/<id> link at ${url}`).not.toBeNull();
  return m![1];
}

/** Read the distinct set of audit events currently in the log. */
function auditEvents(): Set<string> {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    const rows = db.prepare("SELECT DISTINCT event FROM audit_log").all() as { event: string }[];
    return new Set(rows.map((r) => r.event));
  } finally {
    db.close();
  }
}

test("A04: a user cannot introduce more than the per-window limit of new participants", async ({ page }) => {
  await loginAs(page, "rl-host@example.com");

  // 49 brand-new participants (+ the host = a full 50-person bill) stays within the per-window limit
  // of 50 → allowed. The limit equals the bill cap, so a first bill for a whole new group always fits.
  const manyNew = Array.from({ length: 49 }, (_, i) => `rl-p${i}@example.com`);
  const first = await postBill(page, billPayload("RL bill one", "rl-host@example.com", manyNew, 5000));
  expect(first.status()).toBe(302);

  // Two more brand-new participants now exceed the window (49 + 2 > 50) → rejected, with a clear error.
  const second = await postBill(
    page,
    billPayload("RL bill two", "rl-host@example.com", ["rl-extra@example.com", "rl-extra2@example.com"], 300),
  );
  expect(second.status()).toBe(200); // action returns an error (not a redirect)
  expect(await second.text()).toContain("too many new people");

  // Adding an EXISTING contact (not new) is still allowed despite the window being full.
  const third = await postBill(
    page,
    billPayload("RL bill three", "rl-host@example.com", ["rl-p0@example.com"], 200),
  );
  expect(third.status()).toBe(302);
});

test("A09: financial mutations are written to the audit trail", async ({ page }) => {
  await loginAs(page, "audit-host@example.com");

  // bill.create (+ participant.add for the brand-new friend)
  expect(
    (await postBill(page, billPayload("Audit dinner", "audit-host@example.com", ["audit-friend@example.com"], 3000))).status(),
  ).toBe(302);

  const friendId = await matchId(page, "/", "people");
  const personHtml = await (await page.request.get(`/people/${friendId}`)).text();
  const from = personHtml.match(new RegExp(`from=(${UUID})`))?.[1];
  const to = personHtml.match(new RegExp(`to=(${UUID})`))?.[1];
  expect(from && to, "settle link should carry both party ids").toBeTruthy();

  // payment.create (host is a party → allowed)
  expect(
    (await page.request.post("/payments/new", {
      form: { fromContactId: from!, toContactId: to!, amount: "15", currency: "EUR", date: "2026-01-01" },
      maxRedirects: 0,
    })).status(),
  ).toBe(302);

  // bill.delete
  const billId = await matchId(page, `/people/${friendId}`, "bills");
  expect(
    (await page.request.post(`/bills/${billId}`, { form: { intent: "delete" }, maxRedirects: 0 })).status(),
  ).toBe(302);

  const events = auditEvents();
  for (const expected of ["bill.create", "participant.add", "payment.create", "bill.delete"]) {
    expect(events, `audit_log should contain a "${expected}" event`).toContain(expected);
  }
});

test("a bill is capped at 50 participants", async ({ page }) => {
  await loginAs(page, "cap-host@example.com");

  // Oversized participant array → rejected by the schema bound (never a redirect).
  const tooMany = Array.from({ length: 60 }, (_, i) => `cap-a${i}@example.com`);
  const bySchema = await postBill(page, billPayload("Cap too big", "cap-host@example.com", tooMany, 6100));
  expect(bySchema.status()).toBe(200);
  expect(await bySchema.text()).toContain("Invalid bill data");

  // 50 participants + 1 payer-only = 51 distinct people → rejected by the runtime cap, with the
  // friendly message (and before any contacts are created).
  const fortyNine = Array.from({ length: 49 }, (_, i) => `cap-b${i}@example.com`);
  const byRuntime = await page.request.post("/bills/new", {
    form: {
      payload: JSON.stringify({
        title: "Cap via payers",
        currency: "EUR",
        date: "2026-01-01",
        amountCents: 5000,
        participants: ["cap-host@example.com", ...fortyNine],
        payers: { "cap-extra@example.com": 5000 },
        split: { mode: "equal" },
      }),
    },
    maxRedirects: 0,
  });
  expect(byRuntime.status()).toBe(200);
  expect(await byRuntime.text()).toContain("at most 50 people");
});
