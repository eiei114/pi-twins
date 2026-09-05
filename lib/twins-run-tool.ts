import {
  defineTool,
  type AgentToolResult,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.ts";
import { resolvePair } from "./extension-helpers.ts";
import {
  formatTwinsMarkdown,
  runTwins,
  synthesizeResponses,
  type SynthesisPromptOptions,
  type TwinsRunResult,
} from "./runner.ts";
import { TwinsRunToolParametersSchema, type TwinsConfig } from "./schema.ts";

export type TwinsRunToolSuccessDetails = {
  pair: [string, string];
  modelA: string;
  modelB: string;
};

export type TwinsRunToolErrorDetails = {
  error: true;
};

export type TwinsRunToolDetails = TwinsRunToolSuccessDetails | TwinsRunToolErrorDetails;

/** Pi extension tools may set isError at runtime even though AgentToolResult omits it. */
export type TwinsRunToolResult = AgentToolResult<TwinsRunToolDetails> & {
  isError?: boolean;
};

export function resolveSynthesisOptions(
  config: TwinsConfig,
  overrides: {
    synthesisMode?: SynthesisPromptOptions["mode"];
    synthesisInstructions?: string;
  } = {},
): SynthesisPromptOptions {
  return {
    mode: overrides.synthesisMode ?? config.synthesis?.mode,
    instructions: overrides.synthesisInstructions ?? config.synthesis?.instructions,
  };
}

export function buildTwinsRunSuccessResult(
  result: TwinsRunResult,
  pair: [string, string],
  synthesis: string,
): TwinsRunToolResult {
  return {
    content: [{ type: "text", text: formatTwinsMarkdown(result, synthesis) }],
    details: { pair, modelA: result.modelA, modelB: result.modelB },
  };
}

export function buildTwinsRunErrorResult(message: string): TwinsRunToolResult {
  return {
    content: [{ type: "text", text: `pi-twins error: ${message}` }],
    details: { error: true },
    isError: true,
  };
}

export const twinsRunTool = defineTool({
  name: "twins_run",
  label: "Twins Run",
  description: "Run a prompt on two configured models and return a synthesized result",
  promptSnippet: "twins_run: run the same prompt on two configured models and synthesize the responses",
  promptGuidelines: [
    "Use twins_run when a decision benefits from multiple model perspectives.",
    "The pair name comes from ~/.pi/twins.yaml.",
    "Returns both raw model responses and the final synthesis.",
  ],
  parameters: TwinsRunToolParametersSchema,
  async execute(_toolCallId, params, signal, _onUpdate, ctx: ExtensionContext) {
    try {
      const config = loadConfig();
      const pair = resolvePair(config, params.pair);
      const synthesisOptions = resolveSynthesisOptions(config, params);

      const result = await runTwins(params.prompt, pair, ctx.modelRegistry, { signal });
      if (!result.responseA && !result.responseB) {
        throw new Error("Both models failed");
      }

      const synthesis = await synthesizeResponses(
        result,
        ctx.modelRegistry,
        pair[0],
        signal,
        synthesisOptions,
      );
      return buildTwinsRunSuccessResult(result, pair, synthesis);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return buildTwinsRunErrorResult(message);
    }
  },
});
