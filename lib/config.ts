import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import type { TwinsConfig } from "./schema.ts";
import { DEFAULT_CONFIG, DEFAULT_PAIR_NAME } from "./schema.ts";

const CONFIG_DIR = join(homedir(), ".pi");
const CONFIG_PATH = join(CONFIG_DIR, "twins.yaml");

/** Read and parse twins config. Returns default config if file doesn't exist. */
export function loadConfig(): TwinsConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG, pairs: { ...DEFAULT_CONFIG.pairs } };
  }

  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = parse(raw);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Config file must contain a YAML object");
    }

    const pairs = parsed.pairs;
    if (!pairs || typeof pairs !== "object") {
      throw new Error('Config must have a "pairs" key with model pair definitions');
    }

    const result: TwinsConfig = { pairs: {} };

    for (const [name, models] of Object.entries(pairs)) {
      if (!Array.isArray(models) || models.length < 2) {
        throw new Error(`Pair "${name}" must have at least 2 model identifiers`);
      }
      result.pairs[name] = [String(models[0]), String(models[1])];
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load ${CONFIG_PATH}: ${msg}`);
  }
}

/** Get a specific pair by name, falling back to default. */
export function getPair(pairName?: string): [string, string] {
  const config = loadConfig();
  const name = pairName || DEFAULT_PAIR_NAME;
  const pair = config.pairs[name];
  if (!pair) {
    throw new Error(`Pair "${name}" not found in config. Available: ${Object.keys(config.pairs).join(", ")}`);
  }
  return pair;
}

/** Check if config file exists. */
export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

/** Get config file path for display. */
export function getConfigPath(): string {
  return CONFIG_PATH;
}

/** Create default config file with a template. */
export function writeDefaultConfig(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const template = `# pi-twins configuration
# Define model pairs to run in parallel.
pairs:
  default:
    - anthropic/claude-sonnet-4
    - google/gemini-2.5-pro
  coding:
    - anthropic/claude-sonnet-4
    - openai/gpt-4o
`;

  writeFileSync(CONFIG_PATH, template, "utf-8");
}
