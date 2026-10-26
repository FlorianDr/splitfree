import { redirect } from "react-router";
import { Trash2 } from "lucide-react";
import type { Route } from "./+types/bills.$billId";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Form } from "react-router";
import { Money } from "~/components/money";
import { requireUser } from "~/lib/auth/session.server";
import { requireBillParticipant } from "~/lib/auth/authz.server";
import { deleteBill, getContactsByIds } from "~/lib/db/queries.server";
import { audit } from "~/lib/audit.server";
import { flashCookie } from "~/lib/flash.server";

const fmtDate = (sec: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(sec * 1000));

export async function loader({ request, params }: Route.LoaderArgs) {
  const { contact } = requireUser(request);
  // A01: only a participant of this bill may read it (404 otherwise — no existence disclosure).
  const bill = requireBillParticipant(params.billId, contact.id);

  const contacts = getContactsByIds(bill.participants.map((p) => p.contactId));
  const rows = bill.participants.map((p) => {
    const c = contacts.get(p.contactId);
    return {
      contactId: p.contactId,
      name:
        p.contactId === contact.id
          ? "You"
          : (c?.displayName ?? c?.email ?? "Someone"),
      paidCents: p.paidCents,
      owedCents: p.owedCents,
    };
  });

  return {
    bill: {
      id: bill.id,
      title: bill.title,
      currency: bill.currency,
      amountCents: bill.amountCents,
      date: bill.date,
    },
    rows,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { contact } = requireUser(request);
  const form = await request.formData();
  if (form.get("intent") === "delete") {
    // A01: only a participant may delete a bill (404 otherwise, before any mutation).
    requireBillParticipant(params.billId, contact.id);
    deleteBill(params.billId);
    audit({ event: "bill.delete", request, actorContactId: contact.id, subjectId: params.billId });
    return redirect("/", { headers: { "Set-Cookie": flashCookie("success", "Bill deleted") } });
  }
  return null;
}

export default function BillDetail({ loaderData }: Route.ComponentProps) {
  const { bill, rows } = loaderData;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">{bill.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {fmtDate(bill.date)} · <Money cents={bill.amountCents} currency={bill.currency} /> total
        </p>
      </div>

      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {rows.map((r) => (
          <li key={r.contactId} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="font-medium">{r.name}</span>
            <div className="flex gap-6 text-right text-sm tabular-nums">
              <span>
                <span className="text-muted-foreground">paid </span>
                <Money cents={r.paidCents} currency={bill.currency} />
              </span>
              <span>
                <span className="text-muted-foreground">owes </span>
                <Money cents={r.owedCents} currency={bill.currency} />
              </span>
            </div>
          </li>
        ))}
      </ul>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
            <Trash2 className="size-4" /> Delete bill
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this bill?</DialogTitle>
            <DialogDescription>
              This removes “{bill.title}” for everyone and updates all balances. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <Button type="submit" variant="destructive">
                Delete
              </Button>
            </Form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
