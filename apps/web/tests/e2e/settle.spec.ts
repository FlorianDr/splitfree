import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./fixtures";

/**
 * The settle-up plan must be built from everyone's balances, not just the bills the viewer is on.
 * When no one is on every bill (a trip where sub-groups share a car or a meal), each /settle page
 * netted only the viewer's own bills: it told net creditors to pay, and members saw plans that
 * contradicted each other.
 */

const V = "sp-v@example.com";
const S = "sp-s@example.com";
const T = "sp-t@example.com";

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

test("every member sees the same settle-up plan, built from all their balances", async ({ page }) => {
  // V pays 20 for V+S: S owes V 10.
  await loginAs(page, V);
  expect((await postBill(page, "Dinner", V, [S], 2000)).status()).toBe(302);
  // S pays 60 for S+T: T owes S 30. V is not on this bill.
  await loginAs(page, S);
  expect((await postBill(page, "Car", S, [T], 6000)).status()).toBe(302);

  // Net: V +10, S +20, T −30. The only debtor is T, so T pays both creditors.
  const expected = ["sp-t → sp-s €20.00", "sp-t → sp-v €10.00"];

  // S is on both bills, so S's page already sees everything.
  expect(await settleRows(page, "sp-s")).toEqual(expected);

  // V is only on Dinner: a plan from V's bills alone would ask S (owed €20 overall) to pay V.
  await loginAs(page, V);
  expect(await settleRows(page, "sp-v")).toEqual(expected);

  // T is only on Car: a plan from T's bills alone would send T's whole €30 to S, none to V.
  await loginAs(page, T);
  expect(await settleRows(page, "sp-t")).toEqual(expected);
});

test("a settle-up payment to someone you share no bill with can be recorded", async ({ page }) => {
  const [v, s, t] = ["sq-v@example.com", "sq-s@example.com", "sq-t@example.com"];
  await loginAs(page, v);
  expect((await postBill(page, "Dinner", v, [s], 2000)).status()).toBe(302);
  await loginAs(page, s);
  expect((await postBill(page, "Car", s, [t], 6000)).status()).toBe(302);

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

  // Only T → S is left, and S, who is owed overall, is never asked to pay.
  expect(await settleRows(page, "sq-t")).toEqual(["sq-t → sq-s €20.00"]);
  await loginAs(page, v);
  expect(await settleRows(page, "sq-v")).toEqual(["sq-t → sq-s €20.00"]);
});
