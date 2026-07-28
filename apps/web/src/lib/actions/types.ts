/** Result shape for form-bound server actions (useActionState). */
export interface ActionState {
  ok: boolean;
  message?: string;
  /** Field-level validation errors keyed by input name. */
  errors?: Record<string, string>;
  /** Non-blocking advisories (e.g. accent contrast). */
  warnings?: string[];
  /** Optional structured payload for callers that must sync client state. */
  data?: unknown;
}

export const idle: ActionState = { ok: false };

export function fieldErrors(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): ActionState {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors, message: "Please fix the highlighted fields." };
}

/** Map common Postgres error codes to human messages without leaking internals. */
export function dbErrorMessage(error: {
  code?: string;
  message?: string;
}): string {
  switch (error.code) {
    case "23505":
      return "That value is already in use.";
    case "23514":
      return error.message?.includes("reserved")
        ? "That slug is reserved. Choose another."
        : "The value was rejected by a data rule.";
    case "42501":
      return "You do not have permission to do that.";
    default:
      return "Something went wrong. Nothing was saved.";
  }
}
