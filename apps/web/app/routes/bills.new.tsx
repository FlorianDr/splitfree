import { allocateOwed } from "@splitfree/ledger";
import { redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/bills.new";
import { BillForm } from "~/components/bill-form";
import { requireUser } from "~/lib/auth/session.server";
import { exceededInviteLimit } from "~/lib/auth/otp-limits.server";
import {
  countRecentParticipantAdds,
  createBill,
  deleteEmailSend,
  findContactByEmail,
  inviteCounts,
  listGroupsForEmail,
  recordEmailSend,
  upsertContactByEmail,
} from "~/lib/db/queries.server";
import { emailPaused, sendInviteEmail } from "~/lib/email/email.server";
import { raiseAlert } from "~/lib/alert.server";
import { audit, auditThrottled } from "~/lib/audit.server";
import { env } from "~/lib/env.server";
import { flashCookie } from "~/lib/flash.server";
import {
  MAX_NEW_PARTICIPANTS_PER_WINDOW,
  MAX_PARTICIPANTS_PER_BILL,
  NEW_PARTICIPANT_WINDOW_SECONDS,
} from "~/lib/limits";
import { pageMeta } from "~/lib/meta";
import { listSharedContacts } from "~/lib/people.server";
import { useActionErrorToast } from "~/lib/use-action-error-toast";


export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, { title: "Add a bill", path: "/bills/new" });
}

export async function loader({ request }: Route.LoaderArgs) {
  const { contact } = requireUser(request);
  // Offer everyone you've shared a bill or payment with as type-ahead suggestions, plus the groups
  // you're in. Group members are NOT added as suggestions/names: a name is only revealed for people
  // you share history with (A01), so other members show as their email.
  const contacts = listSharedContacts(contact.id);
  return {
    me: { email: contact.email, name: contact.displayName ?? contact.email },
    suggestions: [...contacts.values()].map((c) => ({
      email: c.email,
      name: c.displayName ?? c.email,
    })),
    groups: listGroupsForEmail(contact.email).map((g) => ({
      id: g.id,
      name: g.name,
      members: g.members.map((m) => m.email),
    })),
  };
}

const payloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  currency: z.string().trim().min(1).max(8),
  date: z.string().trim().min(1),
  amountCents: z.number().int().positive(),
  participants: z.array(z.string().email()).min(1).max(MAX_PARTICIPANTS_PER_BILL),
  payers: z.record(z.string(), z.number().int().nonnegative()),
  split: z.object({
    mode: z.enum(["equal", "exact", "percent", "shares"]),
    values: z.record(z.string(), z.number()).optional(),
  }),
});

function pick(values: Record<string, number>, emails: string[]): Record<string, number> {
  return Object.fromEntries(emails.map((e) => [e, values[e] ?? 0]));
}

