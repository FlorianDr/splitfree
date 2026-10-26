import { Users } from "lucide-react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/groups.join.$token";
import { Button } from "~/components/ui/button";
import { audit } from "~/lib/audit.server";
import { requireUser } from "~/lib/auth/session.server";
import { addGroupMembers, getGroupByJoinToken } from "~/lib/db/queries.server";
import { flashCookie } from "~/lib/flash.server";
import { MAX_GROUP_MEMBERS } from "~/lib/limits";
import { pageMeta } from "~/lib/meta";
import { useActionErrorToast } from "~/lib/use-action-error-toast";

export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, { title: "Join a group", path: "/groups/join" });
}

/**
 * Join-link landing page. Signed out → requireUser sends you to /login and back here afterwards
 * (also after a first sign-up). Opening the link never joins by itself (D13): session cookies ride on
 * cross-site top-level GETs, so a GET that joined would let any page quietly add a signed-in visitor
 * to someone's group. Joining is the POST behind the button.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { contact } = requireUser(request);
  const group = getGroupByJoinToken(params.token);
  // Unknown, reset, turned off or expired — all look the same.
  if (!group) return data({ valid: false as const }, { status: 404 });
  if (group.members.some((m) => m.email === contact.email)) {
    // Already in (e.g. added by email before signing up): go to the group, keeping the first-login
    // passkey prompt the login redirect asked for.
    const passkey = new URL(request.url).searchParams.get("passkey") === "setup";
    throw redirect(`/groups/${group.id}${passkey ? "?passkey=setup" : ""}`);
  }
  // Name and size only — member emails are visible once you've joined.
  return { valid: true as const, name: group.name, memberCount: group.members.length };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { contact } = requireUser(request);
  const group = getGroupByJoinToken(params.token);
  if (!group) throw new Response("Not found", { status: 404 });
  if (group.members.some((m) => m.email === contact.email)) return redirect(`/groups/${group.id}`);
  // Joining adds only your own email: no contacts are created and no email is sent.
  const result = addGroupMembers(group.id, [contact.email], contact.id, MAX_GROUP_MEMBERS);
  if (result === "full") return { error: `This group is full (${MAX_GROUP_MEMBERS} people).` };
  audit({ event: "group.join", request, actorContactId: contact.id, subjectId: group.id });
  return redirect(`/groups/${group.id}`, {
    headers: { "Set-Cookie": flashCookie("success", `You joined ${group.name}`) },
  });
}

export default function JoinGroup({ loaderData, actionData }: Route.ComponentProps) {
  useActionErrorToast(actionData);
  const navigation = useNavigation();

  if (!loaderData.valid) {
    return (
      <div className="space-y-3 rounded-xl border bg-card p-6 text-center">
        <h1 className="font-display text-2xl font-semibold">This link is no longer valid</h1>
        <p className="text-sm text-muted-foreground">
          Join links expire after four weeks, and the group's creator can reset or turn them off. Ask
          someone in the group for a new link.
        </p>
        <Button asChild variant="outline">
          <Link viewTransition to="/">Go to your dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-secondary">
        <Users className="size-5" aria-hidden />
      </span>
      <div>
        <h1 className="font-display text-2xl font-semibold">Join {loaderData.name}?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loaderData.memberCount} {loaderData.memberCount === 1 ? "person" : "people"} · members can see
          each other's email addresses and add the group to bills.
        </p>
      </div>
      {actionData?.error ? <p className="text-sm text-destructive">{actionData.error}</p> : null}
      <Form method="post">
        <Button type="submit" className="w-full sm:w-auto" disabled={navigation.state === "submitting"}>
          Join group
        </Button>
      </Form>
    </div>
  );
}
