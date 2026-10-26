import { Banknote, Receipt } from "lucide-react";
import { Link } from "react-router";
import { Money } from "~/components/money";

export type ActivityItem =
  | {
      kind: "bill";
      id: string;
      date: number;
      title: string;
      currency: string;
      amountCents: number;
      net: number; // your paid − owed: +ve you lent, −ve you borrowed
    }
  | {
      kind: "payment";
      id: string;
      date: number;
      currency: string;
      amountCents: number;
      note: string | null;
      fromName: string;
      toName: string;
      iReceived: boolean;
    };

const fmtDate = (sec: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(sec * 1000));

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
      {children}
    </span>
  );
}

export function ActivityList({ items }: { items: ActivityItem[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((it) =>
        it.kind === "bill" ? (
          <li key={`b-${it.id}`}>
            <Link viewTransition
              to={`/bills/${it.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Icon>
                  <Receipt className="size-4" />
                </Icon>
                <div className="min-w-0">
                  <p className="truncate font-medium">{it.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(it.date)} · total <Money cents={it.amountCents} currency={it.currency} />
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right text-sm tabular-nums">
                {it.net > 0 ? (
                  <span className="font-medium text-success">
                    you lent <Money cents={it.net} currency={it.currency} />
                  </span>
                ) : it.net < 0 ? (
                  <span className="font-medium text-destructive">
                    you borrowed <Money cents={-it.net} currency={it.currency} />
                  </span>
                ) : (
                  <span className="text-muted-foreground">no balance</span>
                )}
              </div>
            </Link>
          </li>
        ) : (
          <li key={`p-${it.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Icon>
                <Banknote className="size-4" />
              </Icon>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {it.fromName} paid {it.toName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(it.date)}
                  {it.note ? ` · ${it.note}` : ""}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right text-sm tabular-nums">
              <span className={it.iReceived ? "font-medium text-success" : "text-muted-foreground"}>
                <Money cents={it.amountCents} currency={it.currency} />
              </span>
            </div>
          </li>
        ),
      )}
    </ul>
  );
}
