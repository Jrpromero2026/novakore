import { z } from "zod";

/**
 * Content templates — a reusable *shape* rather than a reusable paragraph.
 *
 * The existing library (`reusable_blocks`) stores one block at a time, which
 * is the wrong unit for anything with structure. A standard operating
 * procedure is a shape: a code, a purpose, ordered steps, a boundaries
 * block, an owner and a review date. Authoring that shape twenty-nine times
 * by hand is the problem this replaces.
 *
 * A template is therefore an ordered set of blocks plus the variables those
 * blocks leave open. Instantiating one asks for the values and produces
 * ordinary lesson content — nothing downstream needs to know a template was
 * involved.
 *
 * Scope is deliberately one organization. Templates do not travel between
 * tenants; that is a larger question (publisher identity, versioning,
 * withdrawal) which this does not prejudge.
 */

/** `{{snake_case}}` — the only placeholder form. */
export const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

/** A single key on its own, for validating a declared variable name. */
const VARIABLE_KEY = /^[a-z][a-z0-9_]*$/;

export const templateVariableSchema = z.object({
  /** Referenced in block text as `{{key}}`. */
  key: z
    .string()
    .regex(
      VARIABLE_KEY,
      "Use lowercase letters, numbers and underscores, starting with a letter.",
    ),
  /** Shown on the form when someone instantiates the template. */
  label: z.string().min(1).max(80),
  /** Optional guidance — where to find the answer, or an example. */
  help: z.string().max(240).optional(),
  /** Blocking on instantiate. Optional variables may resolve to "". */
  required: z.boolean().default(true),
});

export type TemplateVariable = z.infer<typeof templateVariableSchema>;

export const templateVariablesSchema = z
  .array(templateVariableSchema)
  .max(40)
  .superRefine((vars, ctx) => {
    const seen = new Set<string>();
    for (const [i, v] of vars.entries()) {
      if (seen.has(v.key)) {
        ctx.addIssue({
          code: "custom",
          path: [i, "key"],
          message: `Duplicate variable "${v.key}".`,
        });
      }
      seen.add(v.key);
    }
  });

/**
 * Every variable referenced anywhere in `value`, in first-appearance order.
 *
 * Order matters: the instantiation form is built from this, and a form whose
 * fields follow the document reads far better than an alphabetical one.
 */
export function extractVariables(value: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      // A fresh regex per call: the shared one is /g and carries lastIndex.
      for (const m of node.matchAll(new RegExp(TEMPLATE_VARIABLE_PATTERN))) {
        const key = m[1];
        // The pattern always has group 1, but the type is optional.
        if (key === undefined) continue;
        if (!seen.has(key)) {
          seen.add(key);
          found.push(key);
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const v of Object.values(node as Record<string, unknown>)) walk(v);
    }
  };

  walk(value);
  return found;
}

export interface TemplateCheck {
  /** Referenced in the blocks but never declared — nothing would prompt for it. */
  undeclared: string[];
  /** Declared but never referenced — a form field that changes nothing. */
  unused: string[];
}

/**
 * Compare what the blocks reference against what the template declares.
 *
 * `undeclared` is an error: instantiating would leave a raw `{{placeholder}}`
 * in published content with no form field to fill it. `unused` is only a
 * warning — harmless, but usually a rename that was half-finished.
 */
export function checkTemplateVariables(
  blocks: unknown,
  declared: readonly TemplateVariable[],
): TemplateCheck {
  const used = extractVariables(blocks);
  const declaredKeys = new Set(declared.map((v) => v.key));
  const usedKeys = new Set(used);
  return {
    undeclared: used.filter((k) => !declaredKeys.has(k)),
    unused: declared.map((v) => v.key).filter((k) => !usedKeys.has(k)),
  };
}

export interface ApplyResult<T> {
  value: T;
  /** Placeholders left standing because no value was supplied. */
  unresolved: string[];
}

/**
 * Substitute `{{key}}` throughout, returning the filled structure.
 *
 * Unsupplied placeholders are LEFT IN PLACE rather than blanked. A visible
 * `{{aed_location}}` in a draft is a defect anyone can spot; a silently empty
 * sentence in a safety procedure is one nobody spots. The caller decides
 * whether unresolved placeholders block publishing — `unresolved` reports
 * every one.
 *
 * Substitution applies to strings only; numbers, booleans and nulls pass
 * through untouched, and object keys are never rewritten.
 */
export function applyVariables<T>(
  value: T,
  values: Readonly<Record<string, string>>,
): ApplyResult<T> {
  const unresolved: string[] = [];
  const seenUnresolved = new Set<string>();

  const substitute = (text: string): string =>
    text.replace(
      new RegExp(TEMPLATE_VARIABLE_PATTERN),
      (match, key: string) => {
        const supplied = values[key];
        if (supplied === undefined || supplied === "") {
          if (!seenUnresolved.has(key)) {
            seenUnresolved.add(key);
            unresolved.push(key);
          }
          return match;
        }
        return supplied;
      },
    );

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return substitute(node);
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };

  return { value: walk(value) as T, unresolved };
}

/**
 * Which required variables have no usable value yet.
 *
 * Separate from `applyVariables` on purpose: the form needs to know what is
 * missing BEFORE substituting anything, so it can block and highlight rather
 * than produce half-filled content and explain afterwards.
 */
export function missingRequired(
  declared: readonly TemplateVariable[],
  values: Readonly<Record<string, string>>,
): string[] {
  return declared
    .filter((v) => v.required && !(values[v.key] ?? "").trim())
    .map((v) => v.key);
}

export const templateCategorySchema = z.enum([
  "procedure",
  "onboarding",
  "lesson",
  "assessment_prep",
  "other",
]);

export type TemplateCategory = z.infer<typeof templateCategorySchema>;

export const contentTemplateInputSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(400).optional(),
  category: templateCategorySchema.default("procedure"),
  variables: templateVariablesSchema.default([]),
});

export type ContentTemplateInput = z.infer<typeof contentTemplateInputSchema>;
