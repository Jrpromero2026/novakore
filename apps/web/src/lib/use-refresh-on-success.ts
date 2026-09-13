"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/actions/types";

/**
 * Refetch the current route after a successful action.
 *
 * Paginated pages cannot be re-rendered inside a server action's response:
 * the pinned Next version never resolves the page's `searchParams` promise
 * in that context, so the response stream hangs forever and the form stays
 * pending (docs/development/known-framework-defects.md). Actions submitted
 * from those pages therefore return plain state, and this hook refreshes
 * via a normal GET — which streams correctly.
 */
export function useRefreshOnSuccess(state: ActionState): void {
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
}
