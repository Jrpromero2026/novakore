import { describe, expect, test } from "vitest";
import {
  applyVariables,
  checkTemplateVariables,
  contentTemplateInputSchema,
  extractVariables,
  missingRequired,
  templateVariablesSchema,
  type TemplateVariable,
} from "./content-templates";

const v = (key: string, required = true): TemplateVariable => ({
  key,
  label: key,
  required,
});

/** A cut-down SOP block set, shaped like the real ones. */
const SOP_BLOCKS = [
  { type: "heading", data: { text: "Emergency Action Plan", level: 2 } },
  {
    type: "rich_text",
    data: { text: "Send someone to {{aed_location}} for the AED." },
  },
  {
    type: "checklist",
    data: {
      items: [
        { id: "a1", label: "Call 911 and give {{club_address}}" },
        { id: "a2", label: "Meet EMS at {{ems_entrance}}" },
      ],
    },
  },
  { type: "callout", data: { text: "Owner: {{owner_role}}", tone: "warning" } },
];

describe("extractVariables", () => {
  test("finds placeholders anywhere in the structure, in document order", () => {
    expect(extractVariables(SOP_BLOCKS)).toEqual([
      "aed_location",
      "club_address",
      "ems_entrance",
      "owner_role",
    ]);
  });

  test("de-duplicates repeats but keeps first appearance", () => {
    const blocks = [
      { data: { text: "{{b}} then {{a}}" } },
      { data: { text: "{{a}} again" } },
    ];
    expect(extractVariables(blocks)).toEqual(["b", "a"]);
  });

  test("tolerates whitespace inside the braces", () => {
    expect(extractVariables({ text: "{{  spaced_key  }}" })).toEqual([
      "spaced_key",
    ]);
  });

  test("ignores things that only look like placeholders", () => {
    expect(
      extractVariables({
        a: "{single}",
        b: "{{Bad-Key}}",
        c: "{{9leading}}",
        d: "{{}}",
      }),
    ).toEqual([]);
  });

  test("is not confused by repeated calls (no shared regex state)", () => {
    // A module-level /g regex carries lastIndex between calls; this fails
    // loudly if the implementation ever reuses one.
    const input = { text: "{{one}} {{two}}" };
    expect(extractVariables(input)).toEqual(["one", "two"]);
    expect(extractVariables(input)).toEqual(["one", "two"]);
    expect(extractVariables(input)).toEqual(["one", "two"]);
  });

  test("returns nothing for content without placeholders", () => {
    expect(
      extractVariables({ type: "heading", data: { text: "Plain" } }),
    ).toEqual([]);
  });
});

