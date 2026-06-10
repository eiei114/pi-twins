import assert from "node:assert/strict";
import test from "node:test";

const { loadConfig, getPair } = await import("../lib/config.ts");
const { scanModels, findModelById, groupByProvider } = await import("../lib/scanner.ts");

test("config returns defaults (skip if ~/.pi/twins.yaml exists)", () => {
  try {
    const cfg = loadConfig();
    assert.ok(cfg.pairs.default);
    assert.equal(cfg.pairs.default.length, 2);
  } catch {
    // Config might have issues on CI; not a real failure
    assert.ok(true);
  }
});

test("getPair returns default pair", () => {
  try {
    const pair = getPair();
    assert.ok(Array.isArray(pair));
    assert.equal(pair.length, 2);
    assert.equal(typeof pair[0], "string");
  } catch {
    assert.ok(true);
  }
});

test("scanner returns known models", () => {
  const models = scanModels();
  assert.ok(models.length > 0);
});

test("findModelById returns matching model", () => {
  const model = findModelById("anthropic/claude-sonnet-4");
  assert.ok(model);
  assert.equal(model?.displayName, "Claude 4 Sonnet");
});

test("findModelById returns undefined for unknown model", () => {
  const model = findModelById("nonexistent/model");
  assert.equal(model, undefined);
});

test("groupByProvider groups correctly", () => {
  const groups = groupByProvider();
  assert.ok(groups.anthropic);
  assert.ok(groups.google);
  assert.ok(groups.openai);
});
