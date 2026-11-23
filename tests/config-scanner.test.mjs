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
const {
  scanModels,
  findModelById,
  groupByProvider,
  groupModelsByProvider,
  scanRegistryModels,
  formatScanMessage,
} = await import("../lib/scanner.ts");
const {
  SYNTHESIS_INSTRUCTIONS_MAX_LENGTH,
  TwinsConfigSchema,
  TwinsRunToolParametersSchema,
} = await import("../lib/schema.ts");
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
      coding: ["openai/gpt-4o", "deepseek/deepseek-r1"],
    },
  };
  assert.equal(Check(TwinsConfigSchema, valid), true);
  assert.equal(
    Check(TwinsConfigSchema, {
      pairs: valid.pairs,
      synthesis: { language: "ja" },
    }),
    true,
  );
});

test("TwinsConfigSchema accepts optional synthesis defaults", () => {
  const valid = {
    pairs: {
      default: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
    },
    synthesis: {
      language: "en",
      mode: "decision",
      instructions: "Prefer an actionable recommendation.",
    },
  };
  assert.equal(Check(TwinsConfigSchema, valid), true);
});

test("TwinsConfigSchema rejects unknown synthesis modes and overlong instructions", () => {
  const base = {
    pairs: {
      default: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
    },
  };

  assert.equal(Check(TwinsConfigSchema, { ...base, synthesis: { mode: "verbose" } }), false);
  assert.equal(Check(TwinsConfigSchema, { ...base, synthesis: { language: "fr" } }), false);
  assert.equal(
    Check(TwinsConfigSchema, {
      ...base,
      synthesis: { instructions: "x".repeat(SYNTHESIS_INSTRUCTIONS_MAX_LENGTH + 1) },
    }),
    false,
  );
});

test("TwinsConfigSchema rejects invalid pairs", () => {
  assert.equal(Check(TwinsConfigSchema, { pairs: { default: ["only-one"] } }), false);
  assert.equal(Check(TwinsConfigSchema, {}), false);
});

test("TwinsRunToolParametersSchema accepts prompt and optional synthesis controls", () => {
  assert.equal(Check(TwinsRunToolParametersSchema, { prompt: "hello" }), true);
  assert.equal(Check(TwinsRunToolParametersSchema, { prompt: "hello", pair: "default" }), true);
  assert.equal(Check(TwinsRunToolParametersSchema, { prompt: "hello", synthesisLanguage: "ja" }), true);
  assert.equal(
    Check(TwinsRunToolParametersSchema, {
      prompt: "hello",
      synthesisMode: "critique",
      synthesisLanguage: "en",
      synthesisInstructions: "Call out weak evidence.",
    }),
    true,
  );
  assert.equal(Check(TwinsRunToolParametersSchema, {}), false);
  assert.equal(Check(TwinsRunToolParametersSchema, { prompt: "hello", synthesisMode: "verbose" }), false);
  assert.equal(Check(TwinsRunToolParametersSchema, { prompt: "hello", synthesisLanguage: "fr" }), false);
  assert.equal(
    Check(TwinsRunToolParametersSchema, {
      prompt: "hello",
      synthesisInstructions: "x".repeat(SYNTHESIS_INSTRUCTIONS_MAX_LENGTH + 1),
    }),
    false,
  );
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
    assert.equal(config.synthesis, undefined);
  });
  await withTempConfig(`${yaml}synthesis: {}\n`, async (configPath) => {
    assert.deepEqual(loadConfig(configPath).synthesis, {});
  });
});

test("loadConfig rejects an incomplete pair with a repair path", async () => {
  const yaml = `pairs:
  default:
    - only-one-model
`;
  await withTempConfig(yaml, async (configPath) => {
    assert.throws(
      () => loadConfig(configPath),
      (error) => {
        assert.match(error.message, /Invalid pi-twins config/);
        assert.match(error.message, /expected a "pairs" object/);
        assert.match(error.message, /\/twins:scan/);
        assert.ok(error.message.includes(`update ${configPath}`));
        assert.doesNotMatch(error.message, /~\/\.pi\/twins\.yaml/);
        return true;
      },
    );
  });
});

test("loadConfig reports clear synthesis validation paths", async () => {
  const invalidMode = `pairs:
  default:
    - anthropic/claude-sonnet-4
    - google/gemini-2.5-pro
synthesis:
  mode: verbose
`;
  await withTempConfig(invalidMode, async (configPath) => {
    assert.throws(() => loadConfig(configPath), /expected "synthesis\.mode" to be one of:/);
  });

  const invalidLanguage = `pairs:
  default:
    - anthropic/claude-sonnet-4
    - google/gemini-2.5-pro
synthesis:
  language: fr
`;
  await withTempConfig(invalidLanguage, async (configPath) => {
    assert.throws(() => loadConfig(configPath), /synthesis\.language.*ja, en/);
  });

  const overlongInstructions = `pairs:
  default:
    - anthropic/claude-sonnet-4
    - google/gemini-2.5-pro
synthesis:
  instructions: ${"x".repeat(SYNTHESIS_INSTRUCTIONS_MAX_LENGTH + 1)}
`;
  await withTempConfig(overlongInstructions, async (configPath) => {
    assert.throws(
      () => loadConfig(configPath),
      new RegExp(`expected "synthesis\\.instructions" to be ${SYNTHESIS_INSTRUCTIONS_MAX_LENGTH} characters or fewer`),
    );
  });
});

