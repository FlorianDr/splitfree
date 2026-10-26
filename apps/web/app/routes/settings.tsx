import { Fingerprint, LogOut } from "lucide-react";
import { useState } from "react";
import { Form, redirect, useNavigation, useRevalidator } from "react-router";
import { toast } from "sonner";
import type { Route } from "./+types/settings";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { registerPasskey } from "~/lib/auth/passkey";
import { requireUser } from "~/lib/auth/session.server";
import { listCredentialsByUser, setContactDisplayName } from "~/lib/db/queries.server";
import { flashCookie } from "~/lib/flash.server";
import { pageMeta } from "~/lib/meta";
import { useActionErrorToast } from "~/lib/use-action-error-toast";

export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, { title: "Settings", path: "/settings" });
}

export async function loader({ request }: Route.LoaderArgs) {
  const { user, contact } = requireUser(request);
  return {
    email: contact.email,
    displayName: contact.displayName ?? "",
    passkeyCount: listCredentialsByUser(user.id).length,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { contact } = requireUser(request);
  const form = await request.formData();
  const displayName = String(form.get("displayName") ?? "").trim();
  if (displayName.length > 80) {
    return { error: "Display name is too long (max 80 characters)." };
  }
  // Empty clears it (falls back to the email everywhere).
  setContactDisplayName(contact.id, displayName || null);
  return redirect("/settings", {
    headers: { "Set-Cookie": flashCookie("success", "Settings saved") },
  });
}

export default function SettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  useActionErrorToast(actionData);
  const saving = navigation.state === "submitting";

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">Settings</h1>

      {/* Display name */}
      <section className="rounded-xl border bg-card p-5">
        <Form method="post" className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              name="displayName"
              defaultValue={loaderData.displayName}
              placeholder={loaderData.email}
              maxLength={80}
              autoComplete="name"
            />
            <p className="text-xs text-muted-foreground">
              Shown to everyone instead of your email. Leave blank to use{" "}
              <span className="font-medium">{loaderData.email}</span>.
            </p>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </Form>
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
