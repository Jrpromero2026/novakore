import type { GenerationRequest } from "@novakore/domain";

/**
 * Fixture outputs for the mock and deterministic providers. Deterministic
 * by construction: derived only from the request (no randomness beyond
 * UUIDs, which the block schemas require — tests assert shape, not ids).
 * Every output validates against the registered operation schema.
 */

const uuid = () => crypto.randomUUID();

export function buildFixtureOutput(request: GenerationRequest): unknown {
  const topic = request.objective.slice(0, 80);
  const grounded = request.sources.length > 0;
  const sourceNote = grounded
    ? ` (grounded in ${request.sources.map((s) => s.title).join(", ")})`
    : "";

  switch (request.operation) {
    case "path_outline":
      return {
        title: `${topic} Path`,
        description: `A sequenced route through ${topic.toLowerCase()}${sourceNote}.`,
        courses: [
          {
            title: `${topic}: Foundations`,
            summary: "Core concepts and vocabulary.",
          },
          {
            title: `${topic}: Applied Practice`,
            summary: "Hands-on application with feedback.",
          },
        ],
        suggestedPrerequisites: [
          {
            courseTitle: `${topic}: Applied Practice`,
            requiresCourseTitle: `${topic}: Foundations`,
            reason: "Application builds on the foundational vocabulary.",
          },
        ],
      };
    case "course_outline":
      return {
        title: topic,
        summary: `A structured course on ${topic.toLowerCase()}${sourceNote}.`,
        modules: [
          {
            title: "Getting Oriented",
            lessons: [
              {
                title: "Why this matters",
                objective: "Motivate the topic and set expectations.",
              },
              {
                title: "Key vocabulary",
                objective: "Establish shared language.",
              },
            ],
          },
          {
            title: "Core Practice",
            lessons: [
              {
                title: "The core method",
                objective: "Walk the primary workflow end to end.",
              },
              {
                title: "Common pitfalls",
                objective: "Recognize and avoid frequent mistakes.",
              },
            ],
          },
        ],
      };
    case "module_suggestions":
      return {
        modules: [
          {
            title: "Orientation",
            rationale: "Learners need shared context first.",
          },
          {
            title: "Guided practice",
            rationale: "Skills consolidate through application.",
          },
        ],
      };
    case "lesson_draft":
    case "source_to_blocks":
      return {
        title: topic,
        blocks: [
          {
            id: uuid(),
            type: "heading",
            schemaVersion: 1,
            position: "a0",
            data: { text: topic, level: 2 },
          },
          {
            id: uuid(),
            type: "rich_text",
            schemaVersion: 1,
            position: "a1",
            data: {
              text: `This draft covers ${topic.toLowerCase()}${sourceNote}. Review and edit before publishing — generated content is always a draft.`,
            },
          },
          {
            id: uuid(),
            type: "callout",
            schemaVersion: 2,
            position: "a2",
            data: {
              tone: "info",
              body: "Key takeaway: adapt this to your audience before publishing.",
            },
          },
        ],
      };
    case "rewrite_audience":
    case "rewrite_reading_level":
      return {
        text: `${request.inputText ?? topic} — rewritten for ${request.audience ?? request.readingLevel ?? "the requested audience"}.`,
        notes: "Tone and vocabulary adjusted; review for domain accuracy.",
      };
    case "summarize_source":
      return {
        summary: `Summary of the supplied material${sourceNote}: the core argument, its supporting points, and the practical implications.`,
        keyPoints: [
          "Core argument",
          "Supporting evidence",
          "Practical implication",
        ],
      };
    case "knowledge_checks":
    case "assessment_questions":
      return {
        checks: [
          {
            prompt: `Which statement best describes ${topic.toLowerCase()}?`,
            options: [
              "The correct framing",
              "A common misconception",
              "An unrelated concept",
            ],
            correctIndex: 0,
            explanation:
              "The first option matches the definition covered in the material.",
          },
        ],
      };
    case "scenario":
      return {
        intro: `You are applying ${topic.toLowerCase()} in a realistic situation${sourceNote}.`,
        steps: [
          {
            situation:
              "A stakeholder asks you to skip the standard process to save time.",
            consideration: "What risks does the shortcut introduce?",
          },
          {
            situation:
              "You discover the shortcut was already taken last quarter.",
            consideration: "How do you surface this without assigning blame?",
          },
        ],
        debrief:
          "Compare your instincts with the recommended approach from the material.",
      };
    case "prerequisite_suggestions":
      return {
        suggestions: [
          {
            nodeTitle: "Applied Practice",
            requiresNodeTitle: "Foundations",
            reason: "Application assumes the foundational vocabulary.",
          },
        ],
      };
    case "gap_analysis":
      return {
        gaps: [
          {
            area: "Assessment coverage",
            detail: "No graded check verifies the core method.",
          },
          {
            area: "Practice opportunities",
            detail: "Learners read but never apply the skill.",
          },
        ],
      };
    case "reflection_prompts":
      return {
        prompts: [
          {
            prompt: `Where have you already encountered ${topic.toLowerCase()} in your own work?`,
            guidance:
              "Be specific: one situation, what you did, what you would change.",
          },
        ],
      };
    case "flashcards":
      return {
        cards: [
          {
            front: `${topic}: key term`,
            back: "The definition, in plain language.",
          },
          {
            front: `${topic}: when to use it`,
            back: "The situations where this applies.",
          },
        ],
      };
  }
}
