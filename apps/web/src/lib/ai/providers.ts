import "server-only";
import Anthropic from "@anthropic-ai/sdk";
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
 *   NOVAKORE_AI_MODEL    = optional model override (default claude-opus-5)
 *
 * Keys never reach the browser: this module is server-only and adapters run
 * inside actions. The anthropic adapter uses the official SDK; every profile
 * runs Claude Opus 5 unless the owner overrides the model via env.
 */

const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

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
 * Anthropic adapter — official SDK, Claude Opus 5 (adaptive thinking is the
 * model default, so no thinking config is sent). Activation: set
 * NOVAKORE_AI_PROVIDER=anthropic and ANTHROPIC_API_KEY in the server
 * environment (never committed, never NEXT_PUBLIC_).
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
    this.model = model ?? DEFAULT_ANTHROPIC_MODEL;
  }

  async generate(
    request: GenerationRequest,
    signal?: AbortSignal,
  ): Promise<ProviderResult> {
    const sources = request.sources
      .map((s) => `<source title="${s.title}">\n${s.excerpt}\n</source>`)
      .join("\n");
    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 16_000,
          system:
            "You are NovaKore's authoring assistant. Respond with ONLY a JSON object matching the requested structure — no prose, no code fences. Use only the supplied tenant sources; never invent citations.",
          messages: [
            {
              role: "user",
              content: `Operation: ${request.operation}\nObjective: ${request.objective}\nAudience: ${request.audience ?? "general"}\nReading level: ${request.readingLevel ?? "intermediate"}\n${sources}\n${request.inputText ? `<input>\n${request.inputText}\n</input>` : ""}`,
            },
          ],
        },
        { signal, timeout: 300_000 },
      );

      if (response.stop_reason === "refusal") {
        return {
          ok: false,
          error: {
            kind: "invalid_output",
            message: "The provider declined this request.",
            retryable: false,
          },
        };
      }

      let text = "";
      for (const block of response.content) {
        if (block.type === "text") text += block.text;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim());
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
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        providerModel: response.model,
      };
    } catch (cause) {
      if (cause instanceof Anthropic.APIError) {
        return {
          ok: false,
          error: normalizeProviderError({
            status: cause.status,
            message: cause.message,
          }),
        };
      }
      const aborted =
        cause instanceof Error &&
        (cause.name === "AbortError" || cause.name === "APIUserAbortError");
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
    return new AnthropicProvider(key, process.env.NOVAKORE_AI_MODEL);
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
