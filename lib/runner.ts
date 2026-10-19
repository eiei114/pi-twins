import {
  type Api,
  type Model,
  type ProviderHeaders,
  type UserMessage,
} from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import {
  SYNTHESIS_INSTRUCTIONS_MAX_LENGTH,
  SYNTHESIS_LANGUAGES,
  type SynthesisLanguage,
  type SynthesisMode,
} from "./schema.ts";

export interface TwinsModelRegistry {
  find(provider: string, modelId: string): Model<Api> | undefined;
  getApiKeyAndHeaders(model: Model<Api>): Promise<
    | { ok: true; apiKey?: string; headers?: ProviderHeaders }
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
  language?: SynthesisLanguage;
  mode?: SynthesisMode;
  instructions?: string;
}

export interface RunModelOptions {
  signal?: AbortSignal;
  runModel?: (fullId: string, prompt: string, registry: TwinsModelRegistry, signal?: AbortSignal) => Promise<ModelRunResult>;
}

function splitModelId(fullId: string): [string, string] {
  const idx = fullId.indexOf("/");
  if (idx === -1 || idx === 0 || idx === fullId.length - 1) {
    throw new Error(
      `Invalid model id "${fullId}" (expected provider/model-id). Run /twins:scan and update ~/.pi/twins.yaml.`,
    );
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
    return {
      model: fullId,
      error: `Model not found: ${fullId}. Run /twins:scan and update ~/.pi/twins.yaml.`,
    };
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

const BALANCED_SYNTHESIS_REQUIREMENTS: Record<SynthesisLanguage, string[]> = {
  ja: [
    "- 情報を統合し、矛盾を解消してください",
    "- 冗長な部分は削除してください",
    "- 1つの自然な回答として書いてください",
  ],
  en: [
    "- Integrate the information and resolve contradictions.",
    "- Remove redundant content.",
    "- Write one natural, cohesive answer.",
  ],
};

const SYNTHESIS_MODE_REQUIREMENTS: Record<SynthesisLanguage, Record<SynthesisMode, string[]>> = {
  ja: {
    balanced: BALANCED_SYNTHESIS_REQUIREMENTS.ja,
    decision: [
      ...BALANCED_SYNTHESIS_REQUIREMENTS.ja,
      "- 最終的な推奨判断を明確に示してください",
      "- 判断理由と主要なトレードオフを短く説明してください",
      "- 次に取るべき具体的なアクションを含めてください",
    ],
    critique: [
      ...BALANCED_SYNTHESIS_REQUIREMENTS.ja,
      "- 両回答の強みと弱みを批判的に評価してください",
      "- 不確かな点や検証が必要な前提を明示してください",
      "- 改善された回答として不足を補ってください",
    ],
    concise: [
      ...BALANCED_SYNTHESIS_REQUIREMENTS.ja,
      "- 要点だけを簡潔にまとめてください",
      "- 可能な限り短く、余分な前置きや繰り返しを避けてください",
      "- 必要な場合のみ箇条書きを使ってください",
    ],
  },
  en: {
    balanced: BALANCED_SYNTHESIS_REQUIREMENTS.en,
    decision: [
      ...BALANCED_SYNTHESIS_REQUIREMENTS.en,
      "- Clearly state the final recommendation.",
      "- Briefly explain the rationale and key trade-offs.",
      "- Include concrete next steps.",
    ],
    critique: [
      ...BALANCED_SYNTHESIS_REQUIREMENTS.en,
      "- Critically assess the strengths and weaknesses of both responses.",
      "- Identify uncertainties and assumptions that need verification.",
      "- Fill in the gaps with an improved answer.",
    ],
    concise: [
      ...BALANCED_SYNTHESIS_REQUIREMENTS.en,
      "- Summarize only the key points.",
      "- Keep it as short as possible, avoiding unnecessary preamble and repetition.",
      "- Use bullet points only when useful.",
    ],
  },
};

const SYNTHESIS_LANGUAGE_TEXT: Record<SynthesisLanguage, {
  preamble: string;
  responseLabel: (index: number, model: string) => string;
  errorLabel: string;
  missingResponse: string;
  requirementsLabel: string;
  finalLanguageInstruction: string;
  additionalInstructionsLabel: (maxLength: number) => string;
}> = {
  ja: {
    preamble: "以下の2つの回答を読み、それぞれの最良部分を合成した1つの回答を書いてください。",
    responseLabel: (index, model) => `--- 回答${index} (${model}) ---`,
    errorLabel: "エラー",
    missingResponse: "応答なし",
    requirementsLabel: "要件:",
    finalLanguageInstruction: "- 最終回答は日本語で書いてください",
    additionalInstructionsLabel: (maxLength) => `追加指示 (${maxLength}文字以内):`,
  },
  en: {
    preamble: "Read the following two responses and write one answer synthesizing the best parts of each.",
    responseLabel: (index, model) => `--- Response ${index} (${model}) ---`,
    errorLabel: "Error",
    missingResponse: "no response",
    requirementsLabel: "Requirements:",
    finalLanguageInstruction: "- Write the final answer in English.",
    additionalInstructionsLabel: (maxLength) => `Additional instructions (up to ${maxLength} characters):`,
  },
};

function resolveSynthesisLanguage(language?: SynthesisLanguage): SynthesisLanguage {
  const resolved = language ?? "ja";
  if (!(SYNTHESIS_LANGUAGES as readonly string[]).includes(resolved)) {
    throw new Error(`Unknown synthesis language: ${resolved}. Expected one of: ${SYNTHESIS_LANGUAGES.join(", ")}`);
  }
  return resolved;
}

function getSynthesisRequirements(mode: SynthesisMode, language: SynthesisLanguage): string[] {
  const requirements = SYNTHESIS_MODE_REQUIREMENTS[language][mode];
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

export function formatBothModelsFailedMessage(result: TwinsRunResult): string {
  return (
    [
      result.errorA ? `${result.modelA}: ${result.errorA}` : undefined,
      result.errorB ? `${result.modelB}: ${result.errorB}` : undefined,
    ]
      .filter(Boolean)
      .join("; ") || "Both models failed"
  );
}

/** Build the synthesis instruction prompt (command handler injects this into Pi). */
export function buildSynthesisPrompt(
  result: TwinsRunResult,
  options: SynthesisPromptOptions = {},
): string {
  const language = resolveSynthesisLanguage(options.language);
  const text = SYNTHESIS_LANGUAGE_TEXT[language];
  const response1 = result.responseA ?? `[${text.errorLabel}: ${result.errorA ?? text.missingResponse}]`;
  const response2 = result.responseB ?? `[${text.errorLabel}: ${result.errorB ?? text.missingResponse}]`;
  const mode = options.mode ?? "balanced";
  const instructions = normalizeSynthesisInstructions(options.instructions);
  const lines = [
    text.preamble,
    "",
    text.responseLabel(1, result.modelA),
    response1,
    "",
    text.responseLabel(2, result.modelB),
    response2,
    "",
    text.requirementsLabel,
    ...getSynthesisRequirements(mode, language),
  ];

  if (instructions) {
    lines.push(
      "",
      text.additionalInstructionsLabel(SYNTHESIS_INSTRUCTIONS_MAX_LENGTH),
      instructions,
    );
  }

  lines.push(text.finalLanguageInstruction);
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