export async function action({ request }: Route.ActionArgs) {
  const { contact } = requireUser(request);
  const form = await request.formData();

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(JSON.parse(String(form.get("payload") ?? "{}")));
  } catch {
    return { error: "Invalid bill data." };
  }

  const total = payload.amountCents;
  const emails = [...new Set(payload.participants.map((e) => e.toLowerCase()))];
  const values = Object.fromEntries(
    Object.entries(payload.split.values ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );

  // Server-authoritative owed allocation.
  let owedByEmail: Record<string, number>;
  try {
    const mode = payload.split.mode;
    if (mode === "equal") {
      owedByEmail = allocateOwed({ totalCents: total, participantIds: emails, mode });
    } else if (mode === "shares") {
      owedByEmail = allocateOwed({ totalCents: total, participantIds: emails, mode, weights: pick(values, emails) });
    } else if (mode === "percent") {
      owedByEmail = allocateOwed({ totalCents: total, participantIds: emails, mode, percent: pick(values, emails) });
    } else {
      owedByEmail = allocateOwed({ totalCents: total, participantIds: emails, mode, exactCents: pick(values, emails) });
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not split the bill." };
  }

  // Payers: default to the creator paying the whole amount.
  const rawPayers = Object.entries(payload.payers).map(([k, v]) => [k.toLowerCase(), v] as const);
  const payers: Record<string, number> =
    rawPayers.length > 0 ? Object.fromEntries(rawPayers) : { [contact.email]: total };
  const paidSum = Object.values(payers).reduce((a, b) => a + b, 0);
  if (paidSum !== total) {
    return { error: "The amounts paid don't add up to the total." };
  }

  const allEmails = [...new Set([...emails, ...Object.keys(payers)])];
  // Sanity cap: a bill can't involve more than MAX_PARTICIPANTS_PER_BILL distinct people.
  if (allEmails.length > MAX_PARTICIPANTS_PER_BILL) {
    return { error: `A bill can include at most ${MAX_PARTICIPANTS_PER_BILL} people.` };
  }
  // A01: you may only create a bill you are part of (as a participant or a payer). Without this,
  // any user could inject debts between people they have no relationship with. 403 — the form
  // always includes the creator, so only a forged request reaches here.
  if (!allEmails.includes(contact.email)) {
    throw new Response("Forbidden", { status: 403 });
  }
  // Validate the split sums to the total BEFORE creating any contacts, so an invalid request can't
  // pollute the contacts table.
  const owedSum = allEmails.reduce((a, e) => a + (owedByEmail[e] ?? 0), 0);
  if (owedSum !== total) {
    return { error: "The split doesn't add up to the total." };
  }

  // A04: rate-limit introducing brand-new contacts (the invite-spam vector).
  const newEmails = allEmails.filter((e) => e !== contact.email && !findContactByEmail(e));
  const recentNew = countRecentParticipantAdds(contact.id, NEW_PARTICIPANT_WINDOW_SECONDS);
  if (recentNew + newEmails.length > MAX_NEW_PARTICIPANTS_PER_WINDOW) {
    audit({
      event: "participant.ratelimited",
      request,
      actorContactId: contact.id,
      detail: { attempted: newEmails.length, recentlyAdded: recentNew },
    });
    return { error: "You've added too many new people recently — please try again later." };
  }

  const participants = allEmails.map((email) => {
    const c = upsertContactByEmail(email);
    return { contactId: c.id, paidCents: payers[email] ?? 0, owedCents: owedByEmail[email] ?? 0 };
  });

  const ms = Date.parse(`${payload.date}T00:00:00`);
  const billId = createBill({
    title: payload.title,
    currency: payload.currency,
    amountCents: total,
    date: Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000),
    createdByContactId: contact.id,
    participants,
  });

  // A09: audit each newly-introduced participant (this also feeds the A04 counter) and the bill.
  for (const email of newEmails) {
    audit({
      event: "participant.add",
      request,
      actorContactId: contact.id,
      subjectId: findContactByEmail(email)?.id ?? null,
      detail: { email },
    });
  }
  audit({
    event: "bill.create",
    request,
    actorContactId: contact.id,
    subjectId: billId,
    detail: { amountCents: total, currency: payload.currency, participants: participants.length },
  });

  // Invite the people who were just added for the first time. Best-effort; never blocks the bill.
  // Each invite is reserved in the email ledger first (synchronously, before any await) and the rest
  // are skipped once a limit is hit, so invites can't spend the daily email budget sign-in needs.
  const origin = env.WEBAUTHN_ORIGIN.replace(/\/$/, "");
  const inviterName = contact.displayName ?? contact.email;
  const invites: { email: string; sendId: string }[] = [];
  for (const email of newEmails) {
    const limit = emailPaused()
      ? "provider_paused"
      : exceededInviteLimit(inviteCounts(contact.id), {
          invitePerDay: env.INVITE_DAILY_BUDGET,
          budgetPerDay: env.EMAIL_DAILY_BUDGET,
        });
    if (limit) {
      auditThrottled(`invite:${limit}:${contact.id}`, {
        event: "invite.skipped",
        request,
        actorContactId: contact.id,
        subjectId: billId,
        detail: { limit, skipped: newEmails.length - invites.length },
      });
      break;
    }
    invites.push({ email, sendId: recordEmailSend("invite", { actorContactId: contact.id }) });
  }
  await Promise.all(
    invites.map(async ({ email, sendId }) => {
      const sent = await sendInviteEmail(email, {
        inviterName,
        billTitle: payload.title,
        signupUrl: `${origin}/login?email=${encodeURIComponent(email)}`,
      });
      if (sent.ok) return;
      deleteEmailSend(sendId);
      auditThrottled(`send:invite:${sent.reason}`, {
        event: "email.send.fail",
        request,
        detail: { kind: "invite", reason: sent.reason },
      });
      if (sent.reason === "quota") {
        raiseAlert("provider-quota", "email provider quota spent, email sign-in paused until 00:00 UTC");
      }
    }),
  );

  return redirect("/", { headers: { "Set-Cookie": flashCookie("success", "Bill added") } });
}

export default function BillsNew({ loaderData, actionData }: Route.ComponentProps) {
  useActionErrorToast(actionData);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Add a bill</h1>
      <BillForm
        me={loaderData.me}
        suggestions={loaderData.suggestions}
        groups={loaderData.groups}
        error={actionData?.error}
      />
    </div>
  );
}
