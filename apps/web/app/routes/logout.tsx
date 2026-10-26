import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { destroyUserSessionCookie, getOptionalUser } from "~/lib/auth/session.server";
import { audit } from "~/lib/audit.server";
import { flashCookie } from "~/lib/flash.server";

export async function action({ request }: Route.ActionArgs) {
  const actor = getOptionalUser(request);
  const headers = new Headers();
  headers.append("Set-Cookie", destroyUserSessionCookie(request));
  headers.append("Set-Cookie", flashCookie("info", "Signed out"));
  audit({ event: "session.revoke", request, actorContactId: actor?.contact.id ?? null });
  return redirect("/login", { headers });
}

export async function loader() {
  return redirect("/");
}
