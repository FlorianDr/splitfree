import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./fixtures";

/**
 * The settle-up plan must be built from everyone's balances, not just the bills the viewer is on.
 * When no one is on every bill (a trip where sub-groups share a car or a meal), each /settle page
 * netted only the viewer's own bills: it told net creditors to pay, and members saw plans that
 * contradicted each other. The plan now covers the whole circle, and each person sees only their
 * own part of it: on /settle, on home (unless they switch to all balances) and on a person's page.
 *
 * Every test uses the same chain: V pays 20 for V+S (S owes V 10), S pays 60 for S+T (T owes S 30).
 * Net: V +10, S +20, T −30, so the plan is T → S 20 and T → V 10. V and T share no bill.
 */

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

async function chain(page: Page, prefix: string) {
  const [v, s, t] = ["v", "s", "t"].map((x) => `${prefix}-${x}@example.com`);
  await loginAs(page, v);
  expect((await postBill(page, "Dinner", v, [s], 2000)).status()).toBe(302);
  await loginAs(page, s);
  expect((await postBill(page, "Car", s, [t], 6000)).status()).toBe(302);
  return { v, s, t };
}

/**
 * The settle rows as "from → to €x.xx", with the viewer's "You"/"you" replaced by `me`. People the
 * viewer shares no bill with are shown by email, the rest by display name (the email's local part
 * here), so both map to the local part.
 */
async function settleRows(page: Page, me: string): Promise<string[]> {
  await page.goto("/settle");
  const rows = await page.getByRole("main").getByRole("listitem").evaluateAll((lis) =>
    lis.map((li) => {
      const [from, to] = [...li.querySelectorAll(".min-w-0 > span")].map((s) => s.textContent ?? "");
      const amount = li.querySelector(".tabular-nums")?.textContent ?? "";
      return [from, to, amount] as const;
    }),
  );
  const who = (name: string) => (/^you$/i.test(name) ? me : name.replace(/@example\.com$/, ""));
  return rows.map(([f, t, a]) => `${who(f)} → ${who(t)} ${a}`).sort();
}

/** The People tab rows on home as "name €x.xx owes you|you owe" (name as shown). */
async function peopleRows(page: Page): Promise<string[]> {
  const items = page.getByRole("tabpanel").getByRole("listitem");
  return (
    await items.evaluateAll((lis) =>
      lis.map((li) => {
        const name = li.querySelector(".font-medium")?.textContent ?? "";
        const amount = li.querySelector(".tabular-nums")?.textContent ?? "";
        const dir = li.querySelector(".text-right > div:last-child")?.textContent ?? "";
        return `${name} ${amount} ${dir}`;
      }),
    )
  ).sort();
}

test("each member's settle page lists only their part of the circle's plan", async ({ page }) => {
  const { v, s, t } = await chain(page, "sp");

  // S is owed €20 overall, so S is never asked to pay (a plan from V's bills alone would ask S to pay V).
  await loginAs(page, s);
  expect(await settleRows(page, "sp-s")).toEqual(["sp-t → sp-s €20.00"]);
  // V sees only T's €10, not T → S.
  await loginAs(page, v);
  expect(await settleRows(page, "sp-v")).toEqual(["sp-t → sp-v €10.00"]);
  // T pays both creditors (a plan from T's bills alone would send all €30 to S).
  await loginAs(page, t);
  expect(await settleRows(page, "sp-t")).toEqual(["sp-t → sp-s €20.00", "sp-t → sp-v €10.00"]);
});

test("home shows simplified balances, all balances on toggle, and the person page follows", async ({ page }) => {
  const { v } = await chain(page, "sh");

  await loginAs(page, v);
  await page.goto("/", { waitUntil: "networkidle" });
  // Simplified (default): only T, who pays me in the plan, by email since we share no bill.
  await expect.poll(() => peopleRows(page)).toEqual(["sh-t@example.com €10.00 owes you"]);

  // All balances: the pairwise debt from our shared bill.
  await page.getByRole("link", { name: "All balances" }).click();
  await expect(page).toHaveURL(/\?view=all$/);
  await expect.poll(() => peopleRows(page)).toEqual(["sh-s €10.00 owes you"]);

  // The person page keeps the view: S owes me 10 bill by bill, but nothing changes hands simplified.
  await page.getByRole("link", { name: /sh-s/ }).click();
  await expect(page.getByText("€10.00 sh-s owes you")).toBeVisible();
  await page.getByRole("link", { name: "Show simplified" }).click();
  await expect(page.getByText("Nothing to settle with sh-s.")).toBeVisible();

  // T's page is reachable from the simplified list and shows only the amount to settle.
  await page.goto("/");
  await page.getByRole("link", { name: /sh-t@example\.com/ }).click();
  await expect(page.getByText("€10.00 sh-t@example.com owes you")).toBeVisible();
});

test("a settle-up payment to someone you share no bill with can be recorded", async ({ page }) => {
  const { v, t } = await chain(page, "sq");

  // T owes V €10 in the plan, though they share no bill: V is offered by email.
  await loginAs(page, t);
  await page.goto("/settle", { waitUntil: "networkidle" });
  const row = page.getByRole("main").getByRole("listitem").filter({ hasText: v });
  await expect(row).toContainText("€10.00");
  await row.getByRole("link", { name: "Record" }).click();
  await expect(page).toHaveURL(/\/payments\/new/);
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("10.00");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page).toHaveURL(/\/$/);

  // Only T → S is left; V is done.
  expect(await settleRows(page, "sq-t")).toEqual(["sq-t → sq-s €20.00"]);
  await loginAs(page, v);
  expect(await settleRows(page, "sq-v")).toEqual([]);
  await expect(page.getByText("You're all settled up")).toBeVisible();
});

test("once settled through other people, all balances says you're settled overall", async ({ page }) => {
  const { v, t } = await chain(page, "so");

  // T pays both creditors from the settle page.
  await loginAs(page, t);
  for (let i = 0; i < 2; i++) {
    await page.goto("/settle", { waitUntil: "networkidle" });
    await page.getByRole("main").getByRole("listitem").first().getByRole("link", { name: "Record" }).click();
    await expect(page).toHaveURL(/\/payments\/new/);
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page).toHaveURL(/\/$/);
  }
  expect(await settleRows(page, "so-t")).toEqual([]);

  // V is square overall, though S still owes V €10 bill by bill (T paid it instead).
  await loginAs(page, v);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Nothing to pay or collect")).toBeVisible();
  await page.getByRole("link", { name: "All balances" }).click();
  await expect(page.getByText("You're settled up overall.")).toBeVisible();
  await expect.poll(() => peopleRows(page)).toContain("so-s €10.00 owes you");

  // The person page says so too, and Settle up offers no bill-by-bill amount to pay again.
  await page.getByRole("link", { name: /so-s/ }).click();
  await expect(page.getByText("You're settled up overall: this balance")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Settle up" }).click();
  await expect(page).toHaveURL(/\/payments\/new/);
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("");
});
