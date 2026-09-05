import assert from "node:assert/strict";
import test from "node:test";

const {
  buildTwinsRunSuccessResult,
  buildTwinsRunErrorResult,
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

test("resolveSynthesisOptions merges config defaults with per-call overrides", () => {
  const config = {
    pairs: {
      default: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
    },
    synthesis: {
      mode: "decision",
      instructions: "Prefer concrete next steps.",
    },
  };

  assert.deepEqual(resolveSynthesisOptions(config), {
    mode: "decision",
    instructions: "Prefer concrete next steps.",
  });

  assert.deepEqual(
    resolveSynthesisOptions(config, {
      synthesisMode: "critique",
      synthesisInstructions: "Call out weak evidence.",
    }),
    {
      mode: "critique",
      instructions: "Call out weak evidence.",
    },
  );
});
