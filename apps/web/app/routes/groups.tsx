import { ChevronRight, Users } from "lucide-react";
import { useState } from "react";
import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/groups";
import { MemberPicker } from "~/components/member-picker";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { audit } from "~/lib/audit.server";
import { requireUser } from "~/lib/auth/session.server";
import { countGroupsCreatedBy, createGroup, listGroupsForEmail } from "~/lib/db/queries.server";
import { flashCookie } from "~/lib/flash.server";
import { parseGroupName, parseMemberEmails } from "~/lib/group-input.server";
import { auditMemberAdds, creatorLabel, memberAddRefusal } from "~/lib/groups.server";
import { GROUP_NAME_MAX, MAX_GROUP_MEMBERS, MAX_GROUPS_CREATED } from "~/lib/limits";
import { pageMeta } from "~/lib/meta";
import { listSharedContacts, namesByEmailFor } from "~/lib/people.server";
import { useActionErrorToast } from "~/lib/use-action-error-toast";

export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, { title: "Groups", path: "/groups" });
}

export async function loader({ request }: Route.LoaderArgs) {
  const { contact } = requireUser(request);
  const names = namesByEmailFor(contact);
  // Only groups you're a member of — groups never appear to anyone outside them.
  const groups = listGroupsForEmail(contact.email).map((g) => ({
    id: g.id,
    name: g.name,
    memberCount: g.members.length,
    isCreator: g.createdByContactId === contact.id,
    creator: creatorLabel(g, names),
  }));
  return {
    me: contact.email,
    groups,
    suggestions: [...listSharedContacts(contact.id).values()].map((c) => ({
      email: c.email,
      name: c.displayName ?? c.email,
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { contact } = requireUser(request);
  const form = await request.formData();
  if (form.get("intent") !== "create") return { error: "Unknown action." };

  const name = parseGroupName(form.get("name"));
  if ("error" in name) return name;
  // The creator is always a member, so at most MAX_GROUP_MEMBERS - 1 others.
  const parsed = parseMemberEmails(form.get("members"), MAX_GROUP_MEMBERS - 1);
  if ("error" in parsed) return parsed;
  const others = parsed.emails.filter((e) => e !== contact.email);
  if (others.length === 0) return { error: "Add at least one other person to the group." };
  if (others.length > MAX_GROUP_MEMBERS - 1) {
    return { error: `A group can have at most ${MAX_GROUP_MEMBERS} people.` };
  }
  if (countGroupsCreatedBy(contact.id) >= MAX_GROUPS_CREATED) {
    return { error: `You can create at most ${MAX_GROUPS_CREATED} groups.` };
  }
  const refusal = memberAddRefusal(request, contact.id, others.length);
  if (refusal) return { error: refusal };

  // No contacts are created and no email is sent: people are invited when a bill includes them.
  const groupId = createGroup({
    name: name.name,
    creatorContactId: contact.id,
    creatorEmail: contact.email,
    memberEmails: others,
  });
  audit({ event: "group.create", request, actorContactId: contact.id, subjectId: groupId, detail: { members: others.length } });
  auditMemberAdds(request, contact.id, groupId, others);
  return redirect(`/groups/${groupId}`, {
    headers: { "Set-Cookie": flashCookie("success", "Group created") },
  });
}

export default function GroupsPage({ loaderData, actionData }: Route.ComponentProps) {
  useActionErrorToast(actionData);
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const { groups } = loaderData;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Groups</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Save the people you often split with, then add them to a bill by typing the group's name.
        </p>
      </div>

      {groups.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {groups.map((g) => (
            <li key={g.id}>
              <Link viewTransition
                to={`/groups/${g.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/60"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{g.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {g.memberCount} {g.memberCount === 1 ? "person" : "people"} ·{" "}
                      {g.isCreator ? "created by you" : `created by ${g.creator}`}
                    </span>
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          You're not in any groups yet.
        </p>
      )}

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 font-medium">New group</h2>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="members" value={JSON.stringify(members)} />
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Flatmates, running club…"
              maxLength={GROUP_NAME_MAX}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Members</Label>
            <p className="text-xs text-muted-foreground">
              You're included automatically. Nobody gets an email until a bill includes them.
            </p>
            <MemberPicker
              value={members}
              onChange={setMembers}
              suggestions={loaderData.suggestions}
              exclude={[loaderData.me]}
            />
          </div>
          <Button type="submit" disabled={submitting || !name.trim() || members.length === 0}>
            {submitting ? "Creating…" : "Create group"}
          </Button>
        </Form>
      </section>
    </div>
  );
}
