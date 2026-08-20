import { TOUR_TARGETS, type TourTargetId } from "@/lib/onboarding/targets";
import type { DomainKey } from "./domains";

/**
 * The walkthrough identifier for a domain link.
 *
 * A lookup rather than a template string so the mapping is total and
 * type-checked: adding a seventh domain without giving it a tour id becomes
 * a compile error instead of a tour that silently cannot find its anchor —
 * which is precisely how eight steps broke when the sidebar was replaced.
 */
const BY_KEY: Record<DomainKey, TourTargetId> = {
  home: TOUR_TARGETS.navDomainHome,
  knowledge: TOUR_TARGETS.navDomainKnowledge,
  learning: TOUR_TARGETS.navDomainLearning,
  people: TOUR_TARGETS.navDomainPeople,
  intelligence: TOUR_TARGETS.navDomainIntelligence,
  workspace: TOUR_TARGETS.navDomainWorkspace,
};

export function domainTourId(key: DomainKey): TourTargetId {
  return BY_KEY[key];
}
