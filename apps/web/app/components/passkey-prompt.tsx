import { Fingerprint } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { registerPasskey } from "~/lib/auth/passkey";

/**
 * First-login modal that nudges the user to register a passkey so they can skip the email code next
 * time. Shown when the URL carries `?passkey=setup` (the post-OTP redirect for users with no passkey
 * yet). Lives in the authed layout so it overlays whatever page they landed on.
 */
export function PasskeyPrompt() {
  const [searchParams, setSearchParams] = useSearchParams();
  const open = searchParams.get("passkey") === "setup";
  const [busy, setBusy] = useState(false);

  function close() {
    const next = new URLSearchParams(searchParams);
    next.delete("passkey");
    setSearchParams(next, { replace: true });
  }

  async function setup() {
    setBusy(true);
    const result = await registerPasskey();
    setBusy(false);
    if (result === "ok") {
      toast.success("Passkey added — you can use it to sign in next time.");
      close();
    } else if (result === "reauth") {
      toast.error("Please sign in again to add a passkey.");
    } else {
      toast.error("Couldn't set up the passkey. You can try again later.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 grid size-11 place-items-center rounded-full bg-secondary text-primary">
            <Fingerprint className="size-5" />
          </div>
          <DialogTitle className="font-display text-xl">Set up a passkey</DialogTitle>
          <DialogDescription>
            Skip the email code next time — sign in instantly with Face ID, Touch ID, or your device
            PIN. It's faster and more secure.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Maybe later
          </Button>
          <Button onClick={setup} disabled={busy}>
            {busy ? "Waiting for device…" : "Set up passkey"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
