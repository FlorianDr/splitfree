import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // Authenticated app shell (loader guards with requireUser).
  layout("routes/_app.tsx", [
    index("routes/home.tsx"),
    route("bills/new", "routes/bills.new.tsx"),
    route("bills/:billId", "routes/bills.$billId.tsx"),
    route("people/:contactId", "routes/people.$contactId.tsx"),
    route("settle", "routes/settle.tsx"),
    route("payments/new", "routes/payments.new.tsx"),
    route("settings", "routes/settings.tsx"),
    route("groups", "routes/groups.tsx"),
    route("groups/join/:token", "routes/groups.join.$token.tsx"),
    route("groups/:groupId", "routes/groups.$groupId.tsx"),
  ]),

  // Public auth shell.
  layout("routes/_auth.tsx", [
    route("login", "routes/login.tsx"),
    route("passkey-setup", "routes/passkey-setup.tsx"),
  ]),

  route("logout", "routes/logout.tsx"),

  // Liveness + DB probe for container healthchecks (no auth, no data).
  route("healthz", "routes/healthz.ts"),

  // Public legal pages (viewable signed-in or not).
  route("terms", "routes/terms.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("impressum", "routes/impressum.tsx"),

  // JSON resource routes (WebAuthn) + the env-gated test-login used by Playwright.
  route("api/webauthn/register/options", "routes/api.webauthn.register.options.ts"),
  route("api/webauthn/register/verify", "routes/api.webauthn.register.verify.ts"),
  route("api/webauthn/login/options", "routes/api.webauthn.login.options.ts"),
  route("api/webauthn/login/verify", "routes/api.webauthn.login.verify.ts"),
  route("api/test-login", "routes/api.test-login.ts"),
] satisfies RouteConfig;
