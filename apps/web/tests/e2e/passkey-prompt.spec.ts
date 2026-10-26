import { expect, test } from "@playwright/test";
import { loginAs } from "./fixtures";

// The modal UI: it opens from the first-login redirect param and "Maybe later" dismisses it. The real
// registration and sign-in ceremony is in passkey-flow.spec.ts.
test("first-login passkey prompt opens and dismisses", async ({ page }) => {
  await loginAs(page, "erin@example.com");
  await page.goto("/?passkey=setup");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Set up a passkey")).toBeVisible();

  await page.getByRole("button", { name: "Maybe later" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL("http://localhost:3000/");
});
