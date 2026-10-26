import { Fingerprint } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import type { Route } from "./+types/passkey-setup";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { requireUser } from "~/lib/auth/session.server";
import { registerPasskey } from "~/lib/auth/passkey";
import { pageMeta } from "~/lib/meta";

export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, { title: "Set up a passkey", path: "/passkey-setup" });
}

export async function loader({ request }: Route.LoaderArgs) {
  requireUser(request);
  return null;
}

export default function PasskeySetup(_: Route.ComponentProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="mb-1 grid size-11 place-items-center rounded-full bg-secondary text-primary">
          <Fingerprint className="size-5" />
        </div>
        <CardTitle className="font-display text-2xl">Add a passkey</CardTitle>
        <CardDescription>
          Skip the email code next time — sign in with Face ID, Touch ID, or your device PIN.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          type="button"
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await registerPasskey();
            setBusy(false);
            if (result === "ok") {
              toast.success("Passkey added");
              navigate("/");
            } else if (result === "reauth") {
              toast.error("Please sign in again to add a passkey.");
            } else {
              toast.error("Couldn't set up the passkey. You can try again later.");
            }
          }}
        >
          {busy ? "Waiting for device…" : "Set up passkey"}
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link to="/">Maybe later</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
