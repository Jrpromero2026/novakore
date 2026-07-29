import type { z } from "zod";
import type {
  flashcardDraftSchema,
  knowledgeChecksSchema,
  reflectionPromptsSchema,
  scenarioDraftSchema,
} from "@novakore/domain";

/**
 * Pure converters from validated AI outputs to REAL content blocks.
 * Insertion still re-validates through contentBlockSchema — these only
 * shape the data.
 */

const uuid = () => crypto.randomUUID();
const positions = () => {
  let p = "a0";
  return () => {
    const current = p;
    p = `${p}n`;
    return current;
  };
};

export function knowledgeChecksToBlocks(
  output: z.infer<typeof knowledgeChecksSchema>,
) {
  const next = positions();
  return output.checks.map((check) => {
    const options = check.options.map((text) => ({ id: uuid(), text }));
    return {
      id: uuid(),
      type: "knowledge_check" as const,
      schemaVersion: 1 as const,
      position: next(),
      data: {
        prompt: check.prompt,
        options,
        correctOptionId:
          options[Math.min(check.correctIndex, options.length - 1)]!.id,
        ...(check.explanation ? { explanation: check.explanation } : {}),
      },
    };
  });
}

export function flashcardsToBlocks(
  output: z.infer<typeof flashcardDraftSchema>,
) {
  return [
    {
      id: uuid(),
      type: "flashcards" as const,
      schemaVersion: 1 as const,
      position: "a0",
      data: {
        cards: output.cards.map((card) => ({ id: uuid(), ...card })),
      },
    },
  ];
}

export function scenarioToBlocks(output: z.infer<typeof scenarioDraftSchema>) {
  return [
    {
      id: uuid(),
      type: "scenario" as const,
      schemaVersion: 1 as const,
      position: "a0",
      data: {
        intro: output.intro,
        steps: output.steps.map((step) => ({ id: uuid(), ...step })),
        ...(output.debrief ? { debrief: output.debrief } : {}),
      },
    },
  ];
}

export function reflectionsToBlocks(
  output: z.infer<typeof reflectionPromptsSchema>,
) {
  const next = positions();
  return output.prompts.map((p) => ({
    id: uuid(),
    type: "reflection" as const,
    schemaVersion: 1 as const,
    position: next(),
    data: {
      prompt: p.prompt,
      ...(p.guidance ? { guidance: p.guidance } : {}),
    },
  }));
}
