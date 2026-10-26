import { authenticationOptions } from "~/lib/auth/webauthn.server";

// Usernameless flow: no email in, no account-existence signal out (A07 enumeration).
export async function action() {
  const { options, challengeId } = await authenticationOptions();
  return Response.json({ options, challengeId });
}
