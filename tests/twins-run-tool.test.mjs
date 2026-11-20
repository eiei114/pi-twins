import assert from "node:assert/strict";
import { mock, test } from "node:test";

let completeModel;
mock.module("@earendil-works/pi-ai/compat", {
  exports: {
    completeSimple: (...args) => completeModel(...args),
  },
});
mock.module("@earendil-works/pi-coding-agent", {
  exports: {
    defineTool: (tool) => tool,
  },
});

const {
  buildTwinsRunSuccessResult,
  buildTwinsRunErrorResult,
  executeTwinsRun,
  resolveSynthesisOptions,
} = await import("../lib/twins-run-tool.ts");

test("buildTwinsRunSuccessResult returns typed text content and pair details", () => {
  const result = {
    modelA: "anthropic/claude-sonnet-4",
    modelB: "google/gemini-2.5-pro",
    prompt: "hello",
    responseA: "alpha",
    responseB: "beta",
  };
  const pair = ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"];

  const toolResult = buildTwinsRunSuccessResult(result, pair, "merged");

  assert.equal(toolResult.isError, undefined);
  assert.equal(toolResult.content.length, 1);
  assert.equal(toolResult.content[0].type, "text");
  assert.match(toolResult.content[0].text, /alpha/);
  assert.match(toolResult.content[0].text, /beta/);
  assert.match(toolResult.content[0].text, /merged/);
  assert.deepEqual(toolResult.details, {
    pair,
    modelA: result.modelA,
    modelB: result.modelB,
  });
});

test("buildTwinsRunErrorResult marks isError and returns error details", () => {
  const toolResult = buildTwinsRunErrorResult("Both models failed");

  assert.equal(toolResult.isError, true);
  assert.equal(toolResult.content[0].type, "text");
  assert.match(toolResult.content[0].text, /Both models failed/);
  assert.deepEqual(toolResult.details, { error: true });
});

test("buildTwinsRunErrorResult surfaces pair-resolution failure messaging", () => {
  const message = 'Pair "missing" not found in config. Available: default, coding';
  const toolResult = buildTwinsRunErrorResult(message);

  assert.equal(toolResult.isError, true);
  assert.equal(
    toolResult.content[0].text,
    `pi-twins error: ${message}`,
  );
  assert.deepEqual(toolResult.details, { error: true });
});

test("twins_run returns an unknown-pair error without calling any model", async () => {
  const modelLookups = [];
  const config = {
    pairs: {
      default: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
      coding: ["openai/gpt-4o", "deepseek/deepseek-r1"],
    },
  };

  const result = await executeTwinsRun(
    { prompt: "test", pair: "codng" },
    new AbortController().signal,
    { find(modelId) { modelLookups.push(modelId); } },
    config,
  );

  assert.equal(result.isError, true);
  assert.equal(
    result.content[0].text,
    'pi-twins error: Pair "codng" not found in config. Available: default, coding',
  );
  assert.deepEqual(modelLookups, []);
});

test("twins_run preserves an exact explicit pair name with surrounding spaces", async () => {
  const modelLookups = [];
  const config = {
    pairs: {
      default: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
      coding: ["openai/gpt-4o", "deepseek/deepseek-r1"],
      " coding ": ["openai/o3", "google/gemini-2.5-flash"],
    },
  };

  const result = await executeTwinsRun(
    { prompt: "test", pair: " coding " },
    new AbortController().signal,
    {
      find(provider, modelId) {
        modelLookups.push(`${provider}/${modelId}`);
      },
    },
    config,
  );

  assert.equal(result.isError, true);
  assert.deepEqual(modelLookups, ["openai/o3", "google/gemini-2.5-flash"]);
});

async function runTwinsToolWithFailures(failedModelIds) {
  const calls = [];
  completeModel = async (model, params) => {
    const prompt = params.messages[0].content[0].text;
    const isSynthesis = prompt.includes("以下の2つの回答");
    calls.push({ modelId: model.id, isSynthesis });

    if (!isSynthesis && failedModelIds.includes(model.id)) {
      throw new Error(`${model.id} unavailable`);
    }

    return {
      stopReason: "stop",
      content: [{ type: "text", text: isSynthesis ? `Synthesis by ${model.id}` : `Answer from ${model.id}` }],
    };
  };

  const modelRegistry = {
    find(provider, modelId) {
      return { provider, id: modelId };
    },
    async getApiKeyAndHeaders() {
      return { ok: true, apiKey: "mock-key" };
    },
  };
  const config = {
    pairs: { default: ["test/model-a", "test/model-b"] },
  };

  const result = await executeTwinsRun(
    { prompt: "question" },
    new AbortController().signal,
    modelRegistry,
    config,
  );

  return { result, calls };
}

test("twins_run synthesizes partial results with the responding second model", async () => {
  const { result, calls } = await runTwinsToolWithFailures(["model-a"]);

  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /Answer from model-b/);
  assert.match(result.content[0].text, /model-a unavailable/);
  assert.match(result.content[0].text, /Synthesis by model-b/);
  assert.deepEqual(calls.filter((call) => call.isSynthesis).map((call) => call.modelId), ["model-b"]);
});

test("twins_run keeps using the first model when the second model fails", async () => {
  const { result, calls } = await runTwinsToolWithFailures(["model-b"]);

  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /Answer from model-a/);
  assert.match(result.content[0].text, /model-b unavailable/);
  assert.match(result.content[0].text, /Synthesis by model-a/);
  assert.deepEqual(calls.filter((call) => call.isSynthesis).map((call) => call.modelId), ["model-a"]);
});

test("twins_run returns the combined error without synthesizing when both models fail", async () => {
  const { result, calls } = await runTwinsToolWithFailures(["model-a", "model-b"]);

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /test\/model-a: model-a unavailable/);
  assert.match(result.content[0].text, /test\/model-b: model-b unavailable/);
  assert.equal(calls.some((call) => call.isSynthesis), false);
});

test("resolveSynthesisOptions merges config defaults with per-call overrides", () => {
  const config = {
    pairs: {
      default: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
    },
    synthesis: {
      language: "en",
      mode: "decision",
      instructions: "Prefer concrete next steps.",
    },
  };

  assert.deepEqual(resolveSynthesisOptions(config), {
    language: "en",
    mode: "decision",
    instructions: "Prefer concrete next steps.",
  });

  assert.deepEqual(
    resolveSynthesisOptions(config, {
      synthesisLanguage: "ja",
      synthesisMode: "critique",
      synthesisInstructions: "Call out weak evidence.",
    }),
    {
      language: "ja",
      mode: "critique",
      instructions: "Call out weak evidence.",
    },
  );

  assert.equal(resolveSynthesisOptions({ ...config, synthesis: { mode: "decision" } }).language, "ja");
  assert.equal(
    resolveSynthesisOptions(config, { synthesisLanguage: "en" }).language,
    "en",
  );
});
