"use client";

import { useEffect, useRef } from "react";
import { recordOnboardingEventAction } from "@/lib/actions/onboarding";

/**
 * Records one explicit onboarding event when a page is genuinely visited —
 * the ONLY completion path for steps that real domain data cannot prove
 * (learner preview, progress review). Server components render this
 * conditionally, only for members whose visit means something (e.g. the
 * learn surface marker renders only for draft-content viewers, so a real
 * learner's visit never completes an admin checklist step).
 *
 * Session-throttled to avoid noisy duplicates; the resolver only asks
 * "did this ever happen", so extra rows are harmless either way.
 */
export function OnboardingPageMarker({
  orgSlug,
  event,
}: {
  orgSlug: string;
  event: "onboarding.preview.opened" | "onboarding.progress.reviewed";
}) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const key = `nk-onboarding-marker:${orgSlug}:${event}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage unavailable — record anyway */
    }
    void recordOnboardingEventAction(orgSlug, { type: event }).catch(() => {});
  }, [event, orgSlug]);
  return null;
}
