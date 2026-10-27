import { computePairwiseBalances } from "@splitfree/ledger";
import { Link } from "react-router";
import type { Route } from "./+types/home";
import { ActivityList, type ActivityItem } from "~/components/activity-list";
import { BalanceList, type BalanceView } from "~/components/balance-list";
import { Money } from "~/components/money";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { requireUser } from "~/lib/auth/session.server";
import { pageMeta } from "~/lib/meta";
import { visibleContacts } from "~/lib/people.server";
import { simplifiedBalances } from "~/lib/settle.server";
import {
  getContactsByIds,
  listBillsForContact,
  listPaymentsForContact,
} from "~/lib/db/queries.server";

export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, { path: "/" });
}

export async function loader({ request }: Route.LoaderArgs) {
  const { contact } = requireUser(request);
  const me = contact.id;
  const bills = listBillsForContact(me);
  const payments = listPaymentsForContact(me);

  // Names for everyone involved.
  const idSet = new Set<string>();
  for (const b of bills) for (const p of b.participants) idSet.add(p.contactId);
  for (const p of payments) {
    idSet.add(p.fromContactId);
    idSet.add(p.toContactId);
  }
  const contacts = getContactsByIds([...idSet]);
  const nameOf = (id: string) =>
    id === me ? "You" : (contacts.get(id)?.displayName ?? contacts.get(id)?.email ?? "Someone");

  // People tab, "All balances": pairwise balances (only non-zero).
  const pairwise = computePairwiseBalances(
    me,
    bills.map((b) => ({ currency: b.currency, participants: b.participants })),
    payments.map((p) => ({
      currency: p.currency,
      fromContactId: p.fromContactId,
      toContactId: p.toContactId,
      amountCents: p.amountCents,
    })),
  );
  const allFriends = [...pairwise.keys()]
    .map((id) => {
      const byCurrency = pairwise.get(id) ?? new Map<string, number>();
      const c = contacts.get(id);
      return {
        id,
        name: c?.displayName ?? c?.email ?? "Someone",
        email: c?.email ?? "",
        balances: [...byCurrency.entries()]
          .filter(([, cents]) => cents !== 0)
          .map(([currency, cents]) => ({ currency, cents })),
      };
    })
    .filter((f) => f.balances.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  // People tab, "Simplified" (the default): only what I actually pay or collect in the settle-up plan.
  const simplified = simplifiedBalances(me);
  const people = visibleContacts(me, [...simplified.keys()]);
  const simplifiedFriends = [...simplified.entries()]
    .map(([id, byCurrency]) => ({
      id,
      name: people.get(id)?.name ?? "Someone",
      email: people.get(id)?.email ?? "",
      balances: [...byCurrency.entries()].map(([currency, cents]) => ({ currency, cents })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const view: BalanceView = new URL(request.url).searchParams.get("view") === "all" ? "all" : "simplified";
  const friends = view === "all" ? allFriends : simplifiedFriends;
  const hasBalances = allFriends.length > 0 || simplifiedFriends.length > 0;

  // Both views add up to my net balance; the pairwise one is always complete.
  const totals = new Map<string, number>();
  for (const f of allFriends) {
    for (const b of f.balances) totals.set(b.currency, (totals.get(b.currency) ?? 0) + b.cents);
  }
  const overall = [...totals.entries()]
    .filter(([, cents]) => cents !== 0)
    .map(([currency, cents]) => ({ currency, cents }));

  // Activity tab: every expense and settlement, newest first.
  const activity: ActivityItem[] = [
    ...bills.map((b): ActivityItem => {
      const mine = b.participants.find((p) => p.contactId === me);
      return {
        kind: "bill",
        id: b.id,
        date: b.date,
        title: b.title,
        currency: b.currency,
        amountCents: b.amountCents,
        net: (mine?.paidCents ?? 0) - (mine?.owedCents ?? 0),
      };
    }),
    ...payments.map(
      (p): ActivityItem => ({
        kind: "payment",
        id: p.id,
        date: p.date,
        currency: p.currency,
        amountCents: p.amountCents,
        note: p.note,
        fromName: nameOf(p.fromContactId),
        toName: nameOf(p.toContactId),
        iReceived: p.toContactId === me,
      }),
    ),
  ].sort((a, b) => b.date - a.date);

  return { friends, overall, activity, view, hasBalances };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { friends, overall, activity, view, hasBalances } = loaderData;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5">
        <h1 className="text-sm font-medium text-muted-foreground">Your balance</h1>
        {overall.length === 0 ? (
          <p className="mt-1 font-display text-2xl font-semibold">You&apos;re all settled up 🎉</p>
        ) : (
          <div className="mt-1 space-y-1">
            {overall.map((o) => (
              <p key={o.currency} className="font-display text-2xl font-semibold tabular-nums">
                <span className={o.cents > 0 ? "text-success" : "text-destructive"}>
                  <Money cents={Math.abs(o.cents)} currency={o.currency} />
                </span>{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {o.cents > 0 ? "owed to you" : "you owe"}
                </span>
              </p>
            ))}
          </div>
        )}
      </section>

      <Tabs defaultValue="people">
        <div className="mb-3 flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="people">People</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          {hasBalances ? <ViewToggle view={view} /> : null}
        </div>

        <TabsContent value="people">
          {friends.length > 0 ? (
            <>
              {view === "all" && overall.length === 0 ? (
                <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">You&apos;re settled up overall.</span>{" "}
                  These balances, bill by bill, cancel out: they were paid through other people.
                </p>
              ) : null}
              <BalanceList friends={friends} view={view} />
            </>
          ) : hasBalances ? (
            <div className="rounded-xl border border-dashed bg-card p-8 text-center">
              <p className="font-medium">Nothing to pay or collect</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You&apos;re settled up overall. Your balances with individual people cancel out.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed bg-card p-8 text-center">
              <p className="font-medium">No open balances</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {activity.length > 0
                  ? "Everyone's settled up — check Activity for past expenses."
                  : "Add a bill and split it with friends."}
              </p>
              <Button asChild className="mt-4">
                <Link viewTransition to="/bills/new">Add a bill</Link>
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity">
          {activity.length > 0 ? (
            <ActivityList items={activity} />
          ) : (
            <div className="rounded-xl border border-dashed bg-card p-8 text-center">
              <p className="font-medium">No activity yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Expenses and payments will show up here.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Switch the People tab between the simplified plan and every pairwise balance. */
function ViewToggle({ view }: { view: BalanceView }) {
  const option = (value: BalanceView, label: string, to: string) => (
    <Link
      to={to}
      replace
      preventScrollReset
      aria-current={view === value ? "true" : undefined}
      className={`rounded-md px-2.5 py-1 transition-colors ${
        view === value ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Balances" className="flex rounded-lg bg-muted p-0.5 text-xs">
      {option("simplified", "Simplified", "/")}
      {option("all", "All balances", "/?view=all")}
    </nav>
  );
}
