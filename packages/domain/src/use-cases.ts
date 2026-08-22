import type { TermKey, TermDisplay } from "./terminology";

/**
 * What an organization came here to do, and the starting point that suits it.
 *
 * NovaKore is learning infrastructure: the same primitives — versioned
 * content, assessment, sign-off, credentials — serve a certifying body, a gym
 * documenting its procedures, and a coach running client programs. What
 * differs between them is vocabulary and emphasis, not capability.
 *
 * So a use case is a STARTING POINT, never a mode. Two rules hold it there:
 *
 *   1. It sets defaults and removes nothing. Choosing "Coaching" still leaves
 *      credentials, assessments and version pinning fully available; they are
 *      simply not what the setup talks about first.
 *   2. Everything it sets is editable afterwards through the normal screens.
 *      Terminology lives at /admin/terminology whether it was seeded here or
 *      typed by hand, and nothing is written anywhere a customer cannot reach.
 *
 * That is also why the list is long rather than tight. When picking wrong
 * costs nothing, a fuller list is a better map of what the platform can do —
 * it doubles as documentation. A short list would only be right if the choice
 * locked something, and it must not.
 */

export interface UseCase {
  id: UseCaseId;
  label: string;
  /** One line, shown beside the label at signup. */
  description: string;
  /**
   * Vocabulary this kind of organization actually uses. Only the terms that
   * genuinely differ — leaving a term unset means the platform default is
   * already the right word, and overriding it for the sake of completeness
   * would just be noise in the terminology screen.
   */
  terminology: Partial<Record<TermKey, TermDisplay>>;
  /**
   * Checklist steps that do not apply to this way of working. They are hidden
   * from the setup checklist, NOT disabled — the underlying surfaces stay
   * reachable, because hiding a step is guidance and removing a capability
   * would break rule 1.
   */
  hideChecklistSteps: readonly string[];
}

export const USE_CASE_IDS = [
  "certification",
  "continuing_education",
  "customer_academy",
  "staff_onboarding",
  "compliance",
  "coaching",
  "partner_network",
  "school",
  "membership",
  "unspecified",
] as const;

export type UseCaseId = (typeof USE_CASE_IDS)[number];

export const USE_CASES: readonly UseCase[] = [
  {
    id: "certification",
    label: "Certifying professionals",
    description: "You are the authority behind the credential.",
    terminology: {
      course: {
        singular: "Certification Course",
        plural: "Certification Courses",
      },
      learner: { singular: "Candidate", plural: "Candidates" },
      credential: { singular: "Certification", plural: "Certifications" },
      assessment: { singular: "Examination", plural: "Examinations" },
    },
    hideChecklistSteps: [],
  },
  {
    id: "continuing_education",
    label: "Awarding continuing education",
    description: "Credit toward a licence or certification held elsewhere.",
    terminology: {
      course: { singular: "CEU Course", plural: "CEU Courses" },
      learner: { singular: "Participant", plural: "Participants" },
      credential: { singular: "CEU Credit", plural: "CEU Credits" },
      certificate: {
        singular: "Certificate of Completion",
        plural: "Certificates of Completion",
      },
    },
    hideChecklistSteps: [],
  },
  {
    id: "customer_academy",
    label: "Running a customer academy",
    description: "Programs for the people who buy from you.",
    terminology: {
      course: { singular: "Program", plural: "Programs" },
      learner: { singular: "Member", plural: "Members" },
    },
    hideChecklistSteps: [],
  },
  {
    id: "staff_onboarding",
    label: "Onboarding staff and documenting SOPs",
    description: "How your team does the work, and proof they were shown.",
    terminology: {
      course: { singular: "SOP", plural: "SOPs" },
      module: { singular: "Section", plural: "Sections" },
      lesson: { singular: "Procedure", plural: "Procedures" },
      learner: { singular: "Team member", plural: "Team members" },
      instructor: { singular: "Supervisor", plural: "Supervisors" },
      credential: { singular: "Sign-off", plural: "Sign-offs" },
    },
    // An internal SOP library is not an academy with a public front door.
    hideChecklistSteps: ["branding", "preview"],
  },
  {
    id: "compliance",
    label: "Compliance and safety training",
    description: "Mandatory, recurring, and auditable by someone outside.",
    terminology: {
      course: { singular: "Requirement", plural: "Requirements" },
      learner: { singular: "Employee", plural: "Employees" },
      credential: { singular: "Attestation", plural: "Attestations" },
      assessment: { singular: "Verification", plural: "Verifications" },
    },
    hideChecklistSteps: ["branding", "preview"],
  },
  {
    id: "coaching",
    label: "Coaching clients",
    description: "Individual journeys, tracked over time.",
    terminology: {
      course: { singular: "Program", plural: "Programs" },
      learning_path: { singular: "Journey", plural: "Journeys" },
      learner: { singular: "Client", plural: "Clients" },
      instructor: { singular: "Coach", plural: "Coaches" },
    },
    hideChecklistSteps: [],
  },
  {
    id: "partner_network",
    label: "Enabling partners, franchises or locations",
    description: "Other organizations delivering to your standard.",
    terminology: {
      course: { singular: "Playbook", plural: "Playbooks" },
      academy: { singular: "Location", plural: "Locations" },
      learner: { singular: "Partner", plural: "Partners" },
      credential: { singular: "Certified Site", plural: "Certified Sites" },
    },
    hideChecklistSteps: [],
  },
  {
    id: "school",
    label: "Schools and formal education",
    description: "Courses, cohorts and grading.",
    terminology: {
      learner: { singular: "Student", plural: "Students" },
      instructor: { singular: "Teacher", plural: "Teachers" },
      credential: {
        singular: "Transcript Record",
        plural: "Transcript Records",
      },
    },
    hideChecklistSteps: [],
  },
  {
    id: "membership",
    label: "Membership and association learning",
    description: "Education as a benefit of belonging.",
    terminology: {
      learner: { singular: "Member", plural: "Members" },
    },
    hideChecklistSteps: [],
  },
  {
    id: "unspecified",
    label: "Not sure yet — I'll set it up myself",
    description: "Platform defaults, nothing preset.",
    terminology: {},
    hideChecklistSteps: [],
  },
];

export function findUseCase(id: string | null | undefined): UseCase | null {
  if (!id) return null;
  return USE_CASES.find((u) => u.id === id) ?? null;
}

/**
 * The terminology rows to seed for a new organization.
 *
 * Empty for an unrecognised or absent use case, which is the same outcome as
 * "Not sure yet": the platform vocabulary already applies, and writing rows
 * that merely restate it would fill the terminology screen with entries a
 * customer then has to read past to find their own.
 */
export function seedTerminologyFor(
  useCaseId: string | null | undefined,
): { termKey: TermKey; singular: string; plural: string }[] {
  const useCase = findUseCase(useCaseId);
  if (!useCase) return [];
  return Object.entries(useCase.terminology).map(([termKey, display]) => ({
    termKey: termKey as TermKey,
    singular: display.singular,
    plural: display.plural,
  }));
}

/** Whether a checklist step should appear for this use case. */
export function checklistStepApplies(
  useCaseId: string | null | undefined,
  stepId: string,
): boolean {
  const useCase = findUseCase(useCaseId);
  if (!useCase) return true;
  return !useCase.hideChecklistSteps.includes(stepId);
}
