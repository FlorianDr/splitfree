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

/** The settle rows as "from → to €x.xx" (display names), with the viewer's "You"/"you" replaced by `me`. */
async function settleRows(page: Page, me: string): Promise<string[]> {
  await page.goto("/settle");
  const rows = await page.getByRole("main").getByRole("listitem").evaluateAll((lis) =>
    lis.map((li) => {
      const [from, to] = [...li.querySelectorAll(".min-w-0 > span")].map((s) => s.textContent ?? "");
      const amount = li.querySelector(".tabular-nums")?.textContent ?? "";
      return [from, to, amount] as const;
    }),
  );
  return rows.map(([f, t, a]) => `${/^you$/i.test(f) ? me : f} → ${/^you$/i.test(t) ? me : t} ${a}`).sort();
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

  // V is only on Dinner: today the page asks S (owed €20 overall) to pay V.
  await loginAs(page, V);
  expect(await settleRows(page, "sp-v")).toEqual(expected);

  // T is only on Car: today the page sends T's whole €30 to S, and V is never paid by T.
  await loginAs(page, T);
  expect(await settleRows(page, "sp-t")).toEqual(expected);
});
