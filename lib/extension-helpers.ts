import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { configExists, getConfigPath, writeDefaultConfig } from "./config.ts";
import { DEFAULT_PAIR_NAME, type TwinsConfig } from "./schema.ts";

export function resolvePair(config: TwinsConfig, pairName?: string): [string, string] {
  const names = Object.keys(config.pairs);
  if (names.length === 0) throw new Error("No pairs found in ~/.pi/twins.yaml");

  const resolvedName =
    pairName && config.pairs[pairName]
      ? pairName
      : config.pairs[DEFAULT_PAIR_NAME]
        ? DEFAULT_PAIR_NAME
        : names[0];

  return config.pairs[resolvedName];
}

export type PairSelection = {
  name: string;
  pair: [string, string];
};

export async function selectPair(
  config: TwinsConfig,
  select: (title: string, options: string[]) => Promise<string | undefined>,
): Promise<PairSelection | undefined> {
  const names = Object.keys(config.pairs);
  if (names.length === 0) throw new Error("No pairs found in ~/.pi/twins.yaml");

  if (names.length === 1 || config.pairs[DEFAULT_PAIR_NAME]) {
    const name = config.pairs[DEFAULT_PAIR_NAME] ? DEFAULT_PAIR_NAME : names[0];
    return { name, pair: config.pairs[name] };
  }

  const name = await select("Select a pi-twins pair", names);
  if (!name) return undefined;
  return { name, pair: config.pairs[name] };
}

export async function ensureConfig(
  ctx: ExtensionCommandContext,
  configPath?: string,
): Promise<boolean> {
  if (configExists(configPath)) return true;
  ctx.ui.notify("No ~/.pi/twins.yaml found", "info");
  const create = await ctx.ui.confirm("pi-twins config", "Create a default config at ~/.pi/twins.yaml?");
  if (!create) {
    ctx.ui.notify("Run /twins:scan to see available models, then create ~/.pi/twins.yaml manually", "info");
    return false;
  }
  writeDefaultConfig(configPath ?? getConfigPath());
  ctx.ui.notify(`Created default config at: ${getConfigPath(configPath)}`, "info");
  return true;
}

export type { TwinsConfig };
