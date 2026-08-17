"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Json } from "@novakore/database";
import { can, requireOrgContext } from "@/lib/org-context";
import { supabaseServer } from "@/lib/supabase/server";
import { dbErrorMessage, type ActionState } from "./types";

/**
 * Onboarding actions (docs/architecture/onboarding.md).
 *
 * Lifecycle writes (dismiss/restore/celebrate) require org.manage — RLS
 * enforces the same server-side, so the `can` check is an early, honest
 * error rather than the authorization boundary. Event writes are anchored
 * to the caller's own membership by RLS.
 */

const EVENT_TYPES = [
  "onboarding.checklist.viewed",
  "onboarding.checklist.expanded",
  "onboarding.checklist.dismissed",
  "onboarding.checklist.restored",
  "onboarding.checklist.completed",
  "onboarding.step.started",
  "onboarding.step.completed",
  "onboarding.step.skipped",
  "onboarding.walkthrough.started",
  "onboarding.walkthrough.exited",
  "onboarding.walkthrough.resumed",
  "onboarding.walkthrough.completed",
  "onboarding.walkthrough.target_missing",
  "onboarding.walkthrough.recovered",
  "onboarding.preview.opened",
  "onboarding.progress.reviewed",
] as const;

export type OnboardingEventType = (typeof EVENT_TYPES)[number];

const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  stepId: z.string().trim().min(1).max(60).optional(),
  walkthroughId: z.string().trim().min(1).max(60).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Record one onboarding event under the caller's own membership.
 * Never captures lesson content or personal data — payloads are small
 * operational context (step ids, walkthrough ids, viewport class).
 */
export async function recordOnboardingEventAction(
  orgSlug: string,
  input: unknown,
): Promise<ActionState> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid event." };
  const ctx = await requireOrgContext(orgSlug);
  const supabase = await supabaseServer();
  const { error } = await supabase.from("onboarding_events").insert({
    organization_id: ctx.organization.id,
    membership_id: ctx.membershipId,
    event_type: parsed.data.type,
    step_id: parsed.data.stepId ?? null,
    walkthrough_id: parsed.data.walkthroughId ?? null,
    data: (parsed.data.data ?? {}) as Json,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return { ok: true };
}

async function upsertLifecycle(
  orgSlug: string,
  patch: {
    dismissed_at?: string | null;
    completed_celebrated_at?: string | null;
  },
  eventType: OnboardingEventType,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.manage")) {
    return { ok: false, message: "You do not have permission to do that." };
  }
  const supabase = await supabaseServer();
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase.from("organization_onboarding").upsert(
    {
      organization_id: ctx.organization.id,
      ...patch,
      updated_by: user.user?.id ?? null,
    },
    { onConflict: "organization_id" },
  );
  if (error) return { ok: false, message: dbErrorMessage(error) };
  await supabase.from("onboarding_events").insert({
    organization_id: ctx.organization.id,
    membership_id: ctx.membershipId,
    event_type: eventType,
  });
  revalidatePath(`/${orgSlug}/admin`);
  return { ok: true };
}

/** Hide the checklist from primary prominence (reachable from Help). */
export async function dismissChecklistAction(
  orgSlug: string,
): Promise<ActionState> {
  return upsertLifecycle(
    orgSlug,
    { dismissed_at: new Date().toISOString() },
    "onboarding.checklist.dismissed",
  );
}

/** Bring the checklist back to the dashboard. */
export async function restoreChecklistAction(
  orgSlug: string,
): Promise<ActionState> {
  return upsertLifecycle(
    orgSlug,
    { dismissed_at: null },
    "onboarding.checklist.restored",
  );
}

/** Record that the completion celebration has been shown (once per org). */
export async function celebrateChecklistAction(
  orgSlug: string,
): Promise<ActionState> {
  return upsertLifecycle(
    orgSlug,
    { completed_celebrated_at: new Date().toISOString() },
    "onboarding.checklist.completed",
  );
}
