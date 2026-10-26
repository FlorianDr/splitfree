import type { Route } from "./+types/api.webauthn.register.verify";
import { requireRecentAuth, requireUser } from "~/lib/auth/session.server";
import { verifyRegistration } from "~/lib/auth/webauthn.server";

export async function action({ request }: Route.ActionArgs) {
  const { user } = requireUser(request);
  // A07 step-up: defense in depth — also enforced on the options endpoint that issues the challenge.
  requireRecentAuth(request);
  const body = (await request.json()) as { challengeId: string; response: unknown };
  const ok = await verifyRegistration(body.challengeId, body.response as never, user);
  return Response.json({ verified: ok });
}
