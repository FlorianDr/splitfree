import { Outlet, redirect } from "react-router";
import type { Route } from "./+types/_auth";
import { getOptionalUser } from "~/lib/auth/session.server";
import { safeRedirectPath } from "~/lib/redirect";

export async function loader({ request }: Route.LoaderArgs) {
  // Already signed in → go where the link wanted to take you (same-site paths only), else home.
  if (getOptionalUser(request)) {
    throw redirect(safeRedirectPath(new URL(request.url).searchParams.get("redirectTo")));
  }
  return null;
}

export default function AuthLayout() {
  return (
    <div className="grid min-h-svh place-items-center bg-secondary/40 px-4 py-10">
      <Outlet />
    </div>
  );
}
