import { computePairwiseBalances } from "@splitfree/ledger";
import { Link } from "react-router";
import type { Route } from "./+types/people.$contactId";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Money } from "~/components/money";
import { initials } from "~/components/balance-list";
import { requireUser } from "~/lib/auth/session.server";
import {
  getContactById,
  listBillsForContact,
  listPaymentsForContact,
} from "~/lib/db/queries.server";
import { simplifiedBalances } from "~/lib/settle.server";

const fmtDate = (sec: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(sec * 1000));

export async function loader({ request, params }: Route.LoaderArgs) {
  const { contact } = requireUser(request);
  const other = getContactById(params.contactId);
  if (!other) throw new Response("Not found", { status: 404 });

  const bills = listBillsForContact(contact.id);
  const payments = listPaymentsForContact(contact.id);

  // A01: only reveal a person you actually share history with — otherwise any contact's email/name
  // leaks to anyone holding their (UUID) id. 404 keeps existence undisclosed. The one exception is a
  // settle-up counterparty from the wider circle: shown by email, with just the amount to settle.
  const shared =
    bills.some((b) => b.participants.some((p) => p.contactId === other.id)) ||
    payments.some((p) => p.fromContactId === other.id || p.toContactId === other.id);
  const simplified = simplifiedBalances(contact.id).get(other.id);
  if (!shared && !simplified) throw new Response("Not found", { status: 404 });

  // Simplified (default): what we settle in the plan. ?view=all: our pairwise balance.
  const view = new URL(request.url).searchParams.get("view") === "all" ? "all" : "simplified";

  // Pairwise balances (reuse the ledger), keyed by currency for this person.
  const pairwise = computePairwiseBalances(
    contact.id,
    bills.map((b) => ({ currency: b.currency, participants: b.participants })),
    payments.map((p) => ({
      currency: p.currency,
      fromContactId: p.fromContactId,
      toContactId: p.toContactId,
      amountCents: p.amountCents,
    })),
  );
  const balances = [
    ...((view === "all" ? pairwise.get(other.id) : simplified) ?? new Map<string, number>()).entries(),
  ]
    .filter(([, cents]) => cents !== 0)
    .map(([currency, cents]) => ({ currency, cents }));

  // Shared bills between us.
  const sharedBills = bills
    .filter((b) => b.participants.some((p) => p.contactId === other.id))
    .map((b) => {
      const mine = b.participants.find((p) => p.contactId === contact.id);
      return {
        kind: "bill" as const,
        id: b.id,
        title: b.title,
        date: b.date,
        currency: b.currency,
        amountCents: b.amountCents,
        myPaid: mine?.paidCents ?? 0,
        myOwed: mine?.owedCents ?? 0,
      };
    });

  // Payments between us.
  const ourPayments = payments
    .filter(
      (p) =>
        (p.fromContactId === contact.id && p.toContactId === other.id) ||
        (p.fromContactId === other.id && p.toContactId === contact.id),
    )
    .map((p) => ({
      kind: "payment" as const,
      id: p.id,
      date: p.date,
      currency: p.currency,
      amountCents: p.amountCents,
      note: p.note,
      iPaid: p.fromContactId === contact.id,
    }));

  const activity = [...sharedBills, ...ourPayments].sort((a, b) => b.date - a.date);

  const primary = balances[0];
  const settleHref = primary
    ? `/payments/new?from=${primary.cents > 0 ? other.id : contact.id}&to=${
        primary.cents > 0 ? contact.id : other.id
      }&amountCents=${Math.abs(primary.cents)}&currency=${primary.currency}`
    : `/payments/new?from=${contact.id}&to=${other.id}`;

  return {
    other: { id: other.id, name: shared ? (other.displayName ?? other.email) : other.email, email: other.email },
    view,
    balances,
    activity,
    settleHref,
  };
}

export default function PersonDetail({ loaderData }: Route.ComponentProps) {
  const { other, view, balances, activity, settleHref } = loaderData;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar className="size-11">
          <AvatarFallback className="bg-secondary text-secondary-foreground">
            {initials(other.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-semibold">{other.name}</h1>
          <p className="truncate text-sm text-muted-foreground">{other.email}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        {balances.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {view === "all" ? "You're all settled up." : `Nothing to settle with ${other.name}.`}
          </p>
        ) : (
          <div className="space-y-1">
            {balances.map((b) => (
              <p key={b.currency} className="tabular-nums">
                <span className={`font-semibold ${b.cents > 0 ? "text-success" : "text-destructive"}`}>
                  <Money cents={Math.abs(b.cents)} currency={b.currency} />
                </span>{" "}
                <span className="text-sm text-muted-foreground">
                  {b.cents > 0 ? `${other.name} owes you` : `you owe ${other.name}`}
                </span>
              </p>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <Button asChild size="sm">
            <Link viewTransition to={settleHref}>Settle up</Link>
          </Button>
          <Link
            to={view === "all" ? `/people/${other.id}` : `/people/${other.id}?view=all`}
            replace
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {view === "all" ? "Show simplified" : "Show all balances"}
          </Link>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {view === "all"
            ? "Everything between the two of you, bill by bill."
            : "Simplified across everyone you share bills with: the amount that actually changes hands."}
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Activity</h2>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {activity.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">No activity yet.</li>
          ) : (
            activity.map((a) =>
              a.kind === "bill" ? (
                <li key={`b-${a.id}`} className="px-4 py-3">
                  <Link viewTransition to={`/bills/${a.id}`} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(a.date)} · total <Money cents={a.amountCents} currency={a.currency} />
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm tabular-nums">
                      <span className="text-muted-foreground">you owe </span>
                      <Money cents={a.myOwed} currency={a.currency} />
                    </div>
                  </Link>
                </li>
              ) : (
                <li key={`p-${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{a.iPaid ? "You paid" : `${other.name} paid you`}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(a.date)}
                      {a.note ? ` · ${a.note}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-sm font-semibold tabular-nums text-success">
                    <Money cents={a.amountCents} currency={a.currency} />
                  </div>
                </li>
              ),
            )
          )}
        </ul>
      </div>
    </div>
  );
}
