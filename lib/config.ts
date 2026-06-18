import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { Check } from "typebox/schema";
import {
  TwinsConfigSchema,
  type TwinsConfig,
  DEFAULT_PAIR_NAME,
} from "./schema.ts";

const DEFAULT_CONFIG_DIR = join(homedir(), ".pi");
const DEFAULT_CONFIG_PATH = join(DEFAULT_CONFIG_DIR, "twins.yaml");

export class ConfigNotFoundError extends Error {
  readonly configPath: string;

  constructor(configPath: string) {
    super(formatConfigNotFoundMessage(configPath));
    this.name = "ConfigNotFoundError";
    this.configPath = configPath;
  }
}

function formatConfigNotFoundMessage(configPath: string): string {
  return [
    `pi-twins config not found at ${configPath}`,
    "",
    "Create ~/.pi/twins.yaml with model pairs, or run /twins:config to generate a template.",
    "Run /twins:scan to see available model IDs.",
    "",
    "Example:",
    "pairs:",
    "  default:",
    "    - anthropic/claude-sonnet-4",
    "    - google/gemini-2.5-pro",
  ].join("\n");
}

function formatValidationError(configPath: string, detail: string): string {
  return `Invalid pi-twins config at ${configPath}: ${detail}`;
}

function resolveConfigPath(configPath?: string): string {
  return configPath ?? DEFAULT_CONFIG_PATH;
}

/** Read and validate twins config from ~/.pi/twins.yaml (or an override path). */
export function loadConfig(configPath?: string): TwinsConfig {
  const path = resolveConfigPath(configPath);

  if (!existsSync(path)) {
    throw new ConfigNotFoundError(path);
  }

  let parsed: unknown;
  try {
    const raw = readFileSync(path, "utf-8");
    parsed = parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(formatValidationError(path, `failed to parse YAML: ${msg}`));
  }

  if (!Check(TwinsConfigSchema, parsed)) {
    throw new Error(
      formatValidationError(
        path,
        'expected a "pairs" object mapping names to [modelA, modelB] tuples',
      ),
    );
  }

  return parsed;
}

/** Get a specific pair by name, falling back to default. */
export function getPair(pairName?: string, configPath?: string): [string, string] {
  const config = loadConfig(configPath);
  const name = pairName || DEFAULT_PAIR_NAME;
  const pair = config.pairs[name];
  if (!pair) {
    throw new Error(
      `Pair "${name}" not found in config. Available: ${Object.keys(config.pairs).join(", ")}`,
    );
  }
  return pair;
}

/** Check if config file exists. */
export function configExists(configPath?: string): boolean {
  return existsSync(resolveConfigPath(configPath));
}

/** Get config file path for display. */
export function getConfigPath(configPath?: string): string {
  return resolveConfigPath(configPath);
}

/** Create default config file with a template. */
export function writeDefaultConfig(configPath: string = DEFAULT_CONFIG_PATH): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
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

  writeFileSync(configPath, template, "utf-8");
}
