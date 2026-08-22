import type { TermKey, TermDisplay } from "./terminology";

/**
 * What an organization came here to do, and the starting point that suits it.
 *
 * NovaKore is one multi-tenant platform built from shared primitives. The same
 * versioned content, assessment, sign-off and credential machinery serves a
 * certifying body, a gym documenting its procedures, and a coach running client
 * programs. What differs between them is vocabulary and emphasis.
 *
 * A use case is CONFIGURATION AND EMPHASIS — not a product edition, a feature
 * gate, a permission tier, or a separate application. Two rules hold it there:
 *
 *   1. A use case may change defaults, terminology, navigation emphasis,
 *      guidance, templates and recommended workflows. It may NOT make an
 *      underlying platform capability unavailable. Visibility and emphasis are
 *      allowed to change; capability availability is not.
 *
 *   2. Everything a use case sets is editable afterwards through the normal
 *      customer UI. Seeded vocabulary lands in the ordinary terminology table
 *      and is edited on the ordinary terminology screen.
 *
 * TERMINOLOGY PRINCIPLE
 *
 * Only override a platform term when the use case gives high confidence that
 * the domain uses a meaningfully better word. No override is preferable to a
 * speculative one. The terminology system exists to make NovaKore feel native
 * to a customer's domain, not to demonstrate how many labels it can change —
 * so most use cases override three or four terms, and several override one.
 *
 * A term is also never overridden with the platform's own default. Seeding a
 * row that says "a Course is called a Course" only adds an entry the customer
 * must read past to find their own.
 *
 * ORDER
 *
 * This array is the order the choices appear at signup, most common first.
 * `signupLabel` is the action-oriented wording shown there; `label` is the
 * canonical name used in documentation and operator surfaces.
 */

export interface UseCase {
  id: UseCaseId;
  /** Canonical name, for documentation and operator surfaces. */
  label: string;
  /** Action-oriented wording shown at signup: "what are you here to do?" */
  signupLabel: string;
  /** One line, shown beside the label at signup. */
  description: string;
  /**
   * Vocabulary this kind of organization actually uses. Only terms that
   * genuinely differ from the platform default, and only where the domain
   * word is clearly better.
   */
  terminology: Partial<Record<TermKey, TermDisplay>>;
  /**
   * Setup-checklist steps that do not apply to this way of working. Hidden
   * from the checklist as GUIDANCE — the underlying surfaces stay fully
   * reachable, because hiding advice is emphasis and removing a capability
   * would break rule 1.
   */
  hideChecklistSteps: readonly string[];
}

export const USE_CASE_IDS = [
  "staff_onboarding",
  "professional_development",
  "qualification",
  "compliance",
  "continuing_education",
  "certification",
  "coaching",
  "customer_academy",
  "partner_network",
  "school",
  "membership",
  "unspecified",
] as const;

export type UseCaseId = (typeof USE_CASE_IDS)[number];

