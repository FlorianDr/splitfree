import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAs } from "./fixtures";

/**
 * The full WebAuthn ceremony against Chromium's virtual authenticator (CDP), so passkey registration
 * and usernameless sign-in are covered end to end, including across @simplewebauthn upgrades.
 */
test("add a passkey in settings, then sign in with it", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await loginAs(page, `passkey-${randomBytes(4).toString("hex")}@example.com`);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText("Passkey added")).toBeVisible();
  await expect(page.getByText(/^1 passkey/)).toBeVisible();

  // Signed out, the discoverable credential on the authenticator signs us back in without an email.
  await context.clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await expect(page.getByText("Signed in")).toBeVisible();
  await expect(page).toHaveURL("http://localhost:3000/");
});
