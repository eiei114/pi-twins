import {
  completeSimple,
  type Api,
  type Model,
  type UserMessage,
} from "@earendil-works/pi-ai";
import { SYNTHESIS_INSTRUCTIONS_MAX_LENGTH, type SynthesisMode } from "./schema.ts";

export interface TwinsModelRegistry {
  find(provider: string, modelId: string): Model<Api> | undefined;
  getApiKeyAndHeaders(model: Model<Api>): Promise<
    | { ok: true; apiKey?: string; headers?: Record<string, string> }
    | { ok: false; error: string }
  >;
}

export interface ModelRunResult {
  model: string;
  response?: string;
  error?: string;
}

export interface TwinsRunResult {
  modelA: string;
  modelB: string;
  prompt: string;
  responseA?: string;
  responseB?: string;
  errorA?: string;
  errorB?: string;
}

export interface SynthesisPromptOptions {
  mode?: SynthesisMode;
  instructions?: string;
}

export interface RunModelOptions {
  signal?: AbortSignal;
  runModel?: (fullId: string, prompt: string, registry: TwinsModelRegistry, signal?: AbortSignal) => Promise<ModelRunResult>;
}

function splitModelId(fullId: string): [string, string] {
  const idx = fullId.indexOf("/");
  if (idx === -1) {
    throw new Error(`Invalid model id "${fullId}" (expected provider/model-id)`);
  }
  return [fullId.slice(0, idx), fullId.slice(idx + 1)];
}

