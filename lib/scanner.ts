/**
 * Scan for available models in Pi's provider system.
 *
 * MVP strategy: returns a curated list of well-known models.
 * Future: read from Pi's provider registry dynamically.
 */

export interface ModelEntry {
  id: string;
  displayName: string;
  provider: string;
}

/** Known models commonly available via Pi providers. */
const KNOWN_MODELS: ModelEntry[] = [
  { id: "anthropic/claude-sonnet-4", displayName: "Claude 4 Sonnet", provider: "anthropic" },
  { id: "anthropic/claude-opus-4", displayName: "Claude 4 Opus", provider: "anthropic" },
  { id: "anthropic/claude-sonnet-4-20250514", displayName: "Claude 4 Sonnet (date pinned)", provider: "anthropic" },
  { id: "google/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", provider: "google" },
  { id: "google/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", provider: "google" },
  { id: "openai/gpt-4o", displayName: "GPT-4o", provider: "openai" },
  { id: "openai/gpt-4.1", displayName: "GPT-4.1", provider: "openai" },
  { id: "deepseek/deepseek-v4-pro", displayName: "DeepSeek V4 Pro", provider: "deepseek" },
  { id: "deepseek/deepseek-r1", displayName: "DeepSeek R1", provider: "deepseek" },
];

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
