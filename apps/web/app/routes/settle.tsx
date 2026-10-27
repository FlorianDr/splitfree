import { simplifyDebts } from "@splitfree/ledger";
import type { Route } from "./+types/settle";
import { SettleUpList } from "~/components/settle-up-list";
import { requireUser } from "~/lib/auth/session.server";
import { getContactsByIds, getNetBalances, listSettleCircle } from "~/lib/db/queries.server";
import { pageMeta } from "~/lib/meta";
import { listSharedContacts } from "~/lib/people.server";

export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, { title: "Settle up", path: "/settle" });
}

export async function loader({ request }: Route.LoaderArgs) {
  const { contact } = requireUser(request);

  // Plan over the whole circle, not just my bills: everyone in it then sees the same plan, and it
  // clears every balance (a balance from a bill I'm not on would otherwise be missing).
  const transfers = simplifyDebts(getNetBalances(listSettleCircle(contact.id)));

  const ids = new Set<string>();
  for (const t of transfers) {
    ids.add(t.fromContactId);
    ids.add(t.toContactId);
  }
  const contacts = getContactsByIds([...ids]);
  // Display names only within my shared history (A01, people.server.ts); the rest of the circle by email.
  const shared = listSharedContacts(contact.id);
  const nameOf = (id: string) => {
    const c = shared.get(id);
    return c?.displayName ?? c?.email ?? contacts.get(id)?.email ?? "Someone";
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
