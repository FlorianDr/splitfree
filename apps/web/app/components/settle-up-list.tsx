import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Money } from "~/components/money";
import { Button } from "~/components/ui/button";

export interface SettleRow {
  from: { id: string; name: string };
  to: { id: string; name: string };
  currency: string;
  cents: number;
  involvesMe: boolean;
}

export function SettleUpList({ rows, meId }: { rows: SettleRow[]; meId: string }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 text-sm">
            <span className={r.from.id === meId ? "font-semibold" : ""}>
              {r.from.id === meId ? "You" : r.from.name}
            </span>
            <ArrowRight className="mx-1.5 inline size-3.5 text-muted-foreground" />
            <span className={r.to.id === meId ? "font-semibold" : ""}>
              {r.to.id === meId ? "you" : r.to.name}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="font-semibold tabular-nums">
              <Money cents={r.cents} currency={r.currency} />
            </span>
            {r.involvesMe ? (
              <Button asChild size="sm" variant="outline">
                <Link viewTransition
                  to={`/payments/new?from=${r.from.id}&to=${r.to.id}&amountCents=${r.cents}&currency=${r.currency}`}
                >
                  Record
                </Link>
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
