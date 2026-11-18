/** Scan for models available from Pi's provider registry. */

export interface ModelEntry {
  id: string;
  displayName: string;
  provider: string;
}

/** Known models commonly available via Pi providers. */
const KNOWN_MODELS: ModelEntry[] = [
  { id: "anthropic/claude-sonnet-4", displayName: "Claude 4 Sonnet", provider: "anthropic" },
  { id: "anthropic/claude-opus-4", displayName: "Claude 4 Opus", provider: "anthropic" },
  { id: "google/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", provider: "google" },
  { id: "google/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", provider: "google" },
  { id: "openai/gpt-4o", displayName: "GPT-4o", provider: "openai" },
  { id: "openai/gpt-4.1", displayName: "GPT-4.1", provider: "openai" },
  { id: "deepseek/deepseek-r1", displayName: "DeepSeek R1", provider: "deepseek" },
];

/** The registry fields used to display an available Pi model. */
export interface RegistryModel {
  id: string;
  name: string;
  provider: string;
}

export interface RegistryScanResult {
  groups: Record<string, ModelEntry[]>;
  usedFallback: boolean;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Group registry models by provider, using provider/id IDs, stable sorting, and de-duplication. */
export function groupModelsByProvider(models: readonly RegistryModel[]): Record<string, ModelEntry[]> {
  const sorted = models
    .map((model) => ({
      id: `${model.provider}/${model.id}`,
      displayName: model.name,
      provider: model.provider,
    }))
    .sort(
      (a, b) =>
        compareStrings(a.provider, b.provider) ||
        compareStrings(a.id, b.id) ||
        compareStrings(a.displayName, b.displayName),
    );

  const unique = new Map<string, ModelEntry>();
  for (const model of sorted) {
    if (!unique.has(model.id)) unique.set(model.id, model);
  }

  const groups = new Map<string, ModelEntry[]>();
  for (const model of unique.values()) {
    const providerModels = groups.get(model.provider) ?? [];
    providerModels.push(model);
    groups.set(model.provider, providerModels);
  }

  return Object.fromEntries(groups);
}

/** Use the authenticated registry list when available; otherwise return curated examples. */
export function scanRegistryModels(registry: {
  getAvailable: () => readonly RegistryModel[];
}): RegistryScanResult {
  try {
    const groups = groupModelsByProvider(registry.getAvailable());
    if (Object.keys(groups).length > 0) return { groups, usedFallback: false };
  } catch {
    // Registry failures should not prevent users from seeing the curated examples.
  }

  return { groups: groupByProvider(), usedFallback: true };
}

/** Get list of available models. */
export function scanModels(): ModelEntry[] {
  return [...KNOWN_MODELS];
}

/** Find a model entry by its full ID. */
export function findModelById(id: string): ModelEntry | undefined {
  return KNOWN_MODELS.find((m) => m.id === id);
}

/** Group models by provider for display. */
export function groupByProvider(): Record<string, ModelEntry[]> {
  const groups: Record<string, ModelEntry[]> = {};
  for (const model of KNOWN_MODELS) {
    if (!groups[model.provider]) groups[model.provider] = [];
    groups[model.provider].push(model);
  }
  return groups;
}
