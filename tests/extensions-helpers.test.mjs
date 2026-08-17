import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const { resolvePair, ensureConfig } = await import("../lib/extension-helpers.ts");
const { configExists } = await import("../lib/config.ts");
const { DEFAULT_PAIR_NAME } = await import("../lib/schema.ts");

function makeConfig(pairs) {
  return { pairs };
}

function makeUi(confirmResult = true) {
  const notifications = [];
  const confirms = [];
  return {
    notifications,
    confirms,
    ui: {
      notify: (message, level) => notifications.push({ message, level }),
      confirm: async (title, message) => {
        confirms.push({ title, message });
        return confirmResult;
      },
    },
  };
}

test("resolvePair returns named pair when pairName exists", () => {
  const config = makeConfig({
    default: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
    coding: ["openai/gpt-4o", "deepseek/deepseek-r1"],
  });

  assert.deepEqual(resolvePair(config, "coding"), ["openai/gpt-4o", "deepseek/deepseek-r1"]);
});

test("resolvePair falls back to default pair when pairName is omitted", () => {
  const config = makeConfig({
    [DEFAULT_PAIR_NAME]: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
    coding: ["openai/gpt-4o", "deepseek/deepseek-r1"],
  });

  assert.deepEqual(resolvePair(config), [
    "anthropic/claude-sonnet-4",
    "google/gemini-2.5-pro",
  ]);
});

test("resolvePair falls back to default pair when pairName is unknown", () => {
  const config = makeConfig({
    [DEFAULT_PAIR_NAME]: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
    coding: ["openai/gpt-4o", "deepseek/deepseek-r1"],
  });

  assert.deepEqual(resolvePair(config, "missing"), [
    "anthropic/claude-sonnet-4",
    "google/gemini-2.5-pro",
  ]);
});

test("resolvePair falls back to first pair when default pair is absent", () => {
  const config = makeConfig({
    coding: ["openai/gpt-4o", "deepseek/deepseek-r1"],
    review: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
  });

  assert.deepEqual(resolvePair(config), ["openai/gpt-4o", "deepseek/deepseek-r1"]);
});

test("resolvePair throws when config has no pairs", () => {
  const config = makeConfig({});

  assert.throws(() => resolvePair(config), /No pairs found/);
});

test("ensureConfig returns true when config already exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-twins-ensure-"));
  const configPath = join(dir, "twins.yaml");
  const { ui, notifications, confirms } = makeUi();

  try {
    const { writeDefaultConfig } = await import("../lib/config.ts");
    writeDefaultConfig(configPath);
    assert.equal(configExists(configPath), true);

    const ok = await ensureConfig({ ui }, configPath);
    assert.equal(ok, true);
    assert.deepEqual(notifications, []);
    assert.deepEqual(confirms, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ensureConfig returns false when user declines creating config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-twins-ensure-"));
  const configPath = join(dir, "twins.yaml");
  const { ui, notifications, confirms } = makeUi(false);

  try {
    assert.equal(configExists(configPath), false);

    const ok = await ensureConfig({ ui }, configPath);
    assert.equal(ok, false);
    assert.equal(confirms.length, 1);
    assert.equal(notifications.length, 2);
    assert.match(notifications[0].message, /No .*twins\.yaml found/);
    assert.match(notifications[1].message, /twins:scan/);
    assert.equal(configExists(configPath), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ensureConfig creates config when user accepts prompt", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-twins-ensure-"));
  const configPath = join(dir, "twins.yaml");
  const { ui, notifications, confirms } = makeUi(true);

  try {
    assert.equal(configExists(configPath), false);

    const ok = await ensureConfig({ ui }, configPath);
    assert.equal(ok, true);
    assert.equal(confirms.length, 1);
    assert.equal(configExists(configPath), true);
    assert.match(notifications.at(-1).message, new RegExp(`Created default config at: ${configPath.replace(/\\/g, "\\\\")}`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
