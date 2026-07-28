/**
 * Canonical terminology keys (ADR-003).
 *
 * These identifiers are frozen. Code, database, APIs, and events use them
 * permanently; tenants override only the *display* strings.
 */
export const TERM_KEYS = [
  "organization",
  "academy",
  "learning_system",
  "learning_path",
  "course",
  "module",
  "lesson",
  "content_block",
  "assessment",
  "competency",
  "certificate",
  "credential",
  "enrollment",
  "cohort",
  "instructor",
  "learner",
  "author",
  "reviewer",
  "manager",
  "observer",
] as const;

export type TermKey = (typeof TERM_KEYS)[number];

export interface TermDisplay {
  singular: string;
  plural: string;
  /** Optional compact form for dense UI (chips, columns). */
  short?: string;
}

/** Platform default display terms (English). Owner decision D-05. */
export const PLATFORM_TERM_DEFAULTS: Record<TermKey, TermDisplay> = {
  organization: { singular: "Organization", plural: "Organizations" },
  academy: { singular: "Academy", plural: "Academies" },
  learning_system: { singular: "Learning System", plural: "Learning Systems" },
  learning_path: { singular: "Learning Path", plural: "Learning Paths" },
  course: { singular: "Course", plural: "Courses" },
  module: { singular: "Module", plural: "Modules" },
  lesson: { singular: "Lesson", plural: "Lessons" },
  content_block: { singular: "Content Block", plural: "Content Blocks" },
  assessment: { singular: "Assessment", plural: "Assessments" },
  competency: { singular: "Competency", plural: "Competencies" },
  certificate: { singular: "Certificate", plural: "Certificates" },
  credential: { singular: "Credential", plural: "Credentials" },
  enrollment: { singular: "Enrollment", plural: "Enrollments" },
  cohort: { singular: "Cohort", plural: "Cohorts" },
  instructor: { singular: "Instructor", plural: "Instructors" },
  learner: { singular: "Learner", plural: "Learners" },
  author: { singular: "Author", plural: "Authors" },
  reviewer: { singular: "Reviewer", plural: "Reviewers" },
  manager: { singular: "Manager", plural: "Managers" },
  observer: { singular: "Observer", plural: "Observers" },
};

export type TerminologyOverrides = Partial<Record<TermKey, TermDisplay>>;

/**
 * Pure terminology resolution: org override → platform default.
 * The runtime wraps this with per-org caching; the semantics live here.
 */
export function resolveTerm(
  key: TermKey,
  overrides: TerminologyOverrides,
): TermDisplay {
  return overrides[key] ?? PLATFORM_TERM_DEFAULTS[key];
}
