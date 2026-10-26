import { Link } from "react-router";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Money } from "~/components/money";

export interface FriendBalance {
  currency: string;
  cents: number; // +ve => they owe you; -ve => you owe them
}

export interface FriendRow {
  id: string;
  name: string;
  email: string;
  balances: FriendBalance[];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((p) => p[0] ?? "").join("");
  return (letters || name[0] || "?").toUpperCase();
}

export function BalanceList({ friends }: { friends: FriendRow[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {friends.map((f) => (
        <li key={f.id}>
          <Link viewTransition
            to={`/people/${f.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-9">
                <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                  {initials(f.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{f.name}</p>
                <p className="truncate text-xs text-muted-foreground">{f.email}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              {f.balances.map((b) => {
                const theyOweYou = b.cents > 0;
                return (
                  <div key={b.currency} className="text-right">
                    <div
                      className={`text-sm font-semibold tabular-nums ${
                        theyOweYou ? "text-success" : "text-destructive"
                      }`}
                    >
                      <Money cents={Math.abs(b.cents)} currency={b.currency} />
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {theyOweYou ? "owes you" : "you owe"}
                    </div>
                  </div>
                );
              })}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
