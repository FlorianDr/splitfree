import type { Route } from "./+types/api.webauthn.register.options";
import { requireRecentAuth, requireUser } from "~/lib/auth/session.server";
import { registrationOptions } from "~/lib/auth/webauthn.server";

export async function action({ request }: Route.ActionArgs) {
  const { user, contact } = requireUser(request);
  // A07 step-up: registering a passkey requires a recently authenticated session.
  requireRecentAuth(request);
  const { options, challengeId } = await registrationOptions(user, contact);
  return Response.json({ options, challengeId });
}
