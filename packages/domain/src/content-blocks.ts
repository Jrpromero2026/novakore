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
  // Phase 2 — implemented interactive set
  "quote",
  "accordion",
  "tabs",
  "timeline",
  "comparison",
  "flashcards",
  "knowledge_check",
  "reflection",
  "action_step",
  "scenario",
  "audio",
  "pdf",
  // Phase 2 — schema-only (validated, storable, renderer falls back to a
  // neutral notice; editors do not offer them yet — see content-blocks doc)
  "survey",
  "branching_scenario",
  "decision_tree",
  "ai_conversation",
  "ai_roleplay",
  "manager_approval",
  "instructor_feedback",
  "live_session",
  "diagram",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** Phase 2 classification (single source for docs, editors, and tests). */
export const BLOCK_STATUS: Record<
  BlockType,
  "implemented" | "implemented_with_limitations" | "schema_only"
> = {
  rich_text: "implemented",
  heading: "implemented",
  callout: "implemented",
  divider: "implemented",
  image: "implemented_with_limitations", // renders via governed media; upload UI is Studio-side
  video: "implemented_with_limitations", // external card, no embeds (documented policy)
  file_link: "implemented",
  checklist: "implemented",
  assessment_reference: "implemented",
  quote: "implemented",
  accordion: "implemented",
  tabs: "implemented",
  timeline: "implemented",
  comparison: "implemented",
  flashcards: "implemented",
  knowledge_check: "implemented_with_limitations", // ungraded self-check: answer ships in the snapshot BY DESIGN
  reflection: "implemented_with_limitations", // prompt renders; learner responses arrive with learner-input storage
  action_step: "implemented",
  scenario: "implemented",
  audio: "implemented_with_limitations", // governed asset playback; upload UI is Studio-side
  pdf: "implemented_with_limitations", // download card, no inline viewer
  survey: "schema_only",
  branching_scenario: "schema_only",
  decision_tree: "schema_only",
  ai_conversation: "schema_only", // learner AI is Phase 3
  ai_roleplay: "schema_only",
  manager_approval: "schema_only", // needs runtime approval workflow
  instructor_feedback: "schema_only",
  live_session: "schema_only",
  diagram: "schema_only", // safe diagram rendering not ready
};

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
// Phase 2 — implemented interactive block data schemas (v1)
// ---------------------------------------------------------------------------

const shortText = z.string().min(1).max(500);

export const quoteDataV1 = z.strictObject({
  text: z.string().min(1).max(2_000),
  attribution: z.string().min(1).max(200).optional(),
});

export const accordionDataV1 = z.strictObject({
  items: z
    .array(z.strictObject({ id: z.uuid(), title: shortText, body: safeText }))
    .min(1)
    .max(20),
});

export const tabsDataV1 = z.strictObject({
  tabs: z
    .array(
      z.strictObject({
        id: z.uuid(),
        title: z.string().min(1).max(80),
        body: safeText,
      }),
    )
    .min(2)
    .max(8),
});

export const timelineDataV1 = z.strictObject({
  events: z
    .array(
      z.strictObject({
        id: z.uuid(),
        label: z.string().min(1).max(120),
        description: safeText,
      }),
    )
    .min(2)
    .max(20),
});

export const comparisonDataV1 = z.strictObject({
  leftTitle: z.string().min(1).max(120),
  rightTitle: z.string().min(1).max(120),
  rows: z
    .array(z.strictObject({ id: z.uuid(), left: shortText, right: shortText }))
    .min(1)
    .max(20),
});