describe("applyVariables", () => {
  test("substitutes throughout, preserving structure", () => {
    const { value, unresolved } = applyVariables(SOP_BLOCKS, {
      aed_location: "the north wall by reception",
      club_address: "1 Timberhill Way",
      ems_entrance: "the main doors",
      owner_role: "PT Manager",
    });
    expect(unresolved).toEqual([]);
    // Whole-structure comparison: proves substitution reached every nesting
    // level AND that nothing else moved.
    expect(value).toEqual([
      { type: "heading", data: { text: "Emergency Action Plan", level: 2 } },
      {
        type: "rich_text",
        data: {
          text: "Send someone to the north wall by reception for the AED.",
        },
      },
      {
        type: "checklist",
        data: {
          items: [
            { id: "a1", label: "Call 911 and give 1 Timberhill Way" },
            { id: "a2", label: "Meet EMS at the main doors" },
          ],
        },
      },
      {
        type: "callout",
        data: { text: "Owner: PT Manager", tone: "warning" },
      },
    ]);
  });

  test("leaves unsupplied placeholders visible rather than blanking them", () => {
    // The whole point: an empty sentence in a safety procedure is invisible;
    // a dangling {{placeholder}} is not.
    const { value, unresolved } = applyVariables(
      { text: "Call {{club_address}} now" },
      {},
    );
    expect(value).toEqual({ text: "Call {{club_address}} now" });
    expect(unresolved).toEqual(["club_address"]);
  });

  test("treats an empty string as unsupplied", () => {
    const { value, unresolved } = applyVariables({ text: "{{a}}" }, { a: "" });
    expect(value).toEqual({ text: "{{a}}" });
    expect(unresolved).toEqual(["a"]);
  });

  test("reports each unresolved key once", () => {
    const { unresolved } = applyVariables({ a: "{{x}} {{x}}", b: "{{x}}" }, {});
    expect(unresolved).toEqual(["x"]);
  });

  test("leaves non-strings untouched and never rewrites keys", () => {
    const { value } = applyVariables(
      { "{{key}}": "v", n: 42, ok: true, nothing: null, list: [1, "{{a}}"] },
      { key: "REPLACED", a: "A" },
    );
    // The key stays "{{key}}" — only values are substituted.
    expect(value).toEqual({
      "{{key}}": "v",
      n: 42,
      ok: true,
      nothing: null,
      list: [1, "A"],
    });
  });

  test("does not re-substitute a value that itself contains a placeholder", () => {
    // Otherwise a supplied value could inject another variable's content.
    const { value } = applyVariables(
      { text: "{{a}}" },
      { a: "{{b}}", b: "second pass" },
    );
    expect(value).toEqual({ text: "{{b}}" });
  });

  test("does not mutate the input", () => {
    const input = { text: "{{a}}", nested: { list: ["{{a}}"] } };
    applyVariables(input, { a: "X" });
    expect(input).toEqual({ text: "{{a}}", nested: { list: ["{{a}}"] } });
  });
});

describe("checkTemplateVariables", () => {
  test("flags a placeholder nothing would prompt for", () => {
    const result = checkTemplateVariables(SOP_BLOCKS, [
      v("aed_location"),
      v("club_address"),
    ]);
    expect(result.undeclared).toEqual(["ems_entrance", "owner_role"]);
    expect(result.unused).toEqual([]);
  });

  test("flags a declared variable the content never uses", () => {
    const result = checkTemplateVariables({ text: "{{a}}" }, [v("a"), v("b")]);
    expect(result.undeclared).toEqual([]);
    expect(result.unused).toEqual(["b"]);
  });

  test("clean when they match", () => {
    const declared = extractVariables(SOP_BLOCKS).map((k) => v(k));
    expect(checkTemplateVariables(SOP_BLOCKS, declared)).toEqual({
      undeclared: [],
      unused: [],
    });
  });
});

describe("missingRequired", () => {
  test("reports only required variables without a usable value", () => {
    expect(
      missingRequired([v("a"), v("b"), v("c", false)], { a: "set", c: "" }),
    ).toEqual(["b"]);
  });

  test("whitespace is not a value", () => {
    expect(missingRequired([v("a")], { a: "   " })).toEqual(["a"]);
  });

  test("nothing missing when all required are supplied", () => {
    expect(missingRequired([v("a"), v("b", false)], { a: "x" })).toEqual([]);
  });
});

describe("schemas", () => {
  test("rejects a duplicate variable key", () => {
    const result = templateVariablesSchema.safeParse([
      { key: "a", label: "A", required: true },
      { key: "a", label: "Again", required: true },
    ]);
    expect(result.success).toBe(false);
  });

  test("rejects a key that could never be written as a placeholder", () => {
    for (const key of ["Bad-Key", "9lead", "has space", ""]) {
      expect(
        templateVariablesSchema.safeParse([{ key, label: "x" }]).success,
        key,
      ).toBe(false);
    }
  });

  test("defaults a variable to required", () => {
    const parsed = templateVariablesSchema.parse([{ key: "a", label: "A" }]);
    expect(parsed).toEqual([{ key: "a", label: "A", required: true }]);
  });

  test("template input defaults to a procedure with no variables", () => {
    const parsed = contentTemplateInputSchema.parse({ title: "Safety SOP" });
    expect(parsed.category).toBe("procedure");
    expect(parsed.variables).toEqual([]);
  });

  test("rejects an untitled template", () => {
    expect(contentTemplateInputSchema.safeParse({ title: "x" }).success).toBe(
      false,
    );
  });
});