export const USE_CASES: readonly UseCase[] = [
  {
    id: "staff_onboarding",
    label: "Onboarding staff and documenting SOPs",
    signupLabel: "Train or onboard my team",
    description: "How your team does the work, and proof they were shown.",
    terminology: {
      course: { singular: "SOP", plural: "SOPs" },
      module: { singular: "Section", plural: "Sections" },
      lesson: { singular: "Procedure", plural: "Procedures" },
      learner: { singular: "Team Member", plural: "Team Members" },
      instructor: { singular: "Trainer", plural: "Trainers" },
      credential: { singular: "Sign-off", plural: "Sign-offs" },
    },
    // An internal SOP library has no public front door, so branding an academy
    // and previewing it as a learner is noise rather than guidance. Both
    // surfaces remain fully reachable.
    hideChecklistSteps: ["branding", "preview"],
  },
  {
    id: "professional_development",
    label: "Developing people",
    signupLabel: "Develop my people",
    description:
      "Structured growth, leadership and upskilling — without formal credit.",
    terminology: {
      course: {
        singular: "Development Program",
        plural: "Development Programs",
      },
      learning_path: {
        singular: "Development Path",
        plural: "Development Paths",
      },
      learner: { singular: "Participant", plural: "Participants" },
      credential: {
        singular: "Completion Record",
        plural: "Completion Records",
      },
    },
    hideChecklistSteps: [],
  },
  {
    id: "qualification",
    label: "Competency and qualification management",
    signupLabel: "Qualify people to a standard",
    description:
      "Prove someone can perform work to a defined standard, with named sign-off.",
    terminology: {
      course: { singular: "Qualification", plural: "Qualifications" },
      learning_path: {
        singular: "Qualification Path",
        plural: "Qualification Paths",
      },
      learner: { singular: "Trainee", plural: "Trainees" },
      assessment: {
        singular: "Competency Assessment",
        plural: "Competency Assessments",
      },
      credential: { singular: "Qualification", plural: "Qualifications" },
      instructor: { singular: "Assessor", plural: "Assessors" },
    },
    hideChecklistSteps: [],
  },
  {
    id: "compliance",
    label: "Compliance and safety training",
    signupLabel: "Deliver compliance or safety training",
    description: "Mandatory, recurring, and auditable by someone outside.",
    terminology: {
      course: {
        singular: "Training Requirement",
        plural: "Training Requirements",
      },
      learner: { singular: "Employee", plural: "Employees" },
      credential: { singular: "Training Record", plural: "Training Records" },
      assessment: {
        singular: "Competency Verification",
        plural: "Competency Verifications",
      },
    },
    hideChecklistSteps: ["branding", "preview"],
  },
  {
    id: "continuing_education",
    label: "Awarding continuing education",
    signupLabel: "Award continuing education",
    description: "Credit toward a licence or certification held elsewhere.",
    terminology: {
      course: {
        singular: "Continuing Education Course",
        plural: "Continuing Education Courses",
      },
      learner: { singular: "Participant", plural: "Participants" },
      credential: {
        singular: "Certificate of Completion",
        plural: "Certificates of Completion",
      },
      certificate: {
        singular: "Certificate of Completion",
        plural: "Certificates of Completion",
      },
    },
    hideChecklistSteps: [],
  },
  {
    id: "certification",
    label: "Certifying professionals",
    signupLabel: "Run a certification program",
    description: "You are the authority behind the credential.",
    terminology: {
      course: {
        singular: "Certification Program",
        plural: "Certification Programs",
      },
      learner: { singular: "Candidate", plural: "Candidates" },
      credential: { singular: "Certification", plural: "Certifications" },
      // `assessment` is deliberately NOT overridden. A certifying body may
      // call one particular assessment an examination, but that is an
      // organization's own later choice — the use-case default stays broader,
      // and overriding a term with the platform's own word seeds noise.
    },
    hideChecklistSteps: [],
  },
  {
    id: "coaching",
    label: "Coaching clients",
    signupLabel: "Coach clients",
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
    id: "customer_academy",
    label: "Running a customer academy",
    signupLabel: "Educate customers",
    description: "Programs for the people who buy from you.",
    terminology: {
      course: { singular: "Program", plural: "Programs" },
      // `learner` stays at the platform default. A customer academy may serve
      // customers, users, members or purchasers, and guessing "Member" for all
      // of them is exactly the speculative override the principle forbids. An
      // organization that wants Member sets it themselves.
    },
    hideChecklistSteps: [],
  },
  {
    id: "partner_network",
    label: "Enabling partners, franchises or locations",
    signupLabel: "Train partners or locations",
    description: "Other organizations delivering to your standard.",
    terminology: {
      course: { singular: "Playbook", plural: "Playbooks" },
      academy: { singular: "Partner Academy", plural: "Partner Academies" },
      learner: { singular: "Partner", plural: "Partners" },
      // Not "Certified Site": partner enablement may qualify a person, an
      // organization, a franchise, a location or a role. If first-class
      // organization credentials arrive later, a site certification becomes a
      // credential TYPE rather than the vocabulary for all of them.
      credential: { singular: "Qualification", plural: "Qualifications" },
    },
    hideChecklistSteps: [],
  },
  {
    id: "school",
    label: "Schools and formal education",
    signupLabel: "Teach students",
    description: "Courses, cohorts and grading.",
    terminology: {
      learner: { singular: "Student", plural: "Students" },
      // `credential` stays at the platform default. A transcript is an
      // academic record containing outcomes, not a synonym for one credential,
      // and inventing a replacement merely to fill the map is the speculative
      // override the principle forbids. `instructor` is already "Instructor".
    },
    hideChecklistSteps: [],
  },
  {
    id: "membership",
    label: "Membership and association learning",
    signupLabel: "Educate members",
    description: "Education as a benefit of belonging.",
    terminology: {
      learner: { singular: "Member", plural: "Members" },
    },
    hideChecklistSteps: [],
  },
  {
    id: "unspecified",
    label: "Not sure yet",
    signupLabel: "Something else",
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
 * The terminology rows to seed for a NEW organization.
 *
 * Empty for an unrecognised or absent use case, which is the same outcome as
 * "Not sure yet": the platform vocabulary already applies.
 *
 * Only ever called at organization creation. Existing organizations are never
 * re-seeded, because nothing in organization_terminology distinguishes a
 * seeded default from a word the customer typed, and overwriting the second
 * kind is unrecoverable.
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

/**
 * Whether a setup-checklist step should be OFFERED for this use case.
 *
 * Guidance only. A false result hides advice; it never affects whether the
 * underlying surface can be reached or what the caller is permitted to do.
 */
export function checklistStepApplies(
  useCaseId: string | null | undefined,
  stepId: string,
): boolean {
  const useCase = findUseCase(useCaseId);
  if (!useCase) return true;
  return !useCase.hideChecklistSteps.includes(stepId);
}
