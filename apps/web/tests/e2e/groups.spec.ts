import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./fixtures";

/**
 * Groups and join links. Permission and validation cases forge raw requests through `page.request`
 * (as authorization.spec.ts does); the bill-form and join flows drive the real UI. Stored state is
 * read straight from the SQLite file the dev server writes (see rate-limit-audit.spec.ts).
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const DB_PATH = process.env.E2E_DB_PATH ?? "e2e.db";
const TOKEN_RE = /\/groups\/join\/([A-Za-z0-9_-]{43})/;

function withDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    return fn(db);
  } finally {
    db.close();
  }
}

function memberEmails(groupId: string): string[] {
  return withDb((db) =>
    (db.prepare("SELECT email FROM split_group_members WHERE group_id = ? ORDER BY email").all(groupId) as {
      email: string;
    }[]).map((r) => r.email),
  );
}

async function createGroup(page: Page, name: string, members: string[]): Promise<string> {
  const res = await page.request.post("/groups", {
    form: { intent: "create", name, members: JSON.stringify(members) },
    maxRedirects: 0,
  });
  expect(res.status(), `creating "${name}" should redirect`).toBe(302);
  const id = (res.headers()["location"] ?? "").match(new RegExp(`/groups/(${UUID})`))?.[1];
  expect(id, "redirect should point at the new group").toBeTruthy();
  return id!;
}

function postIntent(page: Page, groupId: string, form: Record<string, string>) {
  return page.request.post(`/groups/${groupId}`, { form, maxRedirects: 0 });
}

async function joinToken(page: Page, groupId: string): Promise<string> {
  const html = await (await page.request.get(`/groups/${groupId}`)).text();
  const token = html.match(TOKEN_RE)?.[1];
  expect(token, "group page should show a join link").toBeTruthy();
  return token!;
}

function postBill(page: Page, title: string, payer: string, others: string[], amountCents: number) {
  return page.request.post("/bills/new", {
    form: {
      payload: JSON.stringify({
        title,
        currency: "EUR",
        date: "2026-01-01",
        amountCents,
        participants: [payer, ...others],
        payers: { [payer]: amountCents },
        split: { mode: "equal" },
      }),
    },
    maxRedirects: 0,
  });
}

test("G1: create a group and see it in your list", async ({ page }) => {
  await loginAs(page, "g1-alice@example.com");
  const id = await createGroup(page, "G1 Flatmates", ["g1-bob@example.com", "G1-Carol@Example.com "]);
  expect((await (await page.request.get("/groups")).text())).toContain("G1 Flatmates");
  // Stored normalized, creator included.
  expect(memberEmails(id)).toEqual(["g1-alice@example.com", "g1-bob@example.com", "g1-carol@example.com"]);
});

test("G2: invalid group input is rejected with a clear message", async ({ page }) => {
  await loginAs(page, "g2-alice@example.com");
  const attempt = async (name: string, members: unknown, expected: string) => {
    const res = await page.request.post("/groups", {
      form: { intent: "create", name, members: JSON.stringify(members) },
      maxRedirects: 0,
    });
    expect(res.status(), `"${expected}" should not redirect`).toBe(200);
    expect(await res.text()).toContain(expected);
  };
  await attempt("   ", ["g2-bob@example.com"], "Give the group a name");
  await attempt("x".repeat(81), ["g2-bob@example.com"], "too long");
  await attempt("G2", ["not-an-email"], "Not a valid email address");
  // Passes the type-ahead's loose check (/\S+@\S+\.\S+/) but not the bill action's zod check.
  await attempt("G2", ["g2-bob@example.c0m"], "Not a valid email address");
  await attempt("G2", [], "Add at least one other person");
  await attempt("G2", ["g2-alice@example.com"], "Add at least one other person");
  const fiftyOthers = Array.from({ length: 50 }, (_, i) => `g2-m${i}@example.com`);
  await attempt("G2", fiftyOthers, "at most 50 people");

  // A duplicate (any case) is stored once.
  const id = await createGroup(page, "G2 dupes", ["g2-dup@example.com", "G2-DUP@example.com"]);
  expect(memberEmails(id)).toEqual(["g2-alice@example.com", "g2-dup@example.com"]);
});

test("G3–G5: members add people; only the creator manages; outsiders see nothing", async ({ page }) => {
  await loginAs(page, "g3-alice@example.com");
  const id = await createGroup(page, "G3 Club", ["g3-bob@example.com"]);

  // Outsider: 404 on the page and on every intent, and the group isn't listed.
  await loginAs(page, "g3-eve@example.com");
  expect((await page.request.get(`/groups/${id}`)).status()).toBe(404);
  expect(await (await page.request.get("/groups")).text()).not.toContain("G3 Club");
  for (const intent of ["add", "remove", "rename", "delete", "leave", "link.reset", "link.off", "link.on"]) {
    const res = await postIntent(page, id, {
      intent,
      members: JSON.stringify(["g3-eve@example.com"]),
      email: "g3-bob@example.com",
      name: "Hijacked",
    });
    expect(res.status(), `outsider "${intent}" must be 404`).toBe(404);
  }

  // Member: sees the group, can add people, but not remove/rename/delete or manage the link.
  await loginAs(page, "g3-bob@example.com");
  expect((await page.request.get(`/groups/${id}`)).status()).toBe(200);
  expect(
    (await postIntent(page, id, { intent: "add", members: JSON.stringify(["g3-dave@example.com"]) })).status(),
  ).toBe(302);
  const memberForbidden: Record<string, string>[] = [
    { intent: "remove", email: "g3-dave@example.com" },
    { intent: "rename", name: "Renamed" },
    { intent: "delete" },
    { intent: "link.reset" },
    { intent: "link.off" },
    { intent: "link.on" },
  ];
  for (const form of memberForbidden) {
    expect((await postIntent(page, id, form)).status(), `member "${form.intent}" must be 403`).toBe(403);
  }
  expect(memberEmails(id)).toEqual(["g3-alice@example.com", "g3-bob@example.com", "g3-dave@example.com"]);

  // Creator can't leave or remove themselves.
  await loginAs(page, "g3-alice@example.com");
  expect(await (await postIntent(page, id, { intent: "leave" })).text()).toContain("delete it instead");
  expect(await (await postIntent(page, id, { intent: "remove", email: "g3-alice@example.com" })).text()).toContain(
    "can't remove yourself",
  );
  // Creator removes a member.
  expect((await postIntent(page, id, { intent: "remove", email: "g3-dave@example.com" })).status()).toBe(302);

  // A member leaves (even as the last non-creator) and loses access.
  await loginAs(page, "g3-bob@example.com");
  expect((await postIntent(page, id, { intent: "leave" })).status()).toBe(302);
  expect((await page.request.get(`/groups/${id}`)).status()).toBe(404);
  expect(memberEmails(id)).toEqual(["g3-alice@example.com"]);
});

test("G6, G7, G11: a group on the bill form splits exactly like adding people by hand", async ({ page }) => {
  await loginAs(page, "g6-alice@example.com");
  const groupId = await createGroup(page, "G6 Crew", ["g6-b1@example.com", "g6-b2@example.com"]);

  // Bill A, by hand.
  expect((await postBill(page, "G6 by hand", "g6-alice@example.com", ["g6-a1@example.com", "g6-a2@example.com"], 3000)).status()).toBe(302);

  // Bill B, through the UI: one person by hand first, then the group. (Wait for the dev server to
  // finish loading the page's modules so typing reaches a hydrated form.)
  await page.goto("/bills/new", { waitUntil: "networkidle" });
  await page.getByLabel("What for?").fill("G6 via group");
  await page.getByLabel("Amount", { exact: true }).fill("30");
  const box = page.getByPlaceholder("Add by name, email or group");
  await box.fill("g6-b1@example.com");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await box.fill("g6 cr");
  await page.getByRole("button", { name: "G6 Crew, group of 3" }).click();
  // Alice + b1 (not duplicated) + b2.
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(2);
  await expect(page.getByText("g6-b2@example.com").first()).toBeVisible();
  // G11: a fully added group is no longer suggested.
  await box.fill("g6 cr");
  await expect(page.getByRole("button", { name: "G6 Crew, group of 3" })).toHaveCount(0);
  await box.fill("");
  await page.getByRole("button", { name: "Save bill" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");

  const shape = (title: string) =>
    withDb((db) =>
      (db
        .prepare(
          `SELECT c.email = 'g6-alice@example.com' AS me, p.paid_cents AS paid, p.owed_cents AS owed
           FROM bill_participants p JOIN bills b ON b.id = p.bill_id JOIN contacts c ON c.id = p.contact_id
           WHERE b.title = ? ORDER BY me DESC, owed, paid`,
        )
        .all(title) as { me: number; paid: number; owed: number }[]).map((r) => [r.me, r.paid, r.owed]),
    );
  const byHand = shape("G6 by hand");
  expect(byHand).toHaveLength(3);
  expect(shape("G6 via group")).toEqual(byHand);

  // G7: deleting the group leaves the bill untouched.
  expect((await postIntent(page, groupId, { intent: "delete" })).status()).toBe(302);
  expect(shape("G6 via group")).toEqual(byHand);
  expect(memberEmails(groupId)).toEqual([]);
});

test("G11: a complete email always means that person, even when a group name matches", async ({ page }) => {
  await loginAs(page, "g11-alice@example.com");
  await createGroup(page, "g11-pal@example.com crew", ["g11-x@example.com", "g11-y@example.com"]);
  await page.goto("/bills/new", { waitUntil: "networkidle" });
  const box = page.getByPlaceholder("Add by name, email or group");
  await box.fill("g11-pal@example.com");
  await box.press("Enter");
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(1);
  await expect(page.getByText("g11-x@example.com")).toHaveCount(0);

  // The group pages' add box never suggests groups.
  const id = await createGroup(page, "G11 other", ["g11-z@example.com"]);
  await page.goto(`/groups/${id}`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Add by name or email").fill("crew");
  await expect(page.getByRole("button", { name: /group of/ })).toHaveCount(0);
});

test("G8: a bill for a group of 15 people new to splitfree saves", async ({ page }) => {
  await loginAs(page, "g8-alice@example.com");
  const fifteen = Array.from({ length: 15 }, (_, i) => `g8-new${i}@example.com`);
  await createGroup(page, "G8 Team", fifteen);
  expect((await postBill(page, "G8 team dinner", "g8-alice@example.com", fifteen, 16000)).status()).toBe(302);
});

test("G9: a contact's display name never leaks through a group", async ({ page }) => {
  await loginAs(page, "g9-carol@example.com");
  expect((await page.request.post("/settings", { form: { displayName: "Secret Carol" }, maxRedirects: 0 })).status()).toBe(302);

  await loginAs(page, "g9-alice@example.com");
  const id = await createGroup(page, "G9 Probe", ["g9-carol@example.com"]);
  const groupHtml = await (await page.request.get(`/groups/${id}`)).text();
  expect(groupHtml).toContain("g9-carol@example.com");
  expect(groupHtml).not.toContain("Secret Carol");
  expect(await (await page.request.get("/bills/new")).text()).not.toContain("Secret Carol");

  // Positive control: once they share a bill, the name shows.
  expect((await postBill(page, "G9 coffee", "g9-alice@example.com", ["g9-carol@example.com"], 400)).status()).toBe(302);
  expect(await (await page.request.get(`/groups/${id}`)).text()).toContain("Secret Carol");
});

test("G10: adding people to groups is rate-limited per account and audited", async ({ page }) => {
  await loginAs(page, "g10-alice@example.com");
  await createGroup(page, "G10 big", Array.from({ length: 49 }, (_, i) => `g10-m${i}@example.com`));
  const res = await page.request.post("/groups", {
    form: { intent: "create", name: "G10 more", members: JSON.stringify(["g10-x@example.com", "g10-y@example.com"]) },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("too many people to groups");
  const refused = withDb(
    (db) =>
      (db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE event = 'group.member.ratelimited'").get() as { n: number }).n,
  );
  expect(refused).toBeGreaterThan(0);
});

test("J1, J2: a signed-out join link goes to login and carries the way back", async ({ page }) => {
  await loginAs(page, "j1-alice@example.com");
  const id = await createGroup(page, "J1 Group", ["j1-bob@example.com"]);
  const token = await joinToken(page, id);
  await page.context().clearCookies();

  const res = await page.request.get(`/groups/join/${token}`, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  const location = res.headers()["location"];
  expect(location).toBe(`/login?redirectTo=${encodeURIComponent(`/groups/join/${token}`)}`);
  const loginHtml = await (await page.request.get(location)).text();
  expect(loginHtml).toContain(`name="redirectTo" value="/groups/join/${token}"`);

  // A client-side (single-fetch) navigation must not bake ".data" into the return path.
  const dataRes = await page.request.get(`/groups/join/${token}.data`, { maxRedirects: 0 });
  const body = await dataRes.text();
  expect(body).toContain(encodeURIComponent(`/groups/join/${token}`));
  expect(body).not.toContain(encodeURIComponent(".data"));
});

test("J3, J5: after signing up through the link you confirm, then land in the group", async ({ page }) => {
  await loginAs(page, "j3-alice@example.com");
  const id = await createGroup(page, "J3 Climbers", ["j3-bob@example.com"]);
  const token = await joinToken(page, id);
  await page.context().clearCookies();

  // A brand-new person signs up (test-login stands in for the code step) and comes back to the link.
  await page.request.post("/api/test-login", {
    form: { email: "j3-newbie@example.com", redirectTo: `/groups/join/${token}` },
  });
  await page.goto(`/groups/join/${token}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Join J3 Climbers?" })).toBeVisible();
  // The confirmation shows the size, never the members' emails.
  expect(await page.content()).not.toContain("j3-bob@example.com");
  // J5: opening the link joined nobody.
  expect(memberEmails(id)).not.toContain("j3-newbie@example.com");

  await page.getByRole("button", { name: "Join group" }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${id}$`));
  await expect(page.getByText("You joined J3 Climbers")).toBeVisible();
  expect(memberEmails(id)).toContain("j3-newbie@example.com");

  // The group is now offered on the bill form.
  await page.goto("/bills/new", { waitUntil: "networkidle" });
  await page.getByPlaceholder("Add by name, email or group").fill("j3 cl");
  await expect(page.getByRole("button", { name: "J3 Climbers, group of 3" })).toBeVisible();
});

test("J4: dead, reset, turned-off and expired links; members and full groups", async ({ page }) => {
  await loginAs(page, "j4-alice@example.com");
  const id = await createGroup(page, "J4 Group", ["j4-bob@example.com"]);
  const first = await joinToken(page, id);

  const status = async (token: string) => (await page.request.get(`/groups/join/${token}`, { maxRedirects: 0 })).status();

  // A member opening the link goes straight to the group, keeping a first-login passkey prompt.
  expect(await status(first)).toBe(302);
  const fromLogin = await page.request.get(`/groups/join/${first}?passkey=setup`, { maxRedirects: 0 });
  expect(fromLogin.headers()["location"]).toBe(`/groups/${id}?passkey=setup`);
  await loginAs(page, "j4-carol@example.com");
  expect(await status(first)).toBe(200);
  const dead = await page.request.get(`/groups/join/${"x".repeat(43)}`);
  expect(dead.status()).toBe(404);
  expect(await dead.text()).toContain("This link is no longer valid");

  // Reset: the old link dies, the new one works.
  await loginAs(page, "j4-alice@example.com");
  expect((await postIntent(page, id, { intent: "link.reset" })).status()).toBe(302);
  const second = await joinToken(page, id);
  expect(second).not.toBe(first);
  await loginAs(page, "j4-carol@example.com");
  expect(await status(first)).toBe(404);
  expect(await status(second)).toBe(200);

  // Off → 404; on again → a fresh, working link.
  await loginAs(page, "j4-alice@example.com");
  expect((await postIntent(page, id, { intent: "link.off" })).status()).toBe(302);
  await loginAs(page, "j4-carol@example.com");
  expect(await status(second)).toBe(404);
  await loginAs(page, "j4-alice@example.com");
  expect((await postIntent(page, id, { intent: "link.on" })).status()).toBe(302);
  const third = await joinToken(page, id);

  // Expired (four weeks passed) → 404.
  withDb((db) => db.prepare("UPDATE split_groups SET join_token_expires_at = ? WHERE id = ?").run(1, id));
  await loginAs(page, "j4-carol@example.com");
  expect(await status(third)).toBe(404);

  // A full group refuses the join.
  await loginAs(page, "j4-full@example.com");
  const fullId = await createGroup(page, "J4 Full", Array.from({ length: 49 }, (_, i) => `j4-f${i}@example.com`));
  const fullToken = await joinToken(page, fullId);
  await loginAs(page, "j4-late@example.com");
  const join = await page.request.post(`/groups/join/${fullToken}`, { maxRedirects: 0 });
  expect(join.status()).toBe(200);
  expect(await join.text()).toContain("This group is full");
  expect(memberEmails(fullId)).toHaveLength(50);
});

test("J6: the return path never leaves the site", async ({ page }) => {
  // Signed out: an unsafe redirectTo is replaced by "/" in the login form.
  for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example"]) {
    const html = await (await page.request.get(`/login?redirectTo=${encodeURIComponent(bad)}`)).text();
    expect(html).toContain('name="redirectTo" value="/"');
  }
  // Signed in: /login sends you to a safe redirectTo, and home for an unsafe one.
  await loginAs(page, "j6-alice@example.com");
  const go = async (target: string) =>
    (await page.request.get(`/login?redirectTo=${encodeURIComponent(target)}`, { maxRedirects: 0 })).headers()["location"];
  expect(await go("/groups")).toBe("/groups");
  expect(await go("//evil.example")).toBe("/");
  expect(await go("https://evil.example")).toBe("/");
});
