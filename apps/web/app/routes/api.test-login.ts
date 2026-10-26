import { redirect } from "react-router";
import type { Route } from "./+types/api.test-login";
import { createUserSessionCookie } from "~/lib/auth/session.server";
import { findOrCreateVerifiedUser } from "~/lib/db/queries.server";
import { allowTestLogin } from "~/lib/env.server";
import { safeRedirectPath } from "~/lib/redirect";

/**
 * Test-only login used by Playwright to bypass OTP/WebAuthn while exercising the real session path.
 * Hard-gated by ALLOW_TEST_LOGIN=1 (never set in production) — returns 404 otherwise.
 */
export async function action({ request }: Route.ActionArgs) {
  if (!allowTestLogin) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  if (!email) throw new Response("email required", { status: 400 });

  const { user, contact } = findOrCreateVerifiedUser(email);
  const cookie = createUserSessionCookie(user.id, contact.id);
  // A01 (CWE-601): only honor same-site, absolute-path redirects (see safeRedirectPath).
  return redirect(safeRedirectPath(form.get("redirectTo")), { headers: { "Set-Cookie": cookie } });
}

export async function loader() {
  throw new Response("Not found", { status: 404 });
}
