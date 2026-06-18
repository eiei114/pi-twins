import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const {
  loadConfig,
  getPair,
  configExists,
  writeDefaultConfig,
  ConfigNotFoundError,
} = await import("../lib/config.ts");
const { scanModels, findModelById, groupByProvider } = await import("../lib/scanner.ts");
const { TwinsConfigSchema, TwinsRunToolParametersSchema } = await import("../lib/schema.ts");
const { Check } = await import("typebox/schema");

async function withTempConfig(content, fn) {
  const dir = await mkdtemp(join(tmpdir(), "pi-twins-test-"));
  const configPath = join(dir, "twins.yaml");
  try {
    if (content !== null) {
      await writeFile(configPath, content, "utf8");
    }
    await fn(configPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("TwinsConfigSchema accepts valid pairs", () => {
  const valid = {
    pairs: {
      default: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
      coding: ["openai/gpt-4o", "deepseek/deepseek-v4-pro"],
    },
  };
  assert.equal(Check(TwinsConfigSchema, valid), true);
});

test("TwinsConfigSchema rejects invalid pairs", () => {
  assert.equal(Check(TwinsConfigSchema, { pairs: { default: ["only-one"] } }), false);
  assert.equal(Check(TwinsConfigSchema, {}), false);
});

test("TwinsRunToolParametersSchema accepts prompt and optional pair", () => {
  assert.equal(Check(TwinsRunToolParametersSchema, { prompt: "hello" }), true);
  assert.equal(Check(TwinsRunToolParametersSchema, { prompt: "hello", pair: "default" }), true);
  assert.equal(Check(TwinsRunToolParametersSchema, {}), false);
});

test("loadConfig throws ConfigNotFoundError when file is missing", async () => {
  await withTempConfig(null, async (configPath) => {
    assert.equal(configExists(configPath), false);
    assert.throws(() => loadConfig(configPath), ConfigNotFoundError);
    try {
      loadConfig(configPath);
    } catch (err) {
      assert.ok(err instanceof ConfigNotFoundError);
      assert.match(err.message, /config not found/i);
      assert.match(err.message, /twins:scan/);
      assert.equal(err.configPath, configPath);
    }
  });
});

test("loadConfig reads and validates YAML config", async () => {
  const yaml = `pairs:
  default:
    - anthropic/claude-sonnet-4
    - google/gemini-2.5-pro
`;
  await withTempConfig(yaml, async (configPath) => {
    const config = loadConfig(configPath);
    assert.deepEqual(config.pairs.default, [
      "anthropic/claude-sonnet-4",
      "google/gemini-2.5-pro",
    ]);
  });
});

test("loadConfig rejects invalid YAML shape", async () => {
  const yaml = `pairs:
  default:
    - only-one-model
`;
  await withTempConfig(yaml, async (configPath) => {
    assert.throws(() => loadConfig(configPath), /Invalid pi-twins config/);
  });
});

test("getPair returns named pair from config", async () => {
  const yaml = `pairs:
  default:
    - anthropic/claude-sonnet-4
    - google/gemini-2.5-pro
  coding:
    - openai/gpt-4o
    - deepseek/deepseek-v4-pro
`;
  await withTempConfig(yaml, async (configPath) => {
    assert.deepEqual(getPair("coding", configPath), ["openai/gpt-4o", "deepseek/deepseek-v4-pro"]);
    assert.deepEqual(getPair(undefined, configPath), [
      "anthropic/claude-sonnet-4",
      "google/gemini-2.5-pro",
    ]);
  });
});

test("getPair throws when pair name is missing", async () => {
  const yaml = `pairs:
  default:
    - anthropic/claude-sonnet-4
    - google/gemini-2.5-pro
`;
  await withTempConfig(yaml, async (configPath) => {
    assert.throws(() => getPair("missing", configPath), /Pair "missing" not found/);
  });
});

test("writeDefaultConfig creates a readable config file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-twins-write-"));
  const configPath = join(dir, "nested", "twins.yaml");
  try {
    writeDefaultConfig(configPath);
    assert.equal(configExists(configPath), true);
    const config = loadConfig(configPath);
    assert.ok(config.pairs.default);
    assert.equal(config.pairs.default.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scanner returns known models", () => {
  const models = scanModels();
  assert.ok(models.length > 0);
  assert.ok(models.every((m) => m.id.includes("/")));
});

test("findModelById returns matching model", () => {
  const model = findModelById("anthropic/claude-sonnet-4");
  assert.ok(model);
  assert.equal(model?.displayName, "Claude 4 Sonnet");
  assert.equal(model?.provider, "anthropic");
});

test("findModelById returns undefined for unknown model", () => {
  assert.equal(findModelById("nonexistent/model"), undefined);
});

test("groupByProvider groups models by provider", () => {
  const groups = groupByProvider();
  assert.ok(groups.anthropic?.length > 0);
  assert.ok(groups.google?.length > 0);
  assert.ok(groups.openai?.length > 0);
  assert.ok(groups.deepseek?.length > 0);
  for (const models of Object.values(groups)) {
    assert.ok(models.every((m) => m.provider === models[0].provider));
  }
});
