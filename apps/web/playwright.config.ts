import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the dev server with ALLOW_TEST_LOGIN=1 so the test-login route is enabled
 * (it is gated off in production). A throwaway e2e.db is wiped before the server starts.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  // One retry absorbs dev-server cold-compile timing (a route compiling on its first hit can let an
  // interaction fire before React hydrates). The hydration *bug* itself is fixed via optimizeDeps;
  // a retry would not have rescued that (it failed deterministically).
  retries: process.env.CI ? 2 : 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "list" : "line",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Run against the DEV server — that's the environment users develop in, and where a Vite
    // dependency-optimization failure once broke hydration (dead buttons/dropdowns). Running E2E
    // here catches that class of bug; the production path is covered by the Docker build.
    command: "rm -f e2e.db e2e.db-shm e2e.db-wal && pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ALLOW_TEST_LOGIN: "1",
      JWT_SECRET: "e2e-test-secret-change-me-0123456789",
      DATABASE_PATH: "./e2e.db",
      WEBAUTHN_RP_ID: "localhost",
      WEBAUTHN_ORIGIN: "http://localhost:3000",
      // No reverse proxy in dev: tests send X-Real-IP themselves (otp-rate-limit.spec.ts).
      CLIENT_IP_HEADER: "x-real-ip",
      // High enough that repeated runs against a reused dev server never hit the global email caps.
      OTP_GLOBAL_MAX_PER_HOUR: "100000",
      EMAIL_DAILY_BUDGET: "100000",
      INVITE_DAILY_BUDGET: "100000",
      // Cloudflare's always-pass Turnstile test keys, so the bot check runs (unset = off). The test
      // secret accepts any non-empty token, so only a missing one is refused. Needs network access to
      // Cloudflare.
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    },
  },
});
