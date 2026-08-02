import { describe, expect, test } from "vitest";
import { assessLessonHealth, type HealthInputBlock } from "./lesson-health";

const block = (
  type: HealthInputBlock["type"],
  data: Record<string, unknown>,
  valid = true,
): HealthInputBlock => ({ type, data, valid });

describe("knowledge health", () => {
  test("empty lesson: zero signals, coaching toward the first block", () => {
    const health = assessLessonHealth([]);
    expect(health.score).toBe(0);
    expect(health.words).toBe(0);
    expect(health.checks.find((c) => c.id === "valid")?.ok).toBe(false);
    expect(health.checks.find((c) => c.id === "valid")?.coach).toMatch(
      /first block/i,
    );
  });

  test("counts words recursively across nested block data", () => {
    const health = assessLessonHealth([
      block("rich_text", { text: "one two three" }),
      block("accordion", {
        items: [{ id: "a", title: "four five", body: "six" }],
      }),
    ]);
    expect(health.words).toBe(6);
    expect(health.readingMinutes).toBe(1);
  });

  test("a rounded lesson scores every signal", () => {
    const words = Array.from({ length: 130 }, (_, i) => `w${i}`).join(" ");
    const health = assessLessonHealth([
      block("heading", { text: "Intro", level: 2 }),
      block("rich_text", { text: words }),
      block("knowledge_check", {
        prompt: "?",
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
        ],
        correctOptionId: "a",
      }),
      block("reflection", { prompt: "Think about it" }),
      block("video", { url: "https://example.com", title: "Clip" }),
    ]);
    expect(health.score).toBe(health.total);
    expect(health.interactiveCount).toBe(2);
  });

  test("an invalid block fails the validity signal and coaches a fix", () => {
    const health = assessLessonHealth([
      block("rich_text", { text: "hello there friend" }, false),
    ]);
    const valid = health.checks.find((c) => c.id === "valid");
    expect(valid?.ok).toBe(false);
    expect(valid?.coach).toMatch(/flagged blocks/i);
  });

  test("overlong lessons lose the digestible signal", () => {
    const long = Array.from({ length: 2500 }, () => "word").join(" ");
    const health = assessLessonHealth([block("rich_text", { text: long })]);
    expect(health.checks.find((c) => c.id === "digestible")?.ok).toBe(false);
    expect(health.readingMinutes).toBeGreaterThan(12);
  });

  test("a single very dense text block loses the density signal", () => {
    const dense = Array.from({ length: 260 }, () => "word").join(" ");
    const health = assessLessonHealth([
      block("heading", { text: "Intro", level: 2 }),
      block("rich_text", { text: dense }),
    ]);
    expect(health.checks.find((c) => c.id === "density")?.ok).toBe(false);
  });

  test("undescribed media loses the accessibility signal; described media keeps it", () => {
    const bare = assessLessonHealth([
      block("image", { assetId: "00000000-0000-4000-8000-000000000001" }),
    ]);
    expect(bare.checks.find((c) => c.id === "a11y")?.ok).toBe(false);

    const described = assessLessonHealth([
      block("image", {
        assetId: "00000000-0000-4000-8000-000000000001",
        alt: "A squat rack",
      }),
      block("video", { url: "https://example.com", title: "Warm-up" }),
    ]);
    expect(described.checks.find((c) => c.id === "a11y")?.ok).toBe(true);
  });
});
