import "server-only";
import { supabaseServer } from "../supabase/server";
import { identityIsEmpty, parseOrgIdentity } from "../org-identity";
import type { OrgOnboardingSignals } from "../onboarding/steps";

/**
 * Onboarding signal gathering — every value is real, RLS-scoped
 * organization data read under the caller's session. Derived completion is
 * computed from these signals at render time; nothing here is stored.
 */

export interface OnboardingLifecycle {
  dismissedAt: string | null;
  completedCelebratedAt: string | null;
}

export interface OnboardingSnapshot {
  signals: OrgOnboardingSignals;
  lifecycle: OnboardingLifecycle;
}

export async function getOnboardingSnapshot(
  organizationId: string,
  membershipId: string,
): Promise<OnboardingSnapshot> {
  const supabase = await supabaseServer();
  const [
    settings,
    branding,
    paths,
    courses,
    publishedCourses,
    modules,
    lessons,
    publishedLessons,
    contentBlocks,
    others,
    previewEvents,
    progressEvents,
    lifecycleRow,
  ] = await Promise.all([
    supabase
      .from("organization_settings")
      .select("settings")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("organization_branding")
      .select("display_name, theme_draft, theme_published")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("learning_paths")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("status", "archived"),
    supabase
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("status", "archived"),
    supabase
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .not("current_published_version_id", "is", null),
    supabase
      .from("modules")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("archived_at", null),
    supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("archived_at", null),
    supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "published"),
    supabase
      .from("content_blocks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("id", membershipId)
      .in("status", ["invited", "active"]),
    supabase
      .from("onboarding_events")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("event_type", "onboarding.preview.opened")
      .limit(1),
    supabase
      .from("onboarding_events")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("event_type", "onboarding.progress.reviewed")
      .limit(1),
    supabase
      .from("organization_onboarding")
      .select("dismissed_at, completed_celebrated_at")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  const brandingRow = branding.data;
  return {
    signals: {
      identityConfigured: !identityIsEmpty(
        parseOrgIdentity(settings.data?.settings ?? null),
      ),
      brandingConfigured: Boolean(
        brandingRow &&
        (brandingRow.theme_draft !== null ||
          brandingRow.theme_published !== null ||
          brandingRow.display_name !== null),
      ),
      journeys: paths.count ?? 0,
      courses: courses.count ?? 0,
      modules: modules.count ?? 0,
      lessons: lessons.count ?? 0,
      lessonsWithContent: contentBlocks.count ?? 0,
      publishedCourses: publishedCourses.count ?? 0,
      publishedLessons: publishedLessons.count ?? 0,
      otherMembers: others.count ?? 0,
      previewOpened: (previewEvents.data ?? []).length > 0,
      progressReviewed: (progressEvents.data ?? []).length > 0,
    },
    lifecycle: {
      dismissedAt: lifecycleRow.data?.dismissed_at ?? null,
      completedCelebratedAt: lifecycleRow.data?.completed_celebrated_at ?? null,
    },
  };
}