for (const [field, value] of [["mode", "true"], ["instructions", "[review, summarize]"]]) {
  test(`loadConfig reports the expected type for synthesis.${field}`, async () => {
    const yaml = `pairs:
  default:
    - anthropic/claude-sonnet-4
    - google/gemini-2.5-pro
synthesis:
  ${field}: ${value}
`;
    await withTempConfig(yaml, async (configPath) => {
      assert.throws(() => loadConfig(configPath), {
        message: `Invalid pi-twins config at ${configPath}: expected "synthesis.${field}" to be a string`,
      });
    });
  });
}

test("getPair returns named pair from config", async () => {
  const yaml = `pairs:
  default:
    - anthropic/claude-sonnet-4
    - google/gemini-2.5-pro
  coding:
    - openai/gpt-4o
    - deepseek/deepseek-r1
`;
  await withTempConfig(yaml, async (configPath) => {
    assert.deepEqual(getPair("coding", configPath), ["openai/gpt-4o", "deepseek/deepseek-r1"]);
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
  coding:
    - openai/gpt-4o
    - deepseek/deepseek-r1
`;
  await withTempConfig(yaml, async (configPath) => {
    assert.throws(
      () => getPair("missing", configPath),
      (error) => {
        assert.equal(
          error.message,
          'Pair "missing" not found in config. Available: default, coding',
        );
        return true;
      },
    );
  });
});

test("getPair failure message names default when no pair name is given", async () => {
  const yaml = `pairs:
  coding:
    - openai/gpt-4o
    - deepseek/deepseek-r1
`;
  await withTempConfig(yaml, async (configPath) => {
    assert.throws(
      () => getPair(undefined, configPath),
      (error) => {
        assert.equal(
          error.message,
          'Pair "default" not found in config. Available: coding',
        );
        return true;
      },
    );
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

test("scanner catalog excludes fictional or duplicate model IDs", () => {
  const ids = scanModels().map((model) => model.id);
  assert.ok(
    ids.includes("deepseek/deepseek-r1"),
    "scanner catalog should retain deepseek/deepseek-r1",
  );
  const bannedIds = [
    "deepseek/deepseek-v4-pro",
    "anthropic/claude-sonnet-4-20250514",
  ];

  for (const bannedId of bannedIds) {
    assert.equal(
      ids.includes(bannedId),
      false,
      `scanner catalog should not include ${bannedId}`,
    );
  }

  assert.equal(new Set(ids).size, ids.length, "scanner catalog should not contain duplicate IDs");
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

test("groupModelsByProvider groups and sorts registry models", () => {
  const groups = groupModelsByProvider([
    { provider: "zeta", id: "z-model", name: "Z Model" },
    { provider: "alpha", id: "z-model", name: "Alpha Z" },
    { provider: "alpha", id: "a-model", name: "Alpha A" },
  ]);

  assert.deepEqual(Object.keys(groups), ["alpha", "zeta"]);
  assert.deepEqual(groups.alpha?.map(({ id, displayName }) => [id, displayName]), [
    ["alpha/a-model", "Alpha A"],
    ["alpha/z-model", "Alpha Z"],
  ]);
  assert.deepEqual(groups.zeta?.map((model) => model.id), ["zeta/z-model"]);
});

test("groupModelsByProvider de-duplicates IDs deterministically", () => {
  const groups = groupModelsByProvider([
    { provider: "openai", id: "gpt-x", name: "Zulu label" },
    { provider: "openai", id: "gpt-a", name: "GPT A" },
    { provider: "openai", id: "gpt-x", name: "Alpha label" },
  ]);

  assert.deepEqual(groups.openai?.map(({ id, displayName }) => [id, displayName]), [
    ["openai/gpt-a", "GPT A"],
    ["openai/gpt-x", "Alpha label"],
  ]);
});

test("scanRegistryModels uses registry models when available", () => {
  const result = scanRegistryModels({
    getAvailable: () => [
      { provider: "openai", id: "gpt-4.1", name: "GPT 4.1" },
      { provider: "anthropic", id: "sonnet", name: "Sonnet" },
    ],
  });

  assert.equal(result.usedFallback, false);
  assert.equal(result.fallbackReason, null);
  assert.deepEqual(Object.keys(result.groups), ["anthropic", "openai"]);
});

test("scanRegistryModels falls back to curated examples for an empty registry", () => {
  const result = scanRegistryModels({ getAvailable: () => [] });

  assert.equal(result.usedFallback, true);
  assert.equal(result.fallbackReason, "empty");
  assert.deepEqual(result.groups, groupByProvider());
});

test("scanRegistryModels falls back to curated examples when the registry throws", () => {
  const result = scanRegistryModels({
    getAvailable: () => {
      throw new Error("registry unavailable");
    },
  });

  assert.equal(result.usedFallback, true);
  assert.equal(result.fallbackReason, "unavailable");
  assert.deepEqual(result.groups, groupByProvider());
});

test("scan output distinguishes an empty registry from a registry failure", () => {
  const emptyOutput = formatScanMessage(scanRegistryModels({ getAvailable: () => [] }));
  assert.match(emptyOutput, /no authenticated models found/i);
  assert.match(emptyOutput, /Configure\/authenticate a provider/i);

  const unavailableOutput = formatScanMessage(
    scanRegistryModels({
      getAvailable: () => {
        throw new Error("registry unavailable");
      },
    }),
  );
  assert.match(unavailableOutput, /model registry is unavailable/i);
  assert.match(unavailableOutput, /check Pi's registry\/session and retry/i);
  assert.match(unavailableOutput, /does not indicate that provider authentication is missing/i);
  assert.doesNotMatch(unavailableOutput, /no authenticated models found/i);
});
