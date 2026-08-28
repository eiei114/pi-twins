import { Type, type Static, type TSchemaOptions, type TEnum } from "typebox";

export function StringEnum<const Values extends [string, ...string[]]>(
  values: readonly [...Values],
  options?: TSchemaOptions,
): TEnum<Values> {
  return Type.Enum([...values] as [string, ...string[]], options) as unknown as TEnum<Values>;
}

/** Model pair: exactly two provider/model identifiers. */
export const ModelPairSchema = Type.Tuple([
  Type.String({ minLength: 1, description: "First model (provider/model-id)" }),
  Type.String({ minLength: 1, description: "Second model (provider/model-id)" }),
]);

export const SYNTHESIS_INSTRUCTIONS_MAX_LENGTH = 2000;

export const SYNTHESIS_MODES = ["balanced", "decision", "critique", "concise"] as const;

export const SynthesisModeSchema = StringEnum(SYNTHESIS_MODES, {
  description: "How pi-twins should shape the final synthesized answer",
});

export type SynthesisMode = Static<typeof SynthesisModeSchema>;

export const SynthesisConfigSchema = Type.Object({
  mode: Type.Optional(SynthesisModeSchema),
  instructions: Type.Optional(Type.String({
    maxLength: SYNTHESIS_INSTRUCTIONS_MAX_LENGTH,
    description: `Additional synthesis instructions (${SYNTHESIS_INSTRUCTIONS_MAX_LENGTH} characters max)`,
  })),
}, {
  description: "Optional defaults for the final synthesis prompt",
});

export type SynthesisConfig = Static<typeof SynthesisConfigSchema>;

/** Twins config YAML shape (~/.pi/twins.yaml). */
export const TwinsConfigSchema = Type.Object({
  pairs: Type.Record(Type.String({ minLength: 1 }), ModelPairSchema, {
    description: "Named model pairs for twin runs",
  }),
  synthesis: Type.Optional(SynthesisConfigSchema),
});

export type TwinsConfig = Static<typeof TwinsConfigSchema>;

/** Tool parameters for twins_run. */
export const TwinsRunToolParametersSchema = Type.Object({
  prompt: Type.String({ description: "The question or task to ask both models" }),
  pair: Type.Optional(Type.String({
    description: "Pair name from ~/.pi/twins.yaml (defaults to the default pair when present, otherwise the first configured pair)",
  })),
  synthesisMode: Type.Optional(SynthesisModeSchema),
  synthesisInstructions: Type.Optional(Type.String({
    maxLength: SYNTHESIS_INSTRUCTIONS_MAX_LENGTH,
    description: `Per-call synthesis instructions (${SYNTHESIS_INSTRUCTIONS_MAX_LENGTH} characters max)`,
  })),
});

export type TwinsRunToolParameters = Static<typeof TwinsRunToolParametersSchema>;

export const DEFAULT_PAIR_NAME = "default";

export const DEFAULT_CONFIG: TwinsConfig = {
  pairs: {
    [DEFAULT_PAIR_NAME]: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
  },
};
