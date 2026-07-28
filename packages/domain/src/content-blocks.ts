import { z } from "zod";

/**
 * Versioned content-block schema registry (ADR-008) — Phase 1C block set.
 *
 * Pre-persistence revision note: the Phase 1B registry was a representative
 * prototype; no block data had been persisted anywhere, so `rich_text` was
 * redefined (not version-bumped) into the bounded safe-text format below
 * before first real use. From this phase on, every change is an additive
 * schemaVersion with a registered migration.
 *
 * Safety rules (enforced here and re-enforced at render):
 * - No arbitrary HTML, scripts, CSS, iframes, or executable content — text
 *   is stored as plain text with a minimal inline markup subset rendered
 *   through React escaping (never dangerouslySetInnerHTML).
 * - External URLs must be https; media prefers `media_assets` references.
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export const BLOCK_TYPES = [
  "rich_text",
  "heading",
  "callout",
  "divider",
  "image",
  "video",
  "file_link",
  "checklist",
  "assessment_reference",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

const blockBase = z.object({
  /** Stable identity across edits and versions. */
  id: z.uuid(),
  /** Fractional-index position key (ADR-014). */
  position: z.string().min(1),
});

const httpsUrl = z
  .string()
  .max(2000)
  .refine((u) => {
    try {
      return new URL(u).protocol === "https:";
    } catch {
      return false;
    }
  }, "must be a valid https:// URL");

/**
 * Bounded safe text: plain text with a minimal inline subset
 * (**bold**, *italic*, [label](https://…)) interpreted by the renderer via
 * escaped-first parsing. Raw HTML tags carry no meaning and render as text.
 */
const safeText = z.string().min(1).max(20_000);

// ---------------------------------------------------------------------------
// Per-type data schemas (v1 unless noted)
// ---------------------------------------------------------------------------

export const richTextDataV1 = z.strictObject({ text: safeText });

export const headingDataV1 = z.strictObject({
  text: z.string().min(1).max(200),
  /** h2/h3 only inside lessons — h1 is the lesson title. */
  level: z.union([z.literal(2), z.literal(3)]),
});

/** v1: single tone string (Phase 1B). */
export const calloutDataV1 = z.strictObject({
  tone: z.enum(["info", "success", "warning"]),
  body: safeText,
});

/** v2: adds optional title, widens tones (Phase 1B additive example). */
export const calloutDataV2 = z.strictObject({
  tone: z.enum(["info", "success", "warning", "danger", "note"]),
  title: z.string().max(120).optional(),
  body: safeText,
});

export const dividerDataV1 = z.strictObject({});

export const imageDataV1 = z
  .strictObject({
    /** Governed media reference — never a raw URL (ADR-015). */
    assetId: z.uuid(),
    alt: z.string().min(1).max(300).optional(),
    decorative: z.boolean().default(false),
    caption: z.string().max(300).optional(),
  })
  .refine((d) => d.decorative || (d.alt !== undefined && d.alt.length > 0), {
    message: "image requires alt text unless marked decorative",
  });

/**
 * External video reference. Rendered as a labeled external-resource card in
 * Phase 1C (no arbitrary iframes); provider embeds are a later, allowlisted
 * capability.
 */
export const videoDataV1 = z.strictObject({
  url: httpsUrl,
  title: z.string().min(1).max(200),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  transcriptNote: z.string().max(500).optional(),
});

/** File/resource: a governed media asset OR an https link — exactly one. */
export const fileLinkDataV1 = z
  .strictObject({
    label: z.string().min(1).max(200),
    assetId: z.uuid().optional(),
    url: httpsUrl.optional(),
  })
  .refine((d) => (d.assetId !== undefined) !== (d.url !== undefined), {
    message: "provide exactly one of assetId or url",
  });

export const checklistDataV1 = z.strictObject({
  items: z
    .array(z.strictObject({ id: z.uuid(), text: z.string().min(1).max(300) }))
    .min(1)
    .max(30),
});

/** Placeholder for the Phase 1D assessment engine (durable reference now). */
export const assessmentReferenceDataV1 = z.strictObject({
  assessmentId: z.uuid(),
  title: z.string().min(1).max(200),
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
    type: z.literal("callout"),
    schemaVersion: z.literal(2),
    data: calloutDataV2,
  }),
  blockBase.extend({
    type: z.literal("divider"),
    schemaVersion: z.literal(1),
    data: dividerDataV1,
  }),
  blockBase.extend({
    type: z.literal("image"),
    schemaVersion: z.literal(1),
    data: imageDataV1,
  }),
  blockBase.extend({
    type: z.literal("video"),
    schemaVersion: z.literal(1),
    data: videoDataV1,
  }),
  blockBase.extend({
    type: z.literal("file_link"),
    schemaVersion: z.literal(1),
    data: fileLinkDataV1,
  }),
  blockBase.extend({
    type: z.literal("checklist"),
    schemaVersion: z.literal(1),
    data: checklistDataV1,
  }),
  blockBase.extend({
    type: z.literal("assessment_reference"),
    schemaVersion: z.literal(1),
    data: assessmentReferenceDataV1,
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
  "callout:1": calloutDataV1,
  "callout:2": calloutDataV2,
  "divider:1": dividerDataV1,
  "image:1": imageDataV1,
  "video:1": videoDataV1,
  "file_link:1": fileLinkDataV1,
  "checklist:1": checklistDataV1,
  "assessment_reference:1": assessmentReferenceDataV1,
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
  callout: 2,
  divider: 1,
  image: 1,
  video: 1,
  file_link: 1,
  checklist: 1,
  assessment_reference: 1,
};

export function validateBlockData(
  type: BlockType,
  schemaVersion: number,
  data: unknown,
): { ok: true; data: unknown } | { ok: false; error: string } {
  const schema = dataSchemas[`${type}:${schemaVersion}`];
  if (!schema) {
    return {
      ok: false,
      error: `unknown block schema ${type}:${schemaVersion}`,
    };
  }
  const result = schema.safeParse(data);
  return result.success
    ? { ok: true, data: result.data }
    : {
        ok: false,
        error: result.error.issues[0]?.message ?? "invalid block data",
      };
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
    if (!step) {
      throw new Error(`missing migration ${type}:${version} → ${version + 1}`);
    }
    current = step(current);
    version += 1;
  }
  return { schemaVersion: version, data: current };
}
