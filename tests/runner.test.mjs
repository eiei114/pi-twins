import assert from "node:assert/strict";
import test from "node:test";

const {
  buildSynthesisPrompt,
  formatResponsesMarkdown,
  runTwins,
  runSingleModel,
} = await import("../lib/runner.ts");

test("runTwins runs both models in parallel via Promise.all", async () => {
  const calls = [];
  const delays = {
    "anthropic/claude-sonnet-4": 30,
    "google/gemini-2.5-pro": 10,
  };

  const runModel = async (fullId) => {
    calls.push(`start:${fullId}`);
    await new Promise((resolve) => setTimeout(resolve, delays[fullId] ?? 0));
    calls.push(`end:${fullId}`);
    return { model: fullId, response: `answer from ${fullId}` };
  };

  const result = await runTwins(
    "hello",
    ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
    {},
    {
      runModel: async (fullId, prompt) => {
        assert.equal(prompt, "hello");
        return runModel(fullId);
      },
    },
  );

  assert.equal(result.responseA, "answer from anthropic/claude-sonnet-4");
  assert.equal(result.responseB, "answer from google/gemini-2.5-pro");
  assert.deepEqual(calls, [
    "start:anthropic/claude-sonnet-4",
    "start:google/gemini-2.5-pro",
    "end:google/gemini-2.5-pro",
    "end:anthropic/claude-sonnet-4",
  ]);
});

test("runTwins returns success and error when one model fails", async () => {
  const result = await runTwins(
    "question",
    ["good/model", "bad/model"],
    {},
    {
      runModel: async (fullId) => {
        if (fullId === "bad/model") {
          return { model: fullId, error: "provider timeout" };
        }
        return { model: fullId, response: "ok" };
      },
    },
  );

  assert.equal(result.responseA, "ok");
  assert.equal(result.errorB, "provider timeout");
  assert.equal(result.responseB, undefined);
});

test("runSingleModel returns error for invalid model id", async () => {
  const result = await runSingleModel("invalid-id", "hello", {
    find: () => undefined,
    getApiKeyAndHeaders: async () => ({ ok: false, error: "unused" }),
  });

  assert.match(result.error || "", /Invalid model id/);
});

test("formatResponsesMarkdown includes successful and failed sides", () => {
  const markdown = formatResponsesMarkdown({
    modelA: "a/model",
    modelB: "b/model",
    prompt: "test",
    responseA: "first",
    errorB: "boom",
  });

  assert.match(markdown, /a\/model/);
  assert.match(markdown, /first/);
  assert.match(markdown, /boom/);
});

test("buildSynthesisPrompt uses the issue template with model names", () => {
  const prompt = buildSynthesisPrompt({
    modelA: "anthropic/claude-sonnet-4",
    modelB: "google/gemini-2.5-pro",
    prompt: "hello",
    responseA: "alpha",
    responseB: "beta",
  });

  assert.match(prompt, /回答1 \(anthropic\/claude-sonnet-4\)/);
  assert.match(prompt, /alpha/);
  assert.match(prompt, /回答2 \(google\/gemini-2.5-pro\)/);
  assert.match(prompt, /beta/);
  assert.match(prompt, /情報を統合し、矛盾を解消してください/);
});

test("buildSynthesisPrompt includes error placeholders when a model fails", () => {
  const prompt = buildSynthesisPrompt({
    modelA: "a/model",
    modelB: "b/model",
    prompt: "hello",
    responseA: "only one",
    errorB: "down",
  });

  assert.match(prompt, /only one/);
  assert.match(prompt, /\[エラー: down\]/);
});
