import { expect, test } from "@playwright/test";
import { loginAs } from "./fixtures";

test("record a payment that settles a balance", async ({ page }) => {
  await loginAs(page, "carol@example.com");

  // Carol pays 20, split equally with Dave → Dave owes Carol 10.
  await page.goto("/bills/new", { waitUntil: "networkidle" }); // typed input needs a hydrated form
  await page.getByLabel("What for?").fill("Taxi");
  await page.getByLabel("Amount", { exact: true }).fill("20");
  await page.getByPlaceholder("Add by name or email").fill("dave@example.com");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Save bill" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByText("owes you")).toBeVisible();

  // Open Dave and settle up — the payment form is prefilled with Dave → Carol 10.00.
  await page.getByRole("link", { name: /dave@example\.com/ }).click();
  await expect(page).toHaveURL(/\/people\//);
  // Scope to the page body — the nav also has a "Settle up" link.
  await page.getByRole("main").getByRole("link", { name: "Settle up" }).click();
  await expect(page).toHaveURL(/\/payments\/new/);
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("10.00");

  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");

  // Balance cleared.
  await expect(page.getByText("all settled up")).toBeVisible();

  // Audit: the Activity tab still lists the past expense and the settlement.
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByText("Taxi")).toBeVisible();
  await expect(page.getByText("dave paid You")).toBeVisible();
});

test.describe("on a German-language device", () => {
  test.use({ locale: "de-DE" });

  test("a payment typed with a decimal comma is recorded", async ({ page }) => {
    await loginAs(page, "greta@example.com");

    await page.goto("/bills/new", { waitUntil: "networkidle" });
    await page.getByLabel("What for?").fill("Kino");
    await page.getByLabel("Amount", { exact: true }).fill("20,00");
    await page.getByPlaceholder("Add by name or email").fill("henrik@example.com");
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByRole("button", { name: "Save bill" }).click();
    await expect(page).toHaveURL("http://localhost:3000/");

    await page.getByRole("link", { name: /henrik@example\.com/ }).click();
    await expect(page).toHaveURL(/\/people\//);
    await page.getByRole("main").getByRole("link", { name: "Settle up" }).click();
    await expect(page).toHaveURL(/\/payments\/new/);
    await page.waitForLoadState("networkidle");

    // The prefill is pristine: no error even though it uses a dot.
    const amount = page.getByLabel("Amount", { exact: true });
    await expect(amount).toHaveValue("10.00");
    await expect(page.getByText("Can't read this amount")).toBeHidden();

    await amount.fill("10,0,0");
    await expect(page.getByText("Can't read this amount. Type it like 1234,56.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Record payment" })).toBeDisabled();

    // Parsed again on the server with the locale the form sends along.
    await amount.fill("10,00");
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByText("all settled up")).toBeVisible();
  });
});
