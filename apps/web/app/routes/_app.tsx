import { Outlet, useLocation } from "react-router";
import type { Route } from "./+types/_app";
import { AppNav } from "~/components/app-nav";
import { hasPageSkeleton, PageSkeleton } from "~/components/page-skeleton";
import { PasskeyPrompt } from "~/components/passkey-prompt";
import { requireUser } from "~/lib/auth/session.server";
import { useSlowNavigation } from "~/lib/use-slow-navigation";

export async function loader({ request }: Route.LoaderArgs) {
  const { contact } = requireUser(request);
  return {
    me: { id: contact.id, email: contact.email, displayName: contact.displayName },
  };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { pathname } = useLocation();
  const slow = useSlowNavigation();
  // Skeleton only for slow link navigations to another page; a form submission (and the redirect
  // after it) keeps the form on screen with its own pending state.
  const pendingPath =
    slow?.state === "loading" && !slow.formMethod && slow.location.pathname !== pathname
      ? slow.location.pathname
      : null;
  const showSkeleton = pendingPath !== null && hasPageSkeleton(pendingPath);

  return (
    <div className="min-h-svh bg-background">
      <AppNav me={loaderData.me} />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Hidden, not unmounted, so an interrupted navigation keeps the page's state. */}
        <div hidden={showSkeleton}>
          <Outlet />
        </div>
        {showSkeleton ? <PageSkeleton pathname={pendingPath} /> : null}
      </main>
      <PasskeyPrompt />
    </div>
  );
}
