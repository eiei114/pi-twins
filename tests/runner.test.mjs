import assert from "node:assert/strict";
import test from "node:test";

const {
  buildSynthesisPrompt,
  formatResponsesMarkdown,
  runTwins,
  runSingleModel,
} = await import("../lib/runner.ts");
const { SYNTHESIS_INSTRUCTIONS_MAX_LENGTH } = await import("../lib/schema.ts");

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
  assert.match(prompt, /冗長な部分は削除してください/);
  assert.match(prompt, /1つの自然な回答として書いてください/);
});

const synthesisResult = {
  modelA: "a/model",
  modelB: "b/model",
  prompt: "hello",
  responseA: "alpha",
  responseB: "beta",
};

test("buildSynthesisPrompt adds decision mode requirements", () => {
  const prompt = buildSynthesisPrompt(synthesisResult, { mode: "decision" });

  assert.match(prompt, /最終的な推奨判断を明確に示してください/);
  assert.match(prompt, /主要なトレードオフ/);
  assert.match(prompt, /具体的なアクション/);
});

test("buildSynthesisPrompt adds critique mode requirements", () => {
  const prompt = buildSynthesisPrompt(synthesisResult, { mode: "critique" });

  assert.match(prompt, /強みと弱みを批判的に評価してください/);
  assert.match(prompt, /検証が必要な前提/);
  assert.match(prompt, /不足を補ってください/);
});

test("buildSynthesisPrompt adds concise mode requirements", () => {
  const prompt = buildSynthesisPrompt(synthesisResult, { mode: "concise" });

  assert.match(prompt, /要点だけを簡潔にまとめてください/);
  assert.match(prompt, /短く、余分な前置きや繰り返しを避けてください/);
  assert.match(prompt, /必要な場合のみ箇条書き/);
});

test("buildSynthesisPrompt includes bounded instructions only when non-blank", () => {
  const withInstructions = buildSynthesisPrompt(synthesisResult, {
    instructions: "  Prefer numbered next steps.  ",
  });
  const withoutInstructions = buildSynthesisPrompt(synthesisResult, { instructions: "   \n\t  " });

  assert.match(withInstructions, /追加指示/);
  assert.match(withInstructions, /Prefer numbered next steps\./);
  assert.doesNotMatch(withoutInstructions, /追加指示/);
});

test("buildSynthesisPrompt rejects overlong synthesis instructions with a clear limit", () => {
  assert.throws(
    () => buildSynthesisPrompt(synthesisResult, {
      instructions: "x".repeat(SYNTHESIS_INSTRUCTIONS_MAX_LENGTH + 1),
    }),
    new RegExp(`${SYNTHESIS_INSTRUCTIONS_MAX_LENGTH} characters or fewer`),
  );
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
