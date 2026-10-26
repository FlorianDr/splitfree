import { formatCents } from "@splitfree/ledger";

/** Render integer minor units as a localized currency string. Isomorphic (server + client). */
export function Money({
  cents,
  currency,
  className,
}: {
  cents: number;
  currency: string;
  className?: string;
}) {
  return <span className={className}>{formatCents(cents, currency)}</span>;
}
