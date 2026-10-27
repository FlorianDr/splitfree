import { expect, test } from "@playwright/test";
import { loginAs } from "./fixtures";

test("settings: set display name and log out", async ({ page }) => {
  await loginAs(page, "frank@example.com");
  await page.goto("/");

  // The nav knob is now Settings, not a logout button.
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.getByLabel("Display name").fill("Frank Ock");
  await page.getByRole("button", { name: "Save", exact: true }).click();
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
  await page.getByRole("button", { name: "Save", exact: true }).click();
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

test("settings: name and IBAN are saved together and checked", async ({ page }) => {
  await loginAs(page, "iban@example.com");
  await page.goto("/settings", { waitUntil: "networkidle" }); // typed input needs a hydrated form

  // A typo is flagged as soon as the field is left, before saving.
  await page.getByLabel("IBAN").fill("DE89 3704 0044 0532 0130 01");
  await page.getByLabel("Display name").focus();
  await expect(page.getByText("This IBAN has a typo")).toBeVisible();

  // An IBAN needs the account holder's name; nothing is saved without it. (New accounts start with
  // the email's local part as their name, so clear it first.)
  await page.getByLabel("Display name").fill("");
  await page.getByLabel("IBAN").fill("de89370400440532013000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Enter the name on your bank account to add an IBAN.")).toBeVisible();

  // The server checks too, even when the browser check is skipped.
  const bad = await page.request.post("/settings", {
    form: { displayName: "Iris Bank", iban: "SA0380000000608010167519" },
    maxRedirects: 0,
  });
  expect(bad.status()).toBe(200);
  expect(await page.request.get("/settings").then((r) => r.text())).not.toContain("SA03");

  // Name and IBAN saved together; the IBAN comes back in the grouped paper format.
  await page.getByLabel("Display name").fill("Iris Bank");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await expect(page.getByLabel("IBAN")).toHaveValue("DE89 3704 0044 0532 0130 00");
  await expect(page.getByLabel("Display name")).toHaveValue("Iris Bank");

  // A post without the IBAN field (an older form) keeps it; an empty field clears it.
  await page.request.post("/settings", { form: { displayName: "Iris Bank" }, maxRedirects: 0 });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByLabel("IBAN")).toHaveValue("DE89 3704 0044 0532 0130 00");
  await page.getByLabel("IBAN").fill("");
  const save = page.waitForResponse((r) => r.url().includes("/settings") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await save;
  await page.reload();
  await expect(page.getByLabel("IBAN")).toHaveValue("");
});

test("settle up shows the payee's IBAN only to the person paying", async ({ page }) => {
  // Paula sets her bank details.
  await loginAs(page, "paula@example.com");
  await page.goto("/settings", { waitUntil: "networkidle" }); // typed input needs a hydrated form
  await page.getByLabel("Display name").fill("Paula Payee");
  await page.getByLabel("IBAN").fill("NL91ABNA0417164300");
  // Only Wero's own links are taken, so nobody can plant a link to somewhere else.
  await page.getByLabel("Wero link").fill("https://evil.example/p/1/s/AbC123");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("That isn't a Wero link.")).toBeVisible();
  // A pasted amount is dropped; the link is rebuilt from its allowed parts.
  await page.getByLabel("Wero link").fill("share.wero-wallet.eu/p/1/c/AbC123?a=500&c=EUR");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await expect(page.getByLabel("Wero link")).toHaveValue("https://share.wero-wallet.eu/p/1/c/AbC123");

  // She pays for lunch with Dan, so Dan owes her.
  await page.goto("/bills/new", { waitUntil: "networkidle" }); // typed input needs a hydrated form
  await page.getByLabel("What for?").fill("Lunch");
  await page.getByLabel("Amount", { exact: true }).fill("20");
  await page.getByPlaceholder("Add by name or email").fill("dan@example.com");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Save bill" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");

  // Paula is paid, not paying: no IBAN on her settle screen.
  await page.goto("/settle");
  await expect(page.getByText("NL91 ABNA 0417 1643 00")).toHaveCount(0);

  // Dan pays: he sees her name, IBAN and the €10 he owes to copy, and her Wero link.
  await loginAs(page, "dan@example.com");
  await page.goto("/settle");
  await expect(page.getByText("NL91 ABNA 0417 1643 00")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Paula Payee's name" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Paula Payee's IBAN" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Paula Payee's amount" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pay with Wero" })).toHaveAttribute(
    "href",
    "https://share.wero-wallet.eu/p/1/c/AbC123",
  );
});
