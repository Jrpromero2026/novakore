import "server-only";
import {
  normalizeProviderError,
  validateAiOutput,
  type AiProvider,
  type GenerationRequest,
  type ProviderResult,
} from "@novakore/domain";
import { buildFixtureOutput } from "./fixtures";

/**
 * Provider adapters (ADR-023). Selection is server-side only:
 *
 *   NOVAKORE_AI_PROVIDER = mock (default) | deterministic | anthropic
 *   ANTHROPIC_API_KEY    = required only for the anthropic adapter
 *
 * No provider credentials exist in this development environment, so the
 * anthropic adapter is UNVERIFIED against the live API — the abstraction,
 * workflow, budget enforcement, and UI are proven with the mock and
 * deterministic providers (owner decision 6). Keys never reach the
 * browser: this module is server-only and adapters run inside actions.
 */

const PROFILE_TO_ANTHROPIC_MODEL: Record<string, string> = {
  drafting: "claude-sonnet-5",
  structured: "claude-sonnet-5",
  rewrite: "claude-haiku-4-5-20251001",
};

/** Development mock: realistic fixture output after a short delay. */
export class MockProvider implements AiProvider {
  readonly name = "mock";
  async generate(request: GenerationRequest): Promise<ProviderResult> {
    await new Promise((r) => setTimeout(r, 400));
    const output = buildFixtureOutput(request);
    return {
      ok: true,
      output,
      usage: {
        inputTokens: 900 + request.sources.length * 600,
        outputTokens: 700,
      },
      providerModel: "mock-fixture-1",
    };
  }
}

/**
 * Deterministic provider for tests and QA: identical requests produce
 * identical outputs and usage — no randomness, no delay.
 */
export class DeterministicProvider implements AiProvider {
  readonly name = "deterministic";
  async generate(request: GenerationRequest): Promise<ProviderResult> {
    if (request.objective.includes("[force-failure]")) {
      return {
        ok: false,
        error: normalizeProviderError({
          status: 529,
          message: "forced failure",
        }),
      };
    }
    if (request.objective.includes("[force-invalid]")) {
      return {
        ok: true,
        output: { nonsense: true },
        usage: { inputTokens: 10, outputTokens: 10 },
        providerModel: "deterministic-1",
      };
    }
    const output = buildFixtureOutput(request);
    const inputTokens =
      request.objective.length +
      request.sources.reduce((sum, s) => sum + s.excerpt.length, 0) / 4;
    return {
      ok: true,
      output,
      usage: {
        inputTokens: Math.ceil(inputTokens),
        outputTokens: JSON.stringify(output).length / 4,
      },
      providerModel: "deterministic-1",
    };
  }
}

/**
 * Anthropic adapter. UNVERIFIED without credentials — activation:
 * set NOVAKORE_AI_PROVIDER=anthropic and ANTHROPIC_API_KEY in the
 * server environment (never committed, never NEXT_PUBLIC_).
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  constructor(private readonly apiKey: string) {}

  async generate(
    request: GenerationRequest,
    signal?: AbortSignal,
  ): Promise<ProviderResult> {
    const model = PROFILE_TO_ANTHROPIC_MODEL[request.profile]!;
    const sources = request.sources
      .map((s) => `<source title="${s.title}">\n${s.excerpt}\n</source>`)
      .join("\n");
    const timeout = AbortSignal.timeout(60_000);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system:
            "You are NovaKore's authoring assistant. Respond with ONLY a JSON object matching the requested structure. Use only the supplied tenant sources; never invent citations.",
          messages: [
            {
              role: "user",
              content: `Operation: ${request.operation}\nObjective: ${request.objective}\nAudience: ${request.audience ?? "general"}\nReading level: ${request.readingLevel ?? "intermediate"}\n${sources}\n${request.inputText ? `<input>\n${request.inputText}\n</input>` : ""}`,
            },
          ],
        }),
      });
      if (!response.ok) {
        return {
          ok: false,
          error: normalizeProviderError({
            status: response.status,
            message: `Anthropic request failed (${response.status})`,
          }),
        };
      }
      const body = (await response.json()) as {
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = body.content?.find((c) => c.type === "text")?.text ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
      } catch {
        return {
          ok: false,
          error: {
            kind: "invalid_output",
            message: "The provider did not return parseable JSON.",
            retryable: true,
          },
        };
      }
      return {
        ok: true,
        output: parsed,
        usage: {
          inputTokens: body.usage?.input_tokens ?? 0,
          outputTokens: body.usage?.output_tokens ?? 0,
        },
        providerModel: model,
      };
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === "TimeoutError";
      return {
        ok: false,
        error: normalizeProviderError({
          code: aborted ? "timeout" : undefined,
          message: cause instanceof Error ? cause.message : "request failed",
        }),
      };
    }
  }
}

export function getProvider(): AiProvider {
  const selection = process.env.NOVAKORE_AI_PROVIDER ?? "mock";
  if (selection === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "NOVAKORE_AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY in the server environment.",
      );
    }
    return new AnthropicProvider(key);
  }
  if (selection === "deterministic") return new DeterministicProvider();
  return new MockProvider();
}

/** Sanity gate shared by every adapter path. */
export function validateProviderOutput(
  request: GenerationRequest,
  output: unknown,
) {
  return validateAiOutput(request.operation, output);
}
