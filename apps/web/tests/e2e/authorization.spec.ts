import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./fixtures";

/**
 * OWASP A01 (Broken Access Control) acceptance tests. Each proves that authentication alone does not
 * grant access to another user's objects: a logged-in attacker is blocked, and the protected state is
 * left unchanged, while the legitimate owner/participant still works (positive control).
 *
 * Requests go through `page.request` (the browser context's cookie jar) so we can forge raw requests
 * the real UI would never send — exactly how an attacker would probe these endpoints.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Build a valid bill payload: `payer` paid the whole amount, split equally with everyone. */
function equalBill(opts: { title: string; payer: string; others: string[]; amountCents: number }) {
  return {
    title: opts.title,
    currency: "EUR",
    date: "2026-01-01",
    amountCents: opts.amountCents,
    participants: [opts.payer, ...opts.others],
    payers: { [opts.payer]: opts.amountCents },
    split: { mode: "equal" as const },
  };
}

function postBill(page: Page, payload: unknown) {
  return page.request.post("/bills/new", {
    form: { payload: JSON.stringify(payload) },
    maxRedirects: 0,
  });
}

/** Pull the first `/people/<id>` or `/bills/<id>` id out of a server-rendered page. */
async function matchId(page: Page, url: string, kind: "people" | "bills"): Promise<string> {
  const res = await page.request.get(url);
  expect(res.ok(), `GET ${url} should succeed`).toBeTruthy();
  const m = (await res.text()).match(new RegExp(`/${kind}/(${UUID})`));
  expect(m, `expected a /${kind}/<id> link at ${url}`).not.toBeNull();
  return m![1];
}

test("M1: a non-participant cannot read another user's bill", async ({ page }) => {
  // Alice creates a bill she shares with Charlie (Bob is not involved).
  await loginAs(page, "m1-alice@example.com");
  expect((await postBill(page, equalBill({
    title: "M1 secret dinner",
    payer: "m1-alice@example.com",
    others: ["m1-charlie@example.com"],
    amountCents: 3000,
  }))).status()).toBe(302);

  const charlieId = await matchId(page, "/", "people");
  const billId = await matchId(page, `/people/${charlieId}`, "bills");

  // Positive control: Alice (a participant) can read her bill.
  const asOwner = await page.request.get(`/bills/${billId}`);
  expect(asOwner.status()).toBe(200);
  expect(await asOwner.text()).toContain("M1 secret dinner");

  // Attack: Bob is authenticated but not a participant → 404, and no contents leak.
  await loginAs(page, "m1-bob@example.com");
  const asAttacker = await page.request.get(`/bills/${billId}`);
  expect(asAttacker.status()).toBe(404);
  expect(await asAttacker.text()).not.toContain("M1 secret dinner");
});

test("H2: a non-participant cannot delete another user's bill", async ({ page }) => {
  await loginAs(page, "h2-alice@example.com");
  expect((await postBill(page, equalBill({
    title: "H2 group trip",
    payer: "h2-alice@example.com",
    others: ["h2-charlie@example.com"],
    amountCents: 4000,
  }))).status()).toBe(302);

  const charlieId = await matchId(page, "/", "people");
  const billId = await matchId(page, `/people/${charlieId}`, "bills");

  // Attack: Bob tries to delete a bill he's not part of → 404, no mutation.
  await loginAs(page, "h2-bob@example.com");
  const attack = await page.request.post(`/bills/${billId}`, {
    form: { intent: "delete" },
    maxRedirects: 0,
  });
  expect(attack.status()).toBe(404);

  // The bill still exists for its real participant.
  await loginAs(page, "h2-alice@example.com");
  expect((await page.request.get(`/bills/${billId}`)).status()).toBe(200);

  // Positive control: a participant CAN delete it.
  const ownerDelete = await page.request.post(`/bills/${billId}`, {
    form: { intent: "delete" },
    maxRedirects: 0,
  });
  expect(ownerDelete.status()).toBe(302);
  expect((await page.request.get(`/bills/${billId}`)).status()).toBe(404);
});

