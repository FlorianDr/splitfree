import { ArrowRight, Copy, ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useLocale } from "~/lib/use-locale";
import { formatCents } from "@splitfree/ledger";
import { Money } from "~/components/money";
import { Button } from "~/components/ui/button";

export interface SettleRow {
  from: { id: string; name: string };
  to: { id: string; name: string };
  currency: string;
  cents: number;
  involvesMe: boolean;
  /** The payee's payment details, on rows where I pay. */
  payTo: {
    name: string;
    iban: { raw: string; formatted: string } | null;
    /** Their Wero link. Wero ignores amounts in it, so the payer pastes the amount. */
    wero: string | null;
  } | null;
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error(`Couldn't copy. Select the ${what.toLowerCase()} and copy it instead.`);
  }
}

/**
 * The amount as a banking app wants it typed: the device's decimal point, no grouping, no symbol
 * ("20,00" in de, "20.00" in en).
 */
function plainAmount(cents: number, currency: string, locale: string): string {
  const digits =
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(cents / 10 ** digits);
}

/** One labelled value with a copy button, for typing a transfer into a banking app. */
function CopyField({
  label,
  noun,
  value,
  display = value,
  ofWhom,
  mono = false,
}: {
  label: string;
  /** How the button names it: "Copy Anna's IBAN". */
  noun: string;
  value: string;
  display?: string;
  ofWhom: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={mono ? "font-mono text-sm select-all" : "truncate text-sm select-all"}>
          {display}
        </div>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={`Copy ${ofWhom}'s ${noun}`}
        onClick={() => copy(value, label)}
      >
        <Copy className="size-4" />
      </Button>
    </div>
  );
}

export function SettleUpList({ rows, meId }: { rows: SettleRow[]; meId: string }) {
  const locale = useLocale();
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {rows.map((r, i) => (
        <li key={i} className="space-y-2 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
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
          </div>
          {r.payTo ? (
            <div className="space-y-2 rounded-lg bg-muted px-3 py-2">
              {r.payTo.iban ? (
                <>
                  <CopyField label="Name" noun="name" value={r.payTo.name} ofWhom={r.to.name} />
                  <CopyField
                    label="IBAN"
                    noun="IBAN"
                    value={r.payTo.iban.raw}
                    display={r.payTo.iban.formatted}
                    ofWhom={r.to.name}
                    mono
                  />
                </>
              ) : null}
              <CopyField
                label="Amount"
                noun="amount"
                value={plainAmount(r.cents, r.currency, locale)}
                display={formatCents(r.cents, r.currency)}
                ofWhom={r.to.name}
              />
              {r.payTo.wero ? (
                <Button asChild size="sm" className="w-full sm:w-auto">
                  <a href={r.payTo.wero} target="_blank" rel="noopener noreferrer">
                    Pay with Wero <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