export const flashcardsDataV1 = z.strictObject({
  cards: z
    .array(
      z.strictObject({
        id: z.uuid(),
        front: z.string().min(1).max(500),
        back: z.string().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * Ungraded formative self-check. The correct option ships inside the frozen
 * lesson snapshot BY DESIGN (reveal-on-answer, no score, no progress
 * effect) — graded checks must use assessment_reference instead.
 */
export const knowledgeCheckDataV1 = z
  .strictObject({
    prompt: safeText,
    options: z
      .array(z.strictObject({ id: z.uuid(), text: shortText }))
      .min(2)
      .max(6),
    correctOptionId: z.uuid(),
    explanation: safeText.optional(),
  })
  .refine((d) => d.options.some((o) => o.id === d.correctOptionId), {
    message: "correctOptionId must reference one of the options",
  });

/** Learner responses are a future learner-input capability (documented). */
export const reflectionDataV1 = z.strictObject({
  prompt: safeText,
  guidance: safeText.optional(),
});

export const actionStepDataV1 = z.strictObject({
  text: shortText,
  note: safeText.optional(),
});

export const scenarioDataV1 = z.strictObject({
  intro: safeText,
  steps: z
    .array(
      z.strictObject({
        id: z.uuid(),
        situation: safeText,
        consideration: safeText.optional(),
      }),
    )
    .min(1)
    .max(12),
  debrief: safeText.optional(),
});

/** Governed media reference — playback via signed URL (ADR-015). */
export const audioDataV1 = z.strictObject({
  assetId: z.uuid(),
  title: z.string().min(1).max(200),
  transcriptNote: z.string().max(500).optional(),
});

/** Download card only — no inline PDF viewer in Phase 2. */
export const pdfDataV1 = z.strictObject({
  assetId: z.uuid(),
  title: z.string().min(1).max(200),
  pageCount: z.number().int().min(1).max(2_000).optional(),
});

// ---------------------------------------------------------------------------
// Phase 2 — schema-only block data (validated shape reserved; no editor or
// renderer yet — the renderer's neutral fallback handles stored instances)
// ---------------------------------------------------------------------------

export const surveyDataV1 = z.strictObject({
  prompt: safeText,
  questions: z
    .array(z.strictObject({ id: z.uuid(), text: shortText }))
    .min(1)
    .max(20),
});

export const branchingScenarioDataV1 = z.strictObject({
  intro: safeText,
  nodes: z
    .array(
      z.strictObject({
        id: z.uuid(),
        situation: safeText,
        choices: z
          .array(
            z.strictObject({
              id: z.uuid(),
              text: shortText,
              nextNodeId: z.uuid().nullable(),
            }),
          )
          .min(1)
          .max(5),
      }),
    )
    .min(1)
    .max(30),
});

export const decisionTreeDataV1 = branchingScenarioDataV1;

export const aiConversationDataV1 = z.strictObject({
  objective: safeText,
  personaNote: safeText.optional(),
});

export const aiRoleplayDataV1 = aiConversationDataV1;

export const managerApprovalDataV1 = z.strictObject({
  instructions: safeText,
});

export const instructorFeedbackDataV1 = z.strictObject({
  instructions: safeText,
});

export const liveSessionDataV1 = z.strictObject({
  title: z.string().min(1).max(200),
  instructions: safeText.optional(),
});

export const diagramDataV1 = z.strictObject({
  title: z.string().min(1).max(200).optional(),
  /** Constrained node/edge description — never executable markup. */
  nodes: z
    .array(z.strictObject({ id: z.uuid(), label: z.string().min(1).max(120) }))
    .min(1)
    .max(40),
  edges: z.array(z.strictObject({ from: z.uuid(), to: z.uuid() })).max(80),
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
  blockBase.extend({
    type: z.literal("quote"),
    schemaVersion: z.literal(1),
    data: quoteDataV1,
  }),
  blockBase.extend({
    type: z.literal("accordion"),
    schemaVersion: z.literal(1),
    data: accordionDataV1,
  }),
  blockBase.extend({
    type: z.literal("tabs"),
    schemaVersion: z.literal(1),
    data: tabsDataV1,
  }),
  blockBase.extend({
    type: z.literal("timeline"),
    schemaVersion: z.literal(1),
    data: timelineDataV1,
  }),
  blockBase.extend({
    type: z.literal("comparison"),
    schemaVersion: z.literal(1),
    data: comparisonDataV1,
  }),
  blockBase.extend({
    type: z.literal("flashcards"),
    schemaVersion: z.literal(1),
    data: flashcardsDataV1,
  }),
  blockBase.extend({
    type: z.literal("knowledge_check"),
    schemaVersion: z.literal(1),
    data: knowledgeCheckDataV1,
  }),
  blockBase.extend({
    type: z.literal("reflection"),
    schemaVersion: z.literal(1),
    data: reflectionDataV1,
  }),
  blockBase.extend({
    type: z.literal("action_step"),
    schemaVersion: z.literal(1),
    data: actionStepDataV1,
  }),
  blockBase.extend({
    type: z.literal("scenario"),
    schemaVersion: z.literal(1),
    data: scenarioDataV1,
  }),
  blockBase.extend({
    type: z.literal("audio"),
    schemaVersion: z.literal(1),
    data: audioDataV1,
  }),
  blockBase.extend({
    type: z.literal("pdf"),
    schemaVersion: z.literal(1),
    data: pdfDataV1,
  }),
  blockBase.extend({
    type: z.literal("survey"),
    schemaVersion: z.literal(1),
    data: surveyDataV1,
  }),
  blockBase.extend({
    type: z.literal("branching_scenario"),
    schemaVersion: z.literal(1),
    data: branchingScenarioDataV1,
  }),
  blockBase.extend({
    type: z.literal("decision_tree"),
    schemaVersion: z.literal(1),
    data: decisionTreeDataV1,
  }),
  blockBase.extend({
    type: z.literal("ai_conversation"),
    schemaVersion: z.literal(1),
    data: aiConversationDataV1,
  }),
  blockBase.extend({
    type: z.literal("ai_roleplay"),
    schemaVersion: z.literal(1),
    data: aiRoleplayDataV1,
  }),
  blockBase.extend({
    type: z.literal("manager_approval"),
    schemaVersion: z.literal(1),
    data: managerApprovalDataV1,
  }),
  blockBase.extend({
    type: z.literal("instructor_feedback"),
    schemaVersion: z.literal(1),
    data: instructorFeedbackDataV1,
  }),
  blockBase.extend({
    type: z.literal("live_session"),
    schemaVersion: z.literal(1),
    data: liveSessionDataV1,
  }),
  blockBase.extend({
    type: z.literal("diagram"),
    schemaVersion: z.literal(1),
    data: diagramDataV1,
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
  "quote:1": quoteDataV1,
  "accordion:1": accordionDataV1,
  "tabs:1": tabsDataV1,
  "timeline:1": timelineDataV1,
  "comparison:1": comparisonDataV1,
  "flashcards:1": flashcardsDataV1,
  "knowledge_check:1": knowledgeCheckDataV1,
  "reflection:1": reflectionDataV1,
  "action_step:1": actionStepDataV1,
  "scenario:1": scenarioDataV1,
  "audio:1": audioDataV1,
  "pdf:1": pdfDataV1,
  "survey:1": surveyDataV1,
  "branching_scenario:1": branchingScenarioDataV1,
  "decision_tree:1": decisionTreeDataV1,
  "ai_conversation:1": aiConversationDataV1,
  "ai_roleplay:1": aiRoleplayDataV1,
  "manager_approval:1": managerApprovalDataV1,
  "instructor_feedback:1": instructorFeedbackDataV1,
  "live_session:1": liveSessionDataV1,
  "diagram:1": diagramDataV1,
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
  quote: 1,
  accordion: 1,
  tabs: 1,
  timeline: 1,
  comparison: 1,
  flashcards: 1,
  knowledge_check: 1,
  reflection: 1,
  action_step: 1,
  scenario: 1,
  audio: 1,
  pdf: 1,
  survey: 1,
  branching_scenario: 1,
  decision_tree: 1,
  ai_conversation: 1,
  ai_roleplay: 1,
  manager_approval: 1,
  instructor_feedback: 1,
  live_session: 1,
  diagram: 1,
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
