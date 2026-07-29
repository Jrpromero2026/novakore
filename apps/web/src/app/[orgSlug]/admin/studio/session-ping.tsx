"use client";

import { useEffect, useRef } from "react";
import { recordStudioEventAction } from "@/lib/actions/studio";

/** One studio.session.opened event per page mount — never per keystroke. */
export function StudioSessionPing({
  orgSlug,
  organizationId,
}: {
  orgSlug: string;
  organizationId: string;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void recordStudioEventAction(
      orgSlug,
      "studio.session.opened",
      organizationId,
    );
  }, [orgSlug, organizationId]);
  return null;
}
