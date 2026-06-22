import {
  completeSimple,
  type Api,
  type Model,
  type UserMessage,
} from "@earendil-works/pi-ai";

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
export function buildSynthesisPrompt(result: TwinsRunResult): string {
  const response1 = result.responseA ?? `[エラー: ${result.errorA ?? "応答なし"}]`;
  const response2 = result.responseB ?? `[エラー: ${result.errorB ?? "応答なし"}]`;

  return [
    "以下の2つの回答を読み、それぞれの最良部分を合成した1つの回答を書いてください。",
    "",
    `--- 回答1 (${result.modelA}) ---`,
    response1,
    "",
    `--- 回答2 (${result.modelB}) ---`,
    response2,
    "",
    "要件:",
    "- 情報を統合し、矛盾を解消してください",
    "- 冗長な部分は削除してください",
    "- 1つの自然な回答として書いてください",
  ].join("\n");
}

export async function synthesizeResponses(
  result: TwinsRunResult,
  registry: TwinsModelRegistry,
  synthesisModelId?: string,
  signal?: AbortSignal,
): Promise<string> {
  const modelId = synthesisModelId ?? result.modelA;
  const synthesisPrompt = buildSynthesisPrompt(result);
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
