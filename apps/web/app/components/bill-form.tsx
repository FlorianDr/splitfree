import { allocateOwed, formatCents, type SplitMode } from "@splitfree/ledger";
import { ChevronsUpDown, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Form, useNavigation } from "react-router";
import { toast } from "sonner";
import { ContactAutosuggest } from "~/components/contact-autosuggest";
import { Button } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { exampleAmount, numberSeparators, parseCents, parseDecimal } from "~/lib/amount";
import { type GroupOption, mergeMembers } from "~/lib/groups";
import { MAX_PARTICIPANTS_PER_BILL } from "~/lib/limits";
import { useLocale } from "~/lib/use-locale";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "SEK", "NOK", "DKK", "PLN", "CZK"];

interface Props {
  me: { email: string; name: string };
  suggestions: { email: string; name: string }[];
  /** Groups you're a member of; picking one adds its members like adding each by hand. */
  groups: GroupOption[];
  error?: string;
}

export function BillForm({ me, suggestions, groups, error }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const locale = useLocale();
  const seps = useMemo(() => numberSeparators(locale), [locale]);
  const zero = `0${seps.decimal}00`;

  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [date, setDate] = useState(today);
  const [amountStr, setAmountStr] = useState("");
  const [participants, setParticipants] = useState<string[]>([me.email]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [multiPayer, setMultiPayer] = useState(false);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});

  // Every amount field starts blank, and blank reads as 0, so only a field the user has edited can
  // be unreadable (null) — pristine fields never show the error.
  const readCents = (s: string | undefined) => parseCents(s ?? "", seps);
  const readNumber = (s: string | undefined) => parseDecimal(s ?? "", seps);
  const readError = `Can't read this amount. Type it like ${exampleAmount(seps)}.`;
  const amountUnreadable = readCents(amountStr) === null;
  const amountCents = readCents(amountStr) ?? 0;

  function addParticipant(email: string) {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@") || participants.includes(e)) return;
    setParticipants((p) => [...p, e]);
  }
  // A group expands into ordinary participant chips — the bill never knows a group was used.
  function addGroup(group: GroupOption) {
    const result = mergeMembers(participants, group.members, MAX_PARTICIPANTS_PER_BILL);
    if (result.overflow) {
      toast.error(
        `Adding ${group.name} would put more than ${MAX_PARTICIPANTS_PER_BILL} people on this bill.`,
      );
      return;
    }
    if (result.added.length === 0) {
      toast.info(`Everyone in ${group.name} is already on this bill.`);
      return;
    }
    setParticipants(result.next);
  }
  function removeParticipant(email: string) {
    if (email === me.email) return;
    setParticipants((p) => p.filter((e) => e !== email));
  }

  // Resolve an email to a display name (known contacts + you), falling back to the email itself.
  const nameByEmail = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suggestions) m.set(s.email.toLowerCase(), s.name);
    m.set(me.email.toLowerCase(), me.name);
    return m;
  }, [suggestions, me]);
  const nameOf = (email: string) => nameByEmail.get(email.toLowerCase()) ?? email;

  const numericValues = (): Record<string, number> =>
    Object.fromEntries(participants.map((e) => [e, readNumber(splitValues[e]) ?? 0]));
  const exactCentsValues = (): Record<string, number> =>
    Object.fromEntries(participants.map((e) => [e, readCents(splitValues[e]) ?? 0]));
  const payerCents = (): Record<string, number> =>
    multiPayer
      ? Object.fromEntries(participants.map((e) => [e, readCents(payerAmounts[e]) ?? 0]))
      : { [me.email]: amountCents };
  const payerUnreadable = (email: string) => readCents(payerAmounts[email]) === null;
  const splitUnreadable = (email: string) =>
    (splitMode === "exact" ? readCents(splitValues[email]) : readNumber(splitValues[email])) === null;
  const anyPayerUnreadable = multiPayer && participants.some(payerUnreadable);
  const anySplitUnreadable = splitMode !== "equal" && participants.some(splitUnreadable);

  const owed = useMemo<Record<string, number> | null>(() => {
    if (amountCents <= 0 || participants.length === 0) return null;
    try {
      if (splitMode === "equal")
        return allocateOwed({ totalCents: amountCents, participantIds: participants, mode: "equal" });
      if (splitMode === "shares")
        return allocateOwed({
          totalCents: amountCents,
          participantIds: participants,
          mode: "shares",
          weights: numericValues(),
        });
      if (splitMode === "percent")
        return allocateOwed({
          totalCents: amountCents,
          participantIds: participants,
          mode: "percent",
          percent: numericValues(),
        });
      return allocateOwed({
        totalCents: amountCents,
        participantIds: participants,
        mode: "exact",
        exactCents: exactCentsValues(),
      });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountCents, participants, splitMode, splitValues, seps]);

  const paid = payerCents();
  const paidSum = Object.values(paid).reduce((a, b) => a + b, 0);
  const payersBalanced = paidSum === amountCents;

  const payload = {
    title: title.trim(),
    currency,
    date,
    amountCents,
    participants,
    payers: paid,
    split: {
      mode: splitMode,
      values:
        splitMode === "equal"
          ? undefined
          : splitMode === "exact"
            ? exactCentsValues()
            : numericValues(),
    },
  };

  const canSubmit =
    title.trim().length > 0 &&
    amountCents > 0 &&
    participants.length > 0 &&
    owed != null &&
    payersBalanced &&
    !amountUnreadable &&
    !anyPayerUnreadable &&
    !anySplitUnreadable &&
    !submitting;

  return (
    <Form method="post" className="space-y-5">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <div className="space-y-1.5">
        <Label htmlFor="title">What for?</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Dinner, groceries, rent…"
          required
        />
      </div>

      {/* Amount — the headline input of the form */}
      <div className="flex flex-col items-center gap-2 py-3">
        <Input
          id="amount"
          aria-label="Amount"
          inputMode="decimal"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder={zero}
          required
          aria-invalid={amountUnreadable || undefined}
          aria-describedby={amountUnreadable ? "amount-error" : undefined}
          className="h-auto w-full max-w-[18rem] border-0 bg-transparent text-center font-display !text-5xl font-bold tabular-nums shadow-none focus-visible:ring-0 md:!text-5xl"
        />
        {amountUnreadable ? (
          <p id="amount-error" className="text-sm text-destructive">
            {readError}
          </p>
        ) : null}
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger aria-label="Currency" className="h-8 w-auto gap-1 rounded-full px-3 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="date">Date</Label>
        <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Split between</Label>
        <ul className="flex flex-wrap gap-2">
          {participants.map((email) => (
            <li
              key={email}
              title={email}
              className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground"
            >
              <span>{email === me.email ? `${nameOf(email)} (you)` : nameOf(email)}</span>
              {email !== me.email ? (
                <button
                  type="button"
                  onClick={() => removeParticipant(email)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${nameOf(email)}`}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <ContactAutosuggest
          suggestions={suggestions}
          groups={groups}
          exclude={participants}
          onAdd={addParticipant}
          onAddGroup={addGroup}
        />
      </div>

      {/* Preview of who owes what */}
      {owed ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="mb-2 font-medium text-muted-foreground">Each person owes</p>
          <ul className="space-y-1">
            {participants.map((email) => (
              <li key={email} className="flex justify-between tabular-nums">
                <span>{email === me.email ? "You" : nameOf(email)}</span>
                <span>{formatCents(owed[email] ?? 0, currency, locale)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="w-full justify-between">
            Advanced options
            <ChevronsUpDown className="size-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-5 pt-4">
          {/* Who paid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Who paid?</Label>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => setMultiPayer((v) => !v)}
              >
                {multiPayer ? "Single payer" : "Multiple people paid"}
              </Button>
            </div>
            {multiPayer ? (
              <div className="space-y-2">
                {participants.map((email) => (
                  <div key={email} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm">
                      {email === me.email ? `${email} (you)` : email}
                    </span>
                    <Input
                      className="w-28"
                      inputMode="decimal"
                      placeholder={zero}
                      aria-invalid={payerUnreadable(email) || undefined}
                      value={payerAmounts[email] ?? ""}
                      onChange={(e) =>
                        setPayerAmounts((p) => ({ ...p, [email]: e.target.value }))
                      }
                    />
                  </div>
                ))}
                {anyPayerUnreadable ? <p className="text-xs text-destructive">{readError}</p> : null}
                <p className={`text-xs ${payersBalanced ? "text-muted-foreground" : "text-destructive"}`}>
                  {formatCents(paidSum, currency, locale)} of {formatCents(amountCents, currency, locale)} entered
                  {payersBalanced ? "" : ` — ${formatCents(amountCents - paidSum, currency, locale)} left`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">You paid the full amount.</p>
            )}
          </div>

          {/* How to split */}
          <div className="space-y-2">
            <Label>How to split?</Label>
            <Tabs value={splitMode} onValueChange={(v) => setSplitMode(v as SplitMode)}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="equal">Equal</TabsTrigger>
                <TabsTrigger value="exact">Exact</TabsTrigger>
                <TabsTrigger value="percent">%</TabsTrigger>
                <TabsTrigger value="shares">Shares</TabsTrigger>
              </TabsList>
            </Tabs>
            {splitMode !== "equal" ? (
              <div className="space-y-2 pt-1">
                {participants.map((email) => (
                  <div key={email} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm">
                      {email === me.email ? "You" : email}
                    </span>
                    <Input
                      className="w-28"
                      inputMode="decimal"
                      placeholder={splitMode === "percent" ? "%" : splitMode === "shares" ? "shares" : zero}
                      aria-invalid={splitUnreadable(email) || undefined}
                      value={splitValues[email] ?? ""}
                      onChange={(e) => setSplitValues((p) => ({ ...p, [email]: e.target.value }))}
                    />
                  </div>
                ))}
                {anySplitUnreadable ? (
                  <p className="text-xs text-destructive">
                    {splitMode === "exact" ? readError : `Can't read this number. Type it like 12${seps.decimal}5.`}
                  </p>
                ) : owed == null ? (
                  <p className="text-xs text-destructive">
                    These values don&apos;t add up yet.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" className="w-full" disabled={!canSubmit}>
        {submitting ? "Saving…" : "Save bill"}
      </Button>
    </Form>
  );
}
