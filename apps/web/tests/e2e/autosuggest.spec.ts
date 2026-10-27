import { expect, test } from "@playwright/test";
import { loginAs } from "./fixtures";

test("participant autosuggest matches a previously-used contact by display name", async ({
  page,
}) => {
  // Henry picks a display name that is NOT derivable from his email.
  await loginAs(page, "henry@example.com");
  await page.goto("/settings", { waitUntil: "networkidle" }); // typed input needs a hydrated form
  await page.getByLabel("Display name").fill("Bob Builder");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  // Grace shares a bill with Henry, so he becomes one of her known contacts.
  await loginAs(page, "grace@example.com");
  await page.goto("/bills/new", { waitUntil: "networkidle" }); // typed input needs a hydrated form
  await page.getByLabel("What for?").fill("Coffee");
  await page.getByLabel("Amount", { exact: true }).fill("8");
  await page.getByPlaceholder("Add by name or email").fill("henry@example.com");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Save bill" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");

  // New bill: typing the display name (not the email) surfaces Henry as a suggestion.
  await page.goto("/bills/new", { waitUntil: "networkidle" }); // typed input needs a hydrated form
  await page.getByLabel("What for?").fill("Lunch");
  await page.getByLabel("Amount", { exact: true }).fill("12");
  await page.getByPlaceholder("Add by name or email").fill("build");

  const option = page.getByRole("option").filter({ hasText: "Bob Builder" });
  await expect(option).toBeVisible();
  await option.click();

  // Picked by name → added, and shown by display name on the chip.
  await expect(page.getByText("Bob Builder").first()).toBeVisible();
});
