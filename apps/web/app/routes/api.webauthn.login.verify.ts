import type { Route } from "./+types/api.webauthn.login.verify";
import { createUserSessionCookie } from "~/lib/auth/session.server";
import { verifyAuthentication } from "~/lib/auth/webauthn.server";
import { getUserById } from "~/lib/db/queries.server";
import { audit } from "~/lib/audit.server";

export async function action({ request }: Route.ActionArgs) {
  const body = (await request.json()) as { challengeId: string; response: unknown };
  const userId = await verifyAuthentication(body.challengeId, body.response as never);
  if (!userId) return Response.json({ verified: false }, { status: 400 });

  const user = getUserById(userId);
  if (!user) return Response.json({ verified: false }, { status: 400 });

  const cookie = createUserSessionCookie(user.id, user.contactId);
  audit({ event: "login.passkey", request, actorContactId: user.contactId, subjectId: user.id });
  return Response.json({ verified: true }, { headers: { "Set-Cookie": cookie } });
}
