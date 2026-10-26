import { expect, test } from "@playwright/test";
import { loginAs } from "./fixtures";

test("enter a bill: add participant, pick currency, expand advanced, save", async ({ page }) => {
  await loginAs(page, "alice@example.com");
  await page.goto("/bills/new", { waitUntil: "networkidle" }); // typed input needs a hydrated form

  await page.getByLabel("What for?").fill("Dinner");
  await page.getByLabel("Amount", { exact: true }).fill("30");

  // Add a participant — the chip must appear. (Regression guard: a dev-only Vite "Outdated Optimize
  // Dep" failure once left the page un-hydrated so this — and the controls below — did nothing.)
  await page.getByPlaceholder("Add by name or email").fill("bob@example.com");
  await page.getByRole("button", { name: "Add" }).click();
  // The chip (and, once an amount is set, the live preview row) shows the email.
  await expect(page.getByText("bob@example.com").first()).toBeVisible();

  // Currency dropdown (Radix Select) opens and selects.
  await page.getByRole("combobox").filter({ hasText: "EUR" }).click();
  await page.getByRole("option", { name: "USD" }).click();
  await expect(page.getByRole("combobox").filter({ hasText: "USD" })).toBeVisible();

  // Advanced options (Collapsible) expands.
  await page.getByRole("button", { name: "Advanced options" }).click();
  await expect(page.getByText("Who paid?")).toBeVisible();

  // Live equal-split preview (client-computed — also proves hydration).
  await expect(page.getByText("Each person owes")).toBeVisible();

  await page.getByRole("button", { name: "Save bill" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");

  // Success toast (flash) appears after the redirect.
  await expect(page.getByText("Bill added")).toBeVisible();

  // Alice paid 30, split equally with Bob → Bob owes Alice 15.
  await expect(page.getByText("bob@example.com").first()).toBeVisible();
  await expect(page.getByText("owes you")).toBeVisible();
});

test.describe("on a German-language device", () => {
  test.use({ locale: "de-DE" });

  test("a decimal comma is read, an unreadable amount blocks saving", async ({ page }) => {
    await loginAs(page, "alice@example.com");
    await page.goto("/bills/new", { waitUntil: "networkidle" });

    const amount = page.getByLabel("Amount", { exact: true });
    await expect(amount).toHaveAttribute("placeholder", "0,00");
    await page.getByLabel("What for?").fill("Groceries");

    // Edited and unreadable: the error shows and saving is blocked.
    await amount.fill("80,6,2");
    await expect(page.getByText("Can't read this amount. Type it like 1234,56.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save bill" })).toBeDisabled();

    // Regression: "80,62" used to read as 0 and silently disable Save.
    await amount.fill("80,62");
    await expect(page.getByText("Can't read this amount")).toBeHidden();
    await expect(page.getByText("Each person owes")).toBeVisible();
    await page.getByRole("button", { name: "Save bill" }).click();
    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByText("Bill added")).toBeVisible();
  });
});
