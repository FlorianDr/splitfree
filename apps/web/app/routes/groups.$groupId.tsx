import { Copy, LogOut, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Form, redirect, useNavigation } from "react-router";
import { toast } from "sonner";
import type { Route } from "./+types/groups.$groupId";
import { MemberPicker } from "~/components/member-picker";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { audit } from "~/lib/audit.server";
import { assertGroupCreator, requireGroupMember } from "~/lib/auth/authz.server";
import { requireUser } from "~/lib/auth/session.server";
import {
  addGroupMembers,
  deleteGroup,
  removeGroupMember,
  renameGroup,
  setJoinToken,
} from "~/lib/db/queries.server";
import { flashCookie } from "~/lib/flash.server";
import { normalizeEmail, parseGroupName, parseMemberEmails } from "~/lib/group-input.server";
import { auditMemberAdds, creatorEmail, creatorLabel, joinUrlFor, labelFor, memberAddRefusal } from "~/lib/groups.server";
import { GROUP_NAME_MAX, MAX_GROUP_MEMBERS } from "~/lib/limits";
import { pageMeta } from "~/lib/meta";
import { listSharedContacts, namesByEmailFor } from "~/lib/people.server";
import { useActionErrorToast } from "~/lib/use-action-error-toast";

const fmtDate = (sec: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(sec * 1000));

export function meta({ matches, params }: Route.MetaArgs) {
  return pageMeta(matches, { title: "Group", path: `/groups/${params.groupId}` });
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { contact } = requireUser(request);
  // A01: members only — 404 for everyone else, so outsiders can't tell the group exists.
  const group = requireGroupMember(params.groupId, contact.email);
  const names = namesByEmailFor(contact);
  const ownerEmail = creatorEmail(group);
  const nowSec = Math.floor(Date.now() / 1000);
  const linkLive =
    group.joinToken !== null && group.joinTokenExpiresAt !== null && group.joinTokenExpiresAt > nowSec;

  return {
    group: { id: group.id, name: group.name },
    isCreator: group.createdByContactId === contact.id,
    creator: group.createdByContactId === contact.id ? "you" : creatorLabel(group, names),
    members: group.members
      .map((m) => ({
        email: m.email,
        label: m.email === contact.email ? "You" : labelFor(m.email, names),
        isCreator: m.email === ownerEmail,
      }))
      // Creator first, then in the order people were added.
      .sort((a, b) => Number(b.isCreator) - Number(a.isCreator)),
    link: linkLive
      ? { state: "on" as const, url: joinUrlFor(group.joinToken!), expiresAt: group.joinTokenExpiresAt! }
      : { state: group.joinToken === null ? ("off" as const) : ("expired" as const) },
    suggestions: [...listSharedContacts(contact.id).values()].map((c) => ({
      email: c.email,
      name: c.displayName ?? c.email,
    })),
    full: group.members.length >= MAX_GROUP_MEMBERS,
  };
}

const done = (groupId: string, message: string) =>
  redirect(`/groups/${groupId}`, { headers: { "Set-Cookie": flashCookie("success", message) } });

export async function action({ request, params }: Route.ActionArgs) {
  const { contact } = requireUser(request);
  // A01: every intent first proves membership (404 otherwise, before any mutation).
  const group = requireGroupMember(params.groupId, contact.email);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const actor = { request, actorContactId: contact.id, subjectId: group.id };

  switch (intent) {
    // Any member may add people.
    case "add": {
      const parsed = parseMemberEmails(form.get("members"), MAX_GROUP_MEMBERS);
      if ("error" in parsed) return parsed;
      const existing = new Set(group.members.map((m) => m.email));
      const fresh = parsed.emails.filter((e) => !existing.has(e));
      if (fresh.length === 0) return { error: "Everyone you picked is already in the group." };
      const refusal = memberAddRefusal(request, contact.id, fresh.length);
      if (refusal) return { error: refusal };
      const result = addGroupMembers(group.id, fresh, contact.id, MAX_GROUP_MEMBERS);
      if (result === "full") return { error: `A group can have at most ${MAX_GROUP_MEMBERS} people.` };
      auditMemberAdds(request, contact.id, group.id, result.added);
      return done(group.id, result.added.length === 1 ? "Person added" : `${result.added.length} people added`);
    }

    // Members (not the creator) may leave; the creator deletes the group instead.
    case "leave": {
      if (group.createdByContactId === contact.id) {
        return { error: "You created this group — delete it instead of leaving." };
      }
      removeGroupMember(group.id, contact.email);
      audit({ event: "group.leave", ...actor });
      return redirect("/groups", {
        headers: { "Set-Cookie": flashCookie("success", `You left ${group.name}`) },
      });
    }

    // Everything below is creator-only (403 for other members).
    case "remove": {
      assertGroupCreator(group, contact.id);
      const email = normalizeEmail(String(form.get("email") ?? ""));
      if (email === contact.email) return { error: "You can't remove yourself — delete the group instead." };
      if (!group.members.some((m) => m.email === email)) return { error: "That person isn't in the group." };
      removeGroupMember(group.id, email);
      audit({ event: "group.member.remove", ...actor, detail: { email } });
      return done(
        group.id,
        group.joinToken ? "Removed. Reset the join link if they shouldn't rejoin." : "Removed",
      );
    }
    case "rename": {
      assertGroupCreator(group, contact.id);
      const name = parseGroupName(form.get("name"));
      if ("error" in name) return name;
      renameGroup(group.id, name.name);
      audit({ event: "group.rename", ...actor });
      return done(group.id, "Group renamed");
    }
    case "delete": {
      assertGroupCreator(group, contact.id);
      deleteGroup(group.id);
      audit({ event: "group.delete", ...actor });
      return redirect("/groups", {
        headers: { "Set-Cookie": flashCookie("success", "Group deleted — bills stay as they are") },
      });
    }
    case "link.reset":
    case "link.on": {
      assertGroupCreator(group, contact.id);
      setJoinToken(group.id, true);
      audit({ event: intent === "link.on" ? "group.link.on" : "group.link.reset", ...actor });
      return done(group.id, intent === "link.on" ? "Join link turned on" : "New join link created");
    }
    case "link.off": {
      assertGroupCreator(group, contact.id);
      setJoinToken(group.id, false);
      audit({ event: "group.link.off", ...actor });
      return done(group.id, "Join link turned off");
    }
    default:
      return { error: "Unknown action." };
  }
}

