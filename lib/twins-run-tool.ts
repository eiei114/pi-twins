import {
  defineTool,
  type AgentToolResult,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.ts";
import { resolvePair } from "./extension-helpers.ts";
import {
  formatBothModelsFailedMessage,
  formatTwinsMarkdown,
  runTwins,
  synthesizeResponses,
  type SynthesisPromptOptions,
  type TwinsRunResult,
} from "./runner.ts";
import {
  TwinsRunToolParametersSchema,
  type SynthesisLanguage,
  type TwinsConfig,
} from "./schema.ts";

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
    synthesisLanguage?: SynthesisLanguage;
    synthesisMode?: SynthesisPromptOptions["mode"];
    synthesisInstructions?: string;
  } = {},
): SynthesisPromptOptions {
  return {
    language: overrides.synthesisLanguage ?? config.synthesis?.language ?? "ja",
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

type TwinsRunToolParams = {
  prompt: string;
  pair?: string;
  synthesisLanguage?: SynthesisLanguage;
  synthesisMode?: SynthesisPromptOptions["mode"];
  synthesisInstructions?: string;
};

export async function executeTwinsRun(
  params: TwinsRunToolParams,
  signal: AbortSignal | undefined,
  modelRegistry: ExtensionContext["modelRegistry"],
  config?: TwinsConfig,
): Promise<TwinsRunToolResult> {
  try {
    const resolvedConfig = config ?? loadConfig();
    const pair = resolvePair(resolvedConfig, params.pair);
    const synthesisOptions = resolveSynthesisOptions(resolvedConfig, params);

    const result = await runTwins(params.prompt, pair, modelRegistry, { signal });
    if (!result.responseA && !result.responseB) {
      throw new Error(formatBothModelsFailedMessage(result));
    }

    const synthesisModel = result.responseA ? pair[0] : pair[1];
    const synthesis = await synthesizeResponses(
      result,
      modelRegistry,
      synthesisModel,
      signal,
      synthesisOptions,
    );
    return buildTwinsRunSuccessResult(result, pair, synthesis);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildTwinsRunErrorResult(message);
  }
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
    return executeTwinsRun(params, signal, ctx.modelRegistry);
  },
});
