import { Fingerprint, LogOut } from "lucide-react";
import { useState } from "react";
import { Form, redirect, useNavigation, useRevalidator } from "react-router";
import { toast } from "sonner";
import type { Route } from "./+types/settings";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { audit } from "~/lib/audit.server";
import { registerPasskey } from "~/lib/auth/passkey";
import { requireUser } from "~/lib/auth/session.server";
import { getPaymentDetails, listCredentialsByUser, setContactProfile } from "~/lib/db/queries.server";
import { flashCookie } from "~/lib/flash.server";
import { formatIban, validateAccountHolder, validateIban } from "~/lib/iban";
import { pageMeta } from "~/lib/meta";
import { parseWeroLink } from "~/lib/wero";

export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, { title: "Settings", path: "/settings" });
}

export async function loader({ request }: Route.LoaderArgs) {
  const { user, contact } = requireUser(request);
  const { iban, weroLink } = getPaymentDetails(contact.id);
  return {
    email: contact.email,
    displayName: contact.displayName ?? "",
    iban: iban ? formatIban(iban) : "",
    wero: weroLink ?? "",
    passkeyCount: listCredentialsByUser(user.id).length,
  };
}

const DISPLAY_NAME_MAX = 80;

export async function action({ request }: Route.ActionArgs) {
  const { contact } = requireUser(request);
  const form = await request.formData();
  const saved = getPaymentDetails(contact.id);
  let displayName: string | null = String(form.get("displayName") ?? "").trim() || null;
  // A post without a field keeps what's stored; an empty field clears it.
  const ibanInput = form.has("iban") ? String(form.get("iban")) : (saved.iban ?? "");
  const weroInput = form.has("wero") ? String(form.get("wero")) : (saved.weroLink ?? "");
  const errors: { displayName?: string; iban?: string; wero?: string } = {};

  let iban: string | null = null;
  if (ibanInput.trim() !== "") {
    const checked = validateIban(ibanInput);
    if (checked.ok) iban = checked.iban;
    else errors.iban = checked.error;
  }
  let weroLink: string | null = null;
  if (weroInput.trim() !== "") {
    const checked = parseWeroLink(weroInput);
    if (checked.ok) weroLink = checked.link;
    else errors.wero = checked.error;
  }
  if (displayName && displayName.length > DISPLAY_NAME_MAX) {
    errors.displayName = `Display name is too long (max ${DISPLAY_NAME_MAX} characters).`;
  } else if (ibanInput.trim() !== "") {
    // With an IBAN the display name is the account holder name, so it must fit a bank transfer.
    const holder = validateAccountHolder(displayName ?? "");
    if (holder.ok) displayName = holder.name;
    else errors.displayName = holder.error;
  }
  if (errors.displayName || errors.iban || errors.wero) return { errors };

  // Empty name falls back to the email everywhere.
  setContactProfile(contact.id, displayName, { iban, weroLink });
  if (iban !== saved.iban) {
    // Never the full IBAN in the log: enough to spot a swapped account, not to pay it.
    audit({
      event: iban ? "iban.update" : "iban.remove",
      request,
      actorContactId: contact.id,
      subjectId: contact.id,
      detail: iban ? { country: iban.slice(0, 2), last4: iban.slice(-4) } : null,
    });
  }
  if (weroLink !== saved.weroLink) {
    audit({
      event: weroLink ? "wero.update" : "wero.remove",
      request,
      actorContactId: contact.id,
      subjectId: contact.id,
    });
  }
  return redirect("/settings", {
    headers: { "Set-Cookie": flashCookie("success", "Settings saved") },
  });
}