function IntentButton({
  intent,
  children,
  ...props
}: { intent: string } & React.ComponentProps<typeof Button>) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <Button type="submit" {...props}>
        {children}
      </Button>
    </Form>
  );
}

function AddPeople({
  members,
  suggestions,
  submitting,
}: {
  members: string[];
  suggestions: { email: string; name: string }[];
  submitting: boolean;
}) {
  const [adding, setAdding] = useState<string[]>([]);
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="font-medium">Add people</h2>
      <Form method="post" className="space-y-3">
        <input type="hidden" name="intent" value="add" />
        <input type="hidden" name="members" value={JSON.stringify(adding)} />
        <MemberPicker value={adding} onChange={setAdding} suggestions={suggestions} exclude={members} />
        <Button type="submit" disabled={submitting || adding.length === 0}>
          Add to group
        </Button>
      </Form>
    </section>
  );
}

export default function GroupPage({ loaderData, actionData }: Route.ComponentProps) {
  useActionErrorToast(actionData);
  const { group, isCreator, members, link } = loaderData;
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const [name, setName] = useState(group.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">{group.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {members.length} {members.length === 1 ? "person" : "people"} · created by {loaderData.creator}
        </p>
      </div>

      {/* Members */}
      <section className="space-y-3">
        <h2 className="font-medium">Members</h2>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {members.map((m) => (
            <li key={m.email} title={m.email} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0 truncate">
                {m.label}
                {m.isCreator ? <span className="ml-2 text-xs text-muted-foreground">creator</span> : null}
              </span>
              {isCreator && !m.isCreator ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="email" value={m.email} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${m.label}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-4" />
                  </Button>
                </Form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* Add people (any member) */}
      {loaderData.full ? (
        <p className="text-sm text-muted-foreground">This group is full ({members.length} people).</p>
      ) : (
        // Keyed by member count so the picked chips clear once an add has gone through.
        <AddPeople
          key={members.length}
          members={members.map((m) => m.email)}
          suggestions={loaderData.suggestions}
          submitting={submitting}
        />
      )}

      {/* Join link */}
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <div>
          <h2 className="font-medium">Join link</h2>
          <p className="text-sm text-muted-foreground">
            {link.state === "on"
              ? `Anyone with this link can join after signing in. Valid until ${fmtDate(link.expiresAt)}.`
              : link.state === "expired"
                ? "The join link has expired."
                : "The join link is turned off."}
          </p>
        </div>
        {link.state === "on" ? (
          <div className="flex gap-2">
            <Input readOnly value={link.url} aria-label="Join link" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link.url);
                  toast.success("Link copied");
                } catch {
                  toast.error("Couldn't copy — select the link and copy it yourself.");
                }
              }}
            >
              <Copy className="size-4" /> Copy
            </Button>
          </div>
        ) : null}
        {isCreator ? (
          <div className="flex flex-wrap gap-2">
            {link.state === "on" ? (
              <>
                <IntentButton intent="link.reset" variant="outline" size="sm">
                  Reset link
                </IntentButton>
                <IntentButton intent="link.off" variant="ghost" size="sm">
                  Turn off link
                </IntentButton>
              </>
            ) : (
              <IntentButton intent="link.on" variant="outline" size="sm">
                {link.state === "expired" ? "Create a new link" : "Turn on link"}
              </IntentButton>
            )}
          </div>
        ) : null}
      </section>

      {/* Rename (creator) */}
      {isCreator ? (
        <section className="rounded-xl border bg-card p-5">
          <Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="rename" />
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Group name</Label>
              <Input
                id="group-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={GROUP_NAME_MAX}
                required
              />
            </div>
            <Button type="submit" variant="outline" disabled={submitting || !name.trim() || name.trim() === group.name}>
              Rename
            </Button>
          </Form>
        </section>
      ) : null}

      {/* Leave (members) / Delete (creator) */}
      {isCreator ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="size-4" /> Delete group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this group?</DialogTitle>
              <DialogDescription>
                “{group.name}” disappears for everyone in it. Bills you already split with the group stay
                exactly as they are.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <IntentButton intent="delete" variant="destructive">
                Delete
              </IntentButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <IntentButton intent="leave" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <LogOut className="size-4" /> Leave group
        </IntentButton>
      )}
    </div>
  );
}
