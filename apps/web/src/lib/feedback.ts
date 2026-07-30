/**
 * Internal-alpha feedback + tester-cohort constants. Plain module (no
 * server-only) so the client widget and server code share one source.
 */

export const FEEDBACK_CATEGORIES = [
  { value: "bug", label: "Bug report" },
  { value: "usability", label: "Usability issue" },
  { value: "confusion", label: "Confusion" },
  { value: "suggestion", label: "Suggestion" },
  { value: "feature", label: "Feature request" },
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]["value"];

export const FEEDBACK_SEVERITIES = [
  "blocker",
  "major",
  "minor",
  "cosmetic",
] as const;
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

export const FEEDBACK_STATUSES = [
  "new",
  "triaged",
  "in_progress",
  "resolved",
  "archived",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const TESTER_LABELS = [
  { value: "internal_alpha", label: "Internal Alpha" },
  { value: "founder", label: "Founder" },
  { value: "coach", label: "Coach" },
  { value: "staff", label: "Staff" },
] as const;
export type TesterLabel = (typeof TESTER_LABELS)[number]["value"];

export const FEEDBACK_CATEGORY_VALUES = FEEDBACK_CATEGORIES.map((c) => c.value);
export const TESTER_LABEL_VALUES = TESTER_LABELS.map((l) => l.value);

export function feedbackCategoryLabel(value: string): string {
  return FEEDBACK_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
export function testerLabelText(value: string): string {
  return TESTER_LABELS.find((l) => l.value === value)?.label ?? value;
}