export default function SettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const saving = navigation.state === "submitting";

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">Settings</h1>

      {/* Display name + payment details. Keyed on what's stored, so a save resets the fields to it. */}
      <section className="rounded-xl border bg-card p-5">
        <ProfileForm
          key={`${loaderData.displayName}|${loaderData.iban}|${loaderData.wero}`}
          email={loaderData.email}
          displayName={loaderData.displayName}
          savedIban={loaderData.iban}
          savedWero={loaderData.wero}
          errors={actionData?.errors}
          saving={saving}
        />
      </section>

      {/* Passkey */}
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <div>
          <h2 className="font-medium">Passkey</h2>
          <p className="text-sm text-muted-foreground">
            {loaderData.passkeyCount > 0
              ? `${loaderData.passkeyCount} passkey${
                  loaderData.passkeyCount === 1 ? "" : "s"
                } registered — sign in instantly with Face ID, Touch ID, or your device PIN.`
              : "Add a passkey to sign in without an email code."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={passkeyBusy}
          onClick={async () => {
            setPasskeyBusy(true);
            const result = await registerPasskey();
            setPasskeyBusy(false);
            if (result === "ok") {
              toast.success("Passkey added");
              revalidator.revalidate();
            } else if (result === "reauth") {
              toast.error("For your security, please sign in again to add a passkey.");
            } else {
              toast.error("Couldn't set up the passkey. You can try again later.");
            }
          }}
        >
          <Fingerprint className="size-4" />
          {passkeyBusy ? "Waiting for device…" : "Add a passkey"}
        </Button>
      </section>

      {/* Sign out */}
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <div>
          <h2 className="font-medium">Sign out</h2>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium">{loaderData.email}</span>.
          </p>
        </div>
        <Form method="post" action="/logout">
          <Button type="submit" variant="destructive" size="lg" className="w-full sm:w-auto">
            <LogOut className="size-4" /> Log out
          </Button>
        </Form>
      </section>
    </div>
  );
}

function Hint({ id, error, children }: { id: string; error?: string; children: React.ReactNode }) {
  return (
    <p id={id} className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
      {error ?? children}
    </p>
  );
}

function ProfileForm({
  email,
  displayName,
  savedIban,
  savedWero,
  errors,
  saving,
}: {
  email: string;
  displayName: string;
  savedIban: string;
  savedWero: string;
  errors: { displayName?: string; iban?: string; wero?: string } | undefined;
  saving: boolean;
}) {
  const [iban, setIban] = useState(savedIban);
  const [ibanTouched, setIbanTouched] = useState(false);
  // Check as you go once the field has been left, so a half-typed IBAN isn't flagged mid-typing.
  const ibanCheck = validateIban(iban);
  const ibanError =
    ibanTouched && iban.trim() !== "" && !ibanCheck.ok ? ibanCheck.error : errors?.iban;

  return (
    <Form method="post" className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          placeholder={email}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="name"
          aria-invalid={errors?.displayName ? true : undefined}
          aria-describedby="displayName-hint"
        />
        <div id="displayName-hint" className="space-y-1">
          <Hint id="displayName-error" error={errors?.displayName}>
            Shown to everyone instead of your email. Leave blank to use{" "}
            <span className="font-medium">{email}</span>.
          </Hint>
          <p className="text-xs text-muted-foreground">
            If you add an IBAN, use the name on your bank account: banks check it and warn the payer
            if it doesn't match.
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="iban">IBAN (optional)</Label>
        <Input
          id="iban"
          name="iban"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          onBlur={() => {
            setIbanTouched(true);
            if (ibanCheck.ok) setIban(formatIban(ibanCheck.iban));
          }}
          placeholder="DE89 3704 0044 0532 0130 00"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="font-mono"
          aria-invalid={ibanError ? true : undefined}
          aria-describedby="iban-hint"
        />
        <Hint id="iban-hint" error={ibanError}>
          So the people you split with can pay you back. Shown only to them. SEPA countries only.
        </Hint>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wero">Wero link (optional)</Label>
        <Input
          id="wero"
          name="wero"
          defaultValue={savedWero}
          placeholder="https://share.wero-wallet.eu/p/1/c/…"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={errors?.wero ? true : undefined}
          aria-describedby="wero-hint"
        />
        <Hint id="wero-hint" error={errors?.wero}>
          In your banking app's Wero section, create a payment request link without an amount and paste
          it here. People who owe you get a button that opens it, and enter the amount themselves.
        </Hint>
      </div>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </Form>
  );
}
