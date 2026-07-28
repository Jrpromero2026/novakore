import { z } from "zod";

/**
 * Versioned content-block schema registry (ADR-008).
 *
 * Prototype proving the pattern for the Phase 1B "core seven" strategy:
 * - discriminated unions, no unvalidated JSON
 * - per-(type, schemaVersion) schemas
 * - additive schema evolution with registered pure migration functions
 *
 * The full block catalog lands in Phase 1B; three representative types are
 * modeled here, including one with two schema versions and a migration.
 */

// ---------------------------------------------------------------------------
// Common envelope
// ---------------------------------------------------------------------------

export const BLOCK_TYPES = [
  "rich_text",
  "heading",
  "image",
  "callout",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

const blockBase = z.object({
  /** Stable identity across edits and versions. */
  id: z.uuid(),
  /** Fractional-index position key (ADR-014). */
  position: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Per-type data schemas
// ---------------------------------------------------------------------------

export const richTextDataV1 = z.object({
  /** Portable rich-text document (tiptap/prosemirror-style JSON, validated deeper in 1B). */
  doc: z.record(z.string(), z.unknown()),
});

export const headingDataV1 = z.object({
  text: z.string().min(1),
  /** h2/h3 only inside lessons — h1 is the lesson title; outline integrity is enforced at publish. */
  level: z.union([z.literal(2), z.literal(3)]),
});

export const imageDataV1 = z
  .object({
    assetId: z.uuid(),
    /** Accessibility contract: alt required unless explicitly decorative. */
    alt: z.string().min(1).optional(),
    decorative: z.boolean().default(false),
    caption: z.string().optional(),
  })
  .refine((d) => d.decorative || (d.alt !== undefined && d.alt.length > 0), {
    message: "image requires alt text unless marked decorative",
  });

/** v1: single tone string. */
export const calloutDataV1 = z.object({
  tone: z.enum(["info", "success", "warning"]),
  body: z.string().min(1),
});

/** v2 (additive evolution example): adds optional title, widens tones. */
export const calloutDataV2 = z.object({
  tone: z.enum(["info", "success", "warning", "danger", "note"]),
  title: z.string().optional(),
  body: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Discriminated union of current-version blocks (author-facing shape)
// ---------------------------------------------------------------------------

export const contentBlockSchema = z.discriminatedUnion("type", [
  blockBase.extend({
    type: z.literal("rich_text"),
    schemaVersion: z.literal(1),
    data: richTextDataV1,
  }),
  blockBase.extend({
    type: z.literal("heading"),
    schemaVersion: z.literal(1),
    data: headingDataV1,
  }),
  blockBase.extend({
    type: z.literal("image"),
    schemaVersion: z.literal(1),
    data: imageDataV1,
  }),
  blockBase.extend({
    type: z.literal("callout"),
    schemaVersion: z.literal(2),
    data: calloutDataV2,
  }),
]);

export type ContentBlock = z.infer<typeof contentBlockSchema>;

// ---------------------------------------------------------------------------
// Registry: (type, schemaVersion) → data schema, plus migrations
// ---------------------------------------------------------------------------

type RegistryKey = `${BlockType}:${number}`;

const dataSchemas: Record<RegistryKey, z.ZodType> = {
  "rich_text:1": richTextDataV1,
  "heading:1": headingDataV1,
  "image:1": imageDataV1,
  "callout:1": calloutDataV1,
  "callout:2": calloutDataV2,
};

/** Pure migration functions, registered per upgrade step. */
const migrations: Partial<Record<RegistryKey, (data: unknown) => unknown>> = {
  // callout v1 → v2: tones carry over; title absent.
  "callout:1": (data) => {
    const v1 = calloutDataV1.parse(data);
    return { tone: v1.tone, body: v1.body } satisfies z.infer<
      typeof calloutDataV2
    >;
  },
};

export const CURRENT_SCHEMA_VERSION: Record<BlockType, number> = {
  rich_text: 1,
  heading: 1,
  image: 1,
  callout: 2,
};

export function validateBlockData(
  type: BlockType,
  schemaVersion: number,
  data: unknown,
): { ok: true; data: unknown } | { ok: false; error: string } {
  const schema = dataSchemas[`${type}:${schemaVersion}`];
  if (!schema)
    return {
      ok: false,
      error: `unknown block schema ${type}:${schemaVersion}`,
    };
  const result = schema.safeParse(data);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, error: result.error.message };
}

/**
 * Migrate block data stepwise to the current schema version.
 * Used lazily on draft edit; published snapshots are never rewritten.
 */
export function migrateBlockData(
  type: BlockType,
  fromVersion: number,
  data: unknown,
): { schemaVersion: number; data: unknown } {
  let version = fromVersion;
  let current = data;
  const target = CURRENT_SCHEMA_VERSION[type];
  while (version < target) {
    const step = migrations[`${type}:${version}`];
    if (!step)
      throw new Error(`missing migration ${type}:${version} → ${version + 1}`);
    current = step(current);
    version += 1;
  }
  return { schemaVersion: version, data: current };
}
