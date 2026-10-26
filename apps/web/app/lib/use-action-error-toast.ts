import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Show an error toast whenever an action returns `{ error }`. React Router hands back a fresh
 * actionData object per submission, so the effect fires once per failed submit.
 */
export function useActionErrorToast(actionData: { error?: string } | undefined): void {
  useEffect(() => {
    if (actionData?.error) toast.error(actionData.error);
  }, [actionData]);
}