function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export async function runSingleModel(
  fullId: string,
  prompt: string,
  registry: TwinsModelRegistry,
  signal?: AbortSignal,
): Promise<ModelRunResult> {
  let provider: string;
  let modelId: string;

  try {
    [provider, modelId] = splitModelId(fullId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { model: fullId, error: message };
  }

  const model = registry.find(provider, modelId);
  if (!model) {
    return { model: fullId, error: `Model not found: ${fullId}` };
  }

  try {
    const auth = await registry.getApiKeyAndHeaders(model);
    if (!auth.ok) {
      return { model: fullId, error: auth.error };
    }

    const userMessage: UserMessage = {
      role: "user",
      content: [{ type: "text", text: prompt }],
      timestamp: Date.now(),
    };

    const response = await completeSimple(
      model,
      {
        systemPrompt: "You are a helpful assistant. Answer the user's question directly.",
        messages: [userMessage],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        signal,
      },
    );

    if (response.stopReason === "aborted") {
      return { model: fullId, error: "Request aborted" };
    }

    const text = extractText(response.content);
    if (!text) {
      return { model: fullId, error: `No text response from model ${fullId}` };
    }

    return { model: fullId, response: text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { model: fullId, error: message };
  }
}

/** Run the same prompt on two models in parallel. */
export async function runTwins(
  prompt: string,
  pair: readonly [string, string],
  registry: TwinsModelRegistry,
  options: RunModelOptions = {},
): Promise<TwinsRunResult> {
  const [modelA, modelB] = pair;
  const runModel = options.runModel ?? runSingleModel;
  const signal = options.signal;

  const [resultA, resultB] = await Promise.all([
    runModel(modelA, prompt, registry, signal),
    runModel(modelB, prompt, registry, signal),
  ]);

  return {
    modelA,
    modelB,
    prompt,
    responseA: resultA.response,
    responseB: resultB.response,
    errorA: resultA.error,
    errorB: resultB.error,
  };
}

const BALANCED_SYNTHESIS_REQUIREMENTS = [
  "- 情報を統合し、矛盾を解消してください",
  "- 冗長な部分は削除してください",
  "- 1つの自然な回答として書いてください",
];

const SYNTHESIS_MODE_REQUIREMENTS: Record<SynthesisMode, string[]> = {
  balanced: BALANCED_SYNTHESIS_REQUIREMENTS,
  decision: [
    ...BALANCED_SYNTHESIS_REQUIREMENTS,
    "- 最終的な推奨判断を明確に示してください",
    "- 判断理由と主要なトレードオフを短く説明してください",
    "- 次に取るべき具体的なアクションを含めてください",
  ],
  critique: [
    ...BALANCED_SYNTHESIS_REQUIREMENTS,
    "- 両回答の強みと弱みを批判的に評価してください",
    "- 不確かな点や検証が必要な前提を明示してください",
    "- 改善された回答として不足を補ってください",
  ],
  concise: [
    ...BALANCED_SYNTHESIS_REQUIREMENTS,
    "- 要点だけを簡潔にまとめてください",
    "- 可能な限り短く、余分な前置きや繰り返しを避けてください",
    "- 必要な場合のみ箇条書きを使ってください",
  ],
};

function getSynthesisRequirements(mode: SynthesisMode): string[] {
  const requirements = SYNTHESIS_MODE_REQUIREMENTS[mode];
  if (!requirements) {
    throw new Error(`Unknown synthesis mode: ${mode}`);
  }
  return requirements;
}

function normalizeSynthesisInstructions(instructions?: string): string | undefined {
  const trimmed = instructions?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > SYNTHESIS_INSTRUCTIONS_MAX_LENGTH) {
    throw new RangeError(
      `synthesis instructions must be ${SYNTHESIS_INSTRUCTIONS_MAX_LENGTH} characters or fewer`,
    );
  }
  return trimmed;
}

export function formatResponsesMarkdown(result: TwinsRunResult): string {
  const lines = [
    "## pi-twins — model responses",
    "",
    `**Prompt**`,
    result.prompt,
    "",
  ];

  lines.push(`**Model A**: \`${result.modelA}\``);
  if (result.responseA) {
    lines.push(result.responseA);
  } else {
    lines.push(`_Error: ${result.errorA ?? "no response"}_`);
  }
  lines.push("");

  lines.push(`**Model B**: \`${result.modelB}\``);
  if (result.responseB) {
    lines.push(result.responseB);
  } else {
    lines.push(`_Error: ${result.errorB ?? "no response"}_`);
  }

  return lines.join("\n");
}

/** Build the synthesis instruction prompt (command handler injects this into Pi). */
export function buildSynthesisPrompt(
  result: TwinsRunResult,
  options: SynthesisPromptOptions = {},
): string {
  const response1 = result.responseA ?? `[エラー: ${result.errorA ?? "応答なし"}]`;
  const response2 = result.responseB ?? `[エラー: ${result.errorB ?? "応答なし"}]`;
  const mode = options.mode ?? "balanced";
  const instructions = normalizeSynthesisInstructions(options.instructions);
  const lines = [
    "以下の2つの回答を読み、それぞれの最良部分を合成した1つの回答を書いてください。",
    "",
    `--- 回答1 (${result.modelA}) ---`,
    response1,
    "",
    `--- 回答2 (${result.modelB}) ---`,
    response2,
    "",
    "要件:",
    ...getSynthesisRequirements(mode),
  ];

  if (instructions) {
    lines.push(
      "",
      `追加指示 (${SYNTHESIS_INSTRUCTIONS_MAX_LENGTH}文字以内):`,
      instructions,
    );
  }

  return lines.join("\n");
}

export async function synthesizeResponses(
  result: TwinsRunResult,
  registry: TwinsModelRegistry,
  synthesisModelId?: string,
  signal?: AbortSignal,
  options: SynthesisPromptOptions = {},
): Promise<string> {
  const modelId = synthesisModelId ?? result.modelA;
  const synthesisPrompt = buildSynthesisPrompt(result, options);
  const synthesis = await runSingleModel(modelId, synthesisPrompt, registry, signal);

  if (synthesis.error || !synthesis.response) {
    throw new Error(synthesis.error ?? `Synthesis failed for model ${modelId}`);
  }

  return synthesis.response;
}

export function formatTwinsMarkdown(result: TwinsRunResult, synthesis: string): string {
  return [
    formatResponsesMarkdown(result),
    "",
    "**Synthesis**",
    synthesis,
  ].join("\n");
}
