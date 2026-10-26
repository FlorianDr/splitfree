import { useMemo, useState } from "react";
import { Form, useNavigation } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { exampleAmount, numberSeparators, parseCents } from "~/lib/amount";
import { useLocale } from "~/lib/use-locale";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "SEK", "NOK", "DKK", "PLN", "CZK"];

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

interface Props {
  contacts: { id: string; name: string }[];
  defaults: { from: string; to: string; amount: string; currency: string };
  error?: string;
}

export function PaymentForm({ contacts, defaults, error }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [amount, setAmount] = useState(defaults.amount);
  const locale = useLocale();
  const seps = useMemo(() => numberSeparators(locale), [locale]);
  // Only flag an amount the user has edited; the settle-up prefill is never the one at fault.
  const amountUnreadable = amount !== defaults.amount && parseCents(amount, seps) === null;

  return (
    <Form method="post" className="space-y-5">
      {/* The action parses the amount with the same separators the user typed it in. */}
      <input type="hidden" name="locale" value={locale} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <select
            id="from"
            name="fromContactId"
            className={selectClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          >
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <span className="pb-2 text-muted-foreground">→</span>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <select
            id="to"
            name="toContactId"
            className={selectClass}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          >
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`0${seps.decimal}00`}
            required
            aria-invalid={amountUnreadable || undefined}
            aria-describedby={amountUnreadable ? "amount-error" : undefined}
          />
          {amountUnreadable ? (
            <p id="amount-error" className="text-sm text-destructive">
              Can&apos;t read this amount. Type it like {exampleAmount(seps)}.
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <select id="currency" name="currency" className={`${selectClass} w-24`} defaultValue={defaults.currency}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="date">Date</Label>
        <Input id="date" name="date" type="date" defaultValue={today} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Input id="note" name="note" placeholder="e.g. Venmo, cash" />
      </div>

      {from === to ? (
        <p className="text-sm text-destructive">Pick two different people.</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" className="w-full" disabled={submitting || from === to || amountUnreadable}>
        {submitting ? "Saving…" : "Record payment"}
      </Button>
    </Form>
  );
}
