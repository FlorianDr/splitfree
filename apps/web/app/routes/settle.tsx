import type { Route } from "./+types/settle";
import { SettleUpList } from "~/components/settle-up-list";
import { requireUser } from "~/lib/auth/session.server";
import { getContactsByIds, getPaymentDetails } from "~/lib/db/queries.server";
import { formatIban } from "~/lib/iban";
import { pageMeta } from "~/lib/meta";
import { visibleContacts } from "~/lib/people.server";
import { mySettleTransfers } from "~/lib/settle.server";

export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, { title: "Settle up", path: "/settle" });
}

export async function loader({ request }: Route.LoaderArgs) {
  const { contact } = requireUser(request);

  // Only my part of the circle's plan: who I pay and who pays me.
  const transfers = mySettleTransfers(contact.id);
  const people = visibleContacts(
    contact.id,
    transfers.map((t) => (t.fromContactId === contact.id ? t.toContactId : t.fromContactId)),
  );
  const nameOf = (id: string) => people.get(id)?.name ?? "Someone";

  // Payment details only where I'm the one paying: every row here is mine, so only the people I
  // pay get theirs shown, and nobody else's. With an IBAN the display name is the account holder name
  // (set together), so it is shown even to a payer outside the payee's shared history: the bank
  // checks it against the IBAN.
  const payees = getContactsByIds(
    transfers.filter((t) => t.fromContactId === contact.id).map((t) => t.toContactId),
  );
  const payTo = (toId: string) => {
    const { iban, weroLink } = getPaymentDetails(toId);
    if (!iban && !weroLink) return null;
    return {
      name: payees.get(toId)?.displayName ?? "",
      iban: iban ? { raw: iban, formatted: formatIban(iban) } : null,
      wero: weroLink,
    };
  };

  const rows = transfers.map((t) => ({
    from: { id: t.fromContactId, name: nameOf(t.fromContactId) },
    to: { id: t.toContactId, name: nameOf(t.toContactId) },
    currency: t.currency,
    cents: t.amountCents,
    involvesMe: true,
    payTo: t.fromContactId === contact.id ? payTo(t.toContactId) : null,
  }));

  return { meId: contact.id, rows };
}

export default function Settle({ loaderData }: Route.ComponentProps) {
  const { rows, meId } = loaderData;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Settle up</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length === 0
            ? "You're all settled up — nothing to pay or collect."
            : `Your simplified payments: ${rows.length} ${rows.length === 1 ? "payment" : "payments"}.`}
        </p>
      </div>

      {rows.length > 0 ? <SettleUpList rows={rows} meId={meId} /> : null}

      {rows.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          We net out everyone you share bills with, and the people they share bills with, then match
          the biggest creditor with the biggest debtor, so the group needs as few payments as possible.
          You only see the ones that involve you.
        </p>
      ) : null}
    </div>
  );
}
