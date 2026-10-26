import { expect, test } from "@playwright/test";
import { loginAs } from "./fixtures";

// page.route can't see requests the app's service worker forwards, so keep it out of the way.
test.use({ serviceWorkers: "block" });

test("a slow navigation shows the header progress bar and a page skeleton", async ({ page }) => {
  await loginAs(page, "progress@example.com");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Add bill" })).toBeVisible();

  const bar = page.locator("header [data-slot=navigation-progress]");
  await expect(bar).toHaveCSS("opacity", "0");

  // Slow down the route's single-fetch data request so the loading UI's show delay elapses.
  await page.route("**/*.data*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });

  await page.getByRole("link", { name: "Settle up" }).click();
  await expect(bar).toHaveCSS("opacity", "1");
  const skeleton = page.getByRole("status").filter({ hasText: "Loading…" });
  await expect(skeleton).toBeVisible();
  await page.screenshot({ path: "test-results/navigation-progress.png" });

  await expect(page.getByRole("heading", { name: "Settle up" })).toBeVisible();
  await expect(skeleton).toHaveCount(0);
  await expect(bar).toHaveCSS("opacity", "0");
});

test("in-app links navigate with a view transition", async ({ page }) => {
  await loginAs(page, "transition@example.com");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Add bill" })).toBeVisible();

  await page.evaluate(() => {
    const start = document.startViewTransition.bind(document);
    (window as unknown as { transitions: number }).transitions = 0;
    document.startViewTransition = ((...args: Parameters<typeof start>) => {
      (window as unknown as { transitions: number }).transitions++;
      return start(...args);
    }) as typeof document.startViewTransition;
  });

  await page.getByRole("link", { name: "Groups" }).click();
  await expect(page.getByRole("heading", { name: "Groups" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { transitions: number }).transitions)).toBe(1);
});

test("the header stays pinned while the page scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await loginAs(page, "sticky@example.com");
  await page.goto("/settings");
  await page.evaluate(() => {
    document.querySelector("main")!.style.paddingBottom = "2000px";
    scrollTo(0, 600);
  });
  const box = await page.locator("header").boundingBox();
  expect(box?.y).toBe(0);
});
