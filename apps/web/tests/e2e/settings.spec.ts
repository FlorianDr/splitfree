import { expect, test } from "@playwright/test";
import { loginAs } from "./fixtures";

test("settings: set display name and log out", async ({ page }) => {
  await loginAs(page, "frank@example.com");
  await page.goto("/");

  // The nav knob is now Settings, not a logout button.
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.getByLabel("Display name").fill("Frank Ock");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveValue("Frank Ock");

  // The larger logout button lives here now.
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("display name is shown to others instead of email", async ({ page }) => {
  // Alice sets a display name.
  await loginAs(page, "alice2@example.com");
  await page.goto("/settings", { waitUntil: "networkidle" }); // typed input needs a hydrated form
  await page.getByLabel("Display name").fill("Alice Wonder");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  // Bob adds Alice to a bill — her display name shows on his dashboard.
  await loginAs(page, "bob2@example.com");
  await page.goto("/bills/new", { waitUntil: "networkidle" }); // typed input needs a hydrated form
  await page.getByLabel("What for?").fill("Lunch");
  await page.getByLabel("Amount", { exact: true }).fill("20");
  await page.getByPlaceholder("Add by name or email").fill("alice2@example.com");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Save bill" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");

  await expect(page.getByText("Alice Wonder")).toBeVisible();
});
