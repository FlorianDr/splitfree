import { redirect } from "react-router";
import type { Route } from "./+types/payments.new";
import { PaymentForm } from "~/components/payment-form";
import { requireUser } from "~/lib/auth/session.server";
import { assertPaymentParty } from "~/lib/auth/authz.server";
import {
  createPayment,
  getContactsByIds,
  listBillsForContact,
  listPaymentsForContact,
  listSettleCircle,
} from "~/lib/db/queries.server";
import { numberSeparators, parseCents } from "~/lib/amount";
import { audit } from "~/lib/audit.server";
import { flashCookie } from "~/lib/flash.server";
import { pageMeta } from "~/lib/meta";
import { useActionErrorToast } from "~/lib/use-action-error-toast";

export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, { title: "Record a payment", path: "/payments/new" });
}

export async function loader({ request }: Route.LoaderArgs) {
  const { contact } = requireUser(request);

  const ids = new Set<string>([contact.id]);
  for (const b of listBillsForContact(contact.id)) {
    for (const p of b.participants) ids.add(p.contactId);
  }
  for (const p of listPaymentsForContact(contact.id)) {
    ids.add(p.fromContactId);
    ids.add(p.toContactId);
  }
  const contacts = getContactsByIds([...ids]);
  const list = [...contacts.values()].map((c) => ({
    id: c.id,
    name: c.id === contact.id ? `${c.displayName ?? c.email} (you)` : (c.displayName ?? c.email),
  }));

  const url = new URL(request.url);
  // A settle-up row can pair me with someone from my circle I share no bill with (settle.tsx): offer
  // them too, by email only (A01, people.server.ts).
  const linked = [url.searchParams.get("from"), url.searchParams.get("to")].filter(
    (id): id is string => !!id && !ids.has(id),
  );
  if (linked.length > 0) {
    const circle = new Set(listSettleCircle(contact.id));
    for (const c of getContactsByIds(linked.filter((id) => circle.has(id))).values()) {
      list.push({ id: c.id, name: c.email });
    }
  }

  const from = url.searchParams.get("from") ?? contact.id;
  const to = url.searchParams.get("to") ?? list.find((c) => c.id !== contact.id)?.id ?? contact.id;
  const amountCents = Number(url.searchParams.get("amountCents") ?? "");
  const amount = Number.isFinite(amountCents) && amountCents > 0 ? (amountCents / 100).toFixed(2) : "";
  const currency = url.searchParams.get("currency") ?? "EUR";

  return { contacts: list, defaults: { from, to, amount, currency } };
}

export async function action({ request }: Route.ActionArgs) {
  const { contact } = requireUser(request);
  const form = await request.formData();

  const fromContactId = String(form.get("fromContactId") ?? "");
  const toContactId = String(form.get("toContactId") ?? "");
  const currency = String(form.get("currency") ?? "EUR");
  const amountCents = parseCents(
    String(form.get("amount") ?? ""),
    numberSeparators(String(form.get("locale") ?? "")),
  );
  const note = String(form.get("note") ?? "").trim() || null;
  const ms = Date.parse(`${String(form.get("date") ?? "")}T00:00:00`);

  if (!fromContactId || !toContactId || fromContactId === toContactId) {
    return { error: "Choose two different people." };
  }
  if (amountCents === null || amountCents <= 0) {
    return { error: "Enter a valid amount." };
  }
  // A01: you may only record a payment you are a party to (forging third-party payments would let
  // an attacker rewrite other people's derived balances). 403 — the legit UI can't reach this.
  assertPaymentParty(contact.id, fromContactId, toContactId);

  const paymentId = createPayment({
    fromContactId,
    toContactId,
    currency,
    amountCents,
    date: Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000),
    note,
    createdByContactId: contact.id,
  });
  audit({
    event: "payment.create",
    request,
    actorContactId: contact.id,
    subjectId: paymentId,
    detail: { fromContactId, toContactId, amountCents, currency },
  });

  return redirect("/", { headers: { "Set-Cookie": flashCookie("success", "Payment recorded") } });
}

export default function PaymentsNew({ loaderData, actionData }: Route.ComponentProps) {
  useActionErrorToast(actionData);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Record a payment</h1>
      <PaymentForm
        contacts={loaderData.contacts}
        defaults={loaderData.defaults}
        error={actionData?.error}
      />
    </div>
  );
}
