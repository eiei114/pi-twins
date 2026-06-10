import { Type, type TSchemaOptions, type TEnum } from "typebox";

export function StringEnum<const Values extends [string, ...string[]]>(
  values: readonly [...Values],
  options?: TSchemaOptions,
): TEnum<Values> {
  return Type.Enum([...values] as [string, ...string[]], options) as unknown as TEnum<Values>;
}

/** Twins config YAML shape */
export interface TwinsConfig {
  pairs: Record<string, [string, string]>;
}

export const DEFAULT_PAIR_NAME = "default";

export const DEFAULT_CONFIG: TwinsConfig = {
  pairs: {
    [DEFAULT_PAIR_NAME]: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
  },
};
