import { computeNetBalances, simplifyDebts } from "@splitfree/ledger";
import type { Route } from "./+types/settle";
import { SettleUpList } from "~/components/settle-up-list";
import { requireUser } from "~/lib/auth/session.server";
import { getContactsByIds, getLedgerInputsForContact } from "~/lib/db/queries.server";
import { pageMeta } from "~/lib/meta";

export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, { title: "Settle up", path: "/settle" });
}

export async function loader({ request }: Route.LoaderArgs) {
  const { contact } = requireUser(request);
  const { bills, payments } = getLedgerInputsForContact(contact.id);

  const net = computeNetBalances(bills, payments);
  const transfers = simplifyDebts(net);

  const ids = new Set<string>();
  for (const t of transfers) {
    ids.add(t.fromContactId);
    ids.add(t.toContactId);
  }
  const contacts = getContactsByIds([...ids]);
  const nameOf = (id: string) => {
    const c = contacts.get(id);
    return c?.displayName ?? c?.email ?? "Someone";
  };

  const rows = transfers.map((t) => ({
    from: { id: t.fromContactId, name: nameOf(t.fromContactId) },
    to: { id: t.toContactId, name: nameOf(t.toContactId) },
    currency: t.currency,
    cents: t.amountCents,
    involvesMe: t.fromContactId === contact.id || t.toContactId === contact.id,
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
            ? "Everyone's settled up — nothing to pay."
            : `The fewest payments that clear every balance: ${rows.length} ${
                rows.length === 1 ? "payment" : "payments"
              }.`}
        </p>
      </div>

      {rows.length > 0 ? <SettleUpList rows={rows} meId={meId} /> : null}

      {rows.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          We net everyone out and match the biggest creditor with the biggest debtor, so you never
          make more than necessary (at most one fewer than the number of people involved).
        </p>
      ) : null}
    </div>
  );
}