test("M2: a user cannot create a bill they are not part of", async ({ page }) => {
  await loginAs(page, "m2-bob@example.com");

  // Attack: Bob forges a bill between two victims, with himself nowhere in it.
  const attack = await postBill(page, equalBill({
    title: "M2 injected debt",
    payer: "m2-victim1@example.com",
    others: ["m2-victim2@example.com"],
    amountCents: 2000,
  }));
  expect(attack.status()).toBe(403);

  // The victims have no balance — nothing was created.
  await loginAs(page, "m2-victim1@example.com");
  expect(await (await page.request.get("/")).text()).toContain("No open balances");

  // Positive control: Bob CAN create a bill he is part of.
  await loginAs(page, "m2-bob@example.com");
  const legit = await postBill(page, equalBill({
    title: "M2 my own bill",
    payer: "m2-bob@example.com",
    others: ["m2-friend@example.com"],
    amountCents: 1000,
  }));
  expect(legit.status()).toBe(302);
});

test("H1: a user cannot record a payment between two other people", async ({ page }) => {
  // Set up a real Alice↔Charlie balance (Charlie owes Alice 15.00).
  await loginAs(page, "h1-alice@example.com");
  expect((await postBill(page, equalBill({
    title: "H1 dinner",
    payer: "h1-alice@example.com",
    others: ["h1-charlie@example.com"],
    amountCents: 3000,
  }))).status()).toBe(302);

  const charlieId = await matchId(page, "/", "people");
  await loginAs(page, "h1-charlie@example.com");
  const aliceId = await matchId(page, "/", "people");

  // Attack: Bob forges "Alice paid Charlie" — he is neither party → 403.
  await loginAs(page, "h1-bob@example.com");
  const attack = await page.request.post("/payments/new", {
    form: { fromContactId: aliceId, toContactId: charlieId, amount: "30", currency: "EUR", date: "2026-02-01" },
    maxRedirects: 0,
  });
  expect(attack.status()).toBe(403);

  // The Alice↔Charlie balance is untouched: Charlie still owes Alice, no settlement recorded.
  await loginAs(page, "h1-alice@example.com");
  const personPage = await (await page.request.get(`/people/${charlieId}`)).text();
  expect(personPage).toContain("owes you");
  expect(personPage).toContain("15.00");
  expect(personPage).not.toContain("You paid");

  // Positive control: Alice (a party) CAN record the same payment.
  const legit = await page.request.post("/payments/new", {
    form: { fromContactId: aliceId, toContactId: charlieId, amount: "30", currency: "EUR", date: "2026-02-01" },
    maxRedirects: 0,
  });
  expect(legit.status()).toBe(302);
});

test("BOLA: a user cannot read the profile of a contact they share no history with", async ({ page }) => {
  await loginAs(page, "p-alice@example.com");
  expect((await postBill(page, equalBill({
    title: "P shared bill",
    payer: "p-alice@example.com",
    others: ["p-charlie@example.com"],
    amountCents: 2000,
  }))).status()).toBe(302);
  const charlieId = await matchId(page, "/", "people");

  // Positive control: Alice shares a bill with Charlie → she can view him.
  const asOwner = await page.request.get(`/people/${charlieId}`);
  expect(asOwner.status()).toBe(200);
  expect(await asOwner.text()).toContain("p-charlie@example.com");

  // Attack: Bob shares nothing with Charlie → 404, email not disclosed.
  await loginAs(page, "p-bob@example.com");
  const asAttacker = await page.request.get(`/people/${charlieId}`);
  expect(asAttacker.status()).toBe(404);
  expect(await asAttacker.text()).not.toContain("p-charlie@example.com");
});

test("L (CWE-601): test-login ignores off-site redirect targets", async ({ page }) => {
  // External absolute URL → forced back to "/".
  const external = await page.request.post("/api/test-login", {
    form: { email: "redir@example.com", redirectTo: "https://evil.example.com/phish" },
    maxRedirects: 0,
  });
  expect(external.status()).toBe(302);
  expect(external.headers()["location"]).toBe("/");

  // Protocol-relative "//host" → forced back to "/".
  const protocolRelative = await page.request.post("/api/test-login", {
    form: { email: "redir@example.com", redirectTo: "//evil.example.com" },
    maxRedirects: 0,
  });
  expect(protocolRelative.headers()["location"]).toBe("/");

  // Positive control: a genuine same-site path is honored.
  const internal = await page.request.post("/api/test-login", {
    form: { email: "redir@example.com", redirectTo: "/settle" },
    maxRedirects: 0,
  });
  expect(internal.headers()["location"]).toBe("/settle");
});
