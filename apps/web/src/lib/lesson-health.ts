import type { BlockType } from "@novakore/domain";

/**
 * Knowledge Health (Experience Design System — Knowledge IDE).
 *
 * A coaching read on a lesson draft, derived ENTIRELY from the real block
 * content in front of the author — nothing estimated from data we don't have.
 * Checks coach toward a stronger lesson; they never scold, and the score is
 * an honest "n of m signals present", not a synthetic quality percentage.
 */

export interface HealthInputBlock {
  type: BlockType;
  data: Record<string, unknown>;
  valid: boolean;
}

export interface HealthCheck {
  id: string;
  ok: boolean;
  label: string;
  /** Coaching line shown when the check is not yet met. */
  coach: string;
}

export interface LessonHealth {
  score: number;
  total: number;
  words: number;
  readingMinutes: number;
  interactiveCount: number;
  checks: HealthCheck[];
}

const INTERACTIVE: ReadonlySet<BlockType> = new Set([
  "knowledge_check",
  "flashcards",
  "reflection",
  "scenario",
  "checklist",
  "accordion",
  "tabs",
] as BlockType[]);

const MEDIA: ReadonlySet<BlockType> = new Set([
  "video",
  "image",
  "file_link",
] as BlockType[]);

/**
 * Count words across the CONTENT string fields of a block's data,
 * recursively. Identifier and address fields (`id`, `*Id`, `url`) are
 * machine values, not prose — they never count. Exported for the Nova
 * intelligence layer, which sizes lessons with the same honest ruler.
 */
export function countContentWords(value: unknown): number {
  return wordsIn(value);
}

function wordsIn(value: unknown): number {
  if (typeof value === "string") {
    return value.split(/\s+/).filter((w) => w.length > 0).length;
  }
  if (Array.isArray(value))
    return value.reduce<number>((s, v) => s + wordsIn(v), 0);
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<number>(
      (s, [key, v]) =>
        key === "id" || key.endsWith("Id") || key === "url"
          ? s
          : s + wordsIn(v),
      0,
    );
  }
  return 0;
}

export function assessLessonHealth(blocks: HealthInputBlock[]): LessonHealth {
  const words = blocks.reduce((sum, b) => sum + wordsIn(b.data), 0);
  const readingMinutes = Math.max(1, Math.round(words / 200));
  const interactiveCount = blocks.filter((b) => INTERACTIVE.has(b.type)).length;
  const hasHeading = blocks.some((b) => b.type === "heading");
  const hasMedia = blocks.some((b) => MEDIA.has(b.type));
  const hasKnowledgeCheck = blocks.some((b) => b.type === "knowledge_check");
  const hasReflection = blocks.some(
    (b) => b.type === "reflection" || b.type === "scenario",
  );
  const allValid = blocks.length > 0 && blocks.every((b) => b.valid);
  const substantial = words >= 120;
  // Vacuously "digestible" empty lessons don't earn the signal.
  const digestible = words > 0 && words <= 2400;

  const checks: HealthCheck[] = [
    {
      id: "valid",
      ok: allValid,
      label: "Every block is valid",
      coach:
        blocks.length === 0
          ? "Add your first block — press / on the canvas."
          : "Fix the flagged blocks so learners see everything you wrote.",
    },
    {
      id: "structure",
      ok: hasHeading,
      label: "Sectioned with headings",
      coach: "A heading or two gives learners a map of the lesson.",
    },
    {
      id: "substance",
      ok: substantial,
      label: "Substantial content (120+ words)",
      coach: "Thin lessons read as placeholders — develop the core idea.",
    },
    {
      id: "digestible",
      ok: digestible,
      label: "Digestible length (≤ ~12 min read)",
      coach: "Long lessons lose people — consider splitting this one.",
    },
    {
      id: "interactive",
      ok: interactiveCount > 0,
      label: "Invites interaction",
      coach:
        "A knowledge check, flashcards, or a reflection turns reading into learning.",
    },
    {
      id: "check",
      ok: hasKnowledgeCheck,
      label: "Understanding is checked",
      coach: "A quick knowledge check confirms the idea landed.",
    },
    {
      id: "reflect",
      ok: hasReflection,
      label: "Prompts thinking",
      coach: "A reflection or scenario makes the knowledge personal.",
    },
    {
      id: "media",
      ok: hasMedia,
      label: "Uses media or resources",
      coach: "A video or resource link gives the lesson another dimension.",
    },
    {
      id: "density",
      // An empty lesson earns nothing vacuously (same rule as digestible).
      ok:
        blocks.length > 0 &&
        !blocks.some((b) => b.type === "rich_text" && wordsIn(b.data) > 220),
      label: "No overly dense passages",
      coach:
        "One text block runs very long — a heading, callout, or split keeps readers with you.",
    },
    {
      id: "a11y",
      ok:
        blocks.length > 0 &&
        blocks.every((b) => {
          if (b.type === "image") {
            const d = b.data;
            return d.decorative === true || typeof d.alt === "string";
          }
          if (b.type === "video") return typeof b.data.title === "string";
          return true;
        }),
      label: "Media is described",
      coach:
        "Give images alt text (or mark them decorative) and videos a title so every learner gets the content.",
    },
  ];

  return {
    score: checks.filter((c) => c.ok).length,
    total: checks.length,
    words,
    readingMinutes,
    interactiveCount,
    checks,
  };
}
