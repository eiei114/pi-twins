import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig, getPair, configExists, getConfigPath, writeDefaultConfig } from "../lib/config.ts";
import { scanModels, groupByProvider } from "../lib/scanner.ts";
import type { ModelEntry } from "../lib/scanner.ts";
import { StringEnum } from "../lib/schema.ts";

// ─── State machine ────────────────────────────────────────────────────────────

interface TwinsState {
  prompt: string;
  pair: [string, string];
  /**
   * phase counter advanced on each agent_end:
   * 0=command ran (modelA prompt queued)
   * 1=modelA responded → ready to switch to modelB
   * 2=modelB responded → ready to synthesize
   * 3=synthesis done → clear
   */
  phase: number;
  startedAt: number;
}

let twinsState: TwinsState | null = null;
const STALE_TIMEOUT_MS = 300_000; // 5 min

/** Parse "provider/modelId" into [provider, modelId]. */
function splitModelId(fullId: string): [string, string] {
  const idx = fullId.indexOf("/");
  if (idx === -1) return ["", fullId];
  return [fullId.slice(0, idx), fullId.slice(idx + 1)];
}

/** Try to find a Model object and set it as current. Returns true if switched. */
async function trySwitchModel(fullId: string, pi: ExtensionAPI, ctx: { modelRegistry: { find: (p: string, m: string) => unknown } }): Promise<boolean> {
  const [provider, modelId] = splitModelId(fullId);
  if (!provider) return false;
  const model = ctx.modelRegistry.find(provider, modelId) as any;
  if (!model) return false;
  await pi.setModel(model);
  return true;
}

// ─── Config creation helper ────────────────────────────────────────────────────

async function ensureConfig(ctx: { ui: { confirm: (msg: string) => Promise<boolean | undefined>; notify: (msg: string, level: string) => void } }): Promise<boolean> {
  if (configExists()) return true;
  ctx.ui.notify("No ~/.pi/twins.yaml found", "info");
  const create = await ctx.ui.confirm("Create a default config at ~/.pi/twins.yaml?");
  if (!create) {
    ctx.ui.notify("Run /twins:scan to see available models, then create ~/.pi/twins.yaml manually", "info");
    return false;
  }
  writeDefaultConfig();
  ctx.ui.notify("Created ~/.pi/twins.yaml with default pairs", "info");
  return true;
}

// ─── Synthesis prompt template ─────────────────────────────────────────────────

const SYNTHESIS_PROMPT = `\
以下の2つの回答を読み、それぞれの最良部分を合成した1つの回答を書いてください。

--- 回答1 ---
modelA_RESPONSE

--- 回答2 ---
modelB_RESPONSE

要件:
- 情報を統合し、矛盾を解消してください
- 冗長な部分は削除してください
- 1つの自然な回答として書いてください`;

// ─── Extension entry ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── Slice 01: /twins:scan ────────────────────────────────────────────
  pi.registerCommand("twins:scan", {
    description: "Display available models for twin pairs",
    handler: async (_args, ctx) => {
      const groups = groupByProvider();
      const lines: string[] = ["**Available models:**", ""];
      for (const [provider, models] of Object.entries(groups)) {
        lines.push(`**${provider}**`);
        for (const m of models) {
          lines.push(`  - \`${m.id}\` — ${m.displayName}`);
        }
        lines.push("");
      }
      lines.push("Add these to `~/.pi/twins.yaml` in a `pairs` section.");
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ── Slice 02: /twins:run command ──────────────────────────────────────
  pi.registerCommand("twins:run", {
    description: "Ask two models the same question and synthesize",
    handler: async (_args, ctx) => {
      if (twinsState) {
        ctx.ui.notify("A twins session is already running. Wait or abort.", "warning");
        return;
      }

      // Ensure config exists
      const ok = await ensureConfig(ctx as any);
      if (!ok) return;

      // Get prompt
      const prompt = await ctx.ui.input("What would you like to ask both models?", "");
      if (prompt === undefined) return;

      // Get the default model pair
      let pair: [string, string];
      try {
        pair = getPair();
      } catch (err) {
        ctx.ui.notify(err instanceof Error ? err.message : "Config error", "error");
        return;
      }

      // Initialize state — phase 0: command ran, modelA prompt queued via followUp
      twinsState = { prompt, pair, phase: 0, startedAt: Date.now() };
      ctx.ui.setStatus("twins", `Step 1/3: Asking ${pair[0]}...`);

      // Try to switch to model A
      await trySwitchModel(pair[0], pi, ctx as any);

      // Queue the user's prompt after current turn
      pi.sendUserMessage(prompt, { deliverAs: "followUp" });
    },
  });

  // ── Slice 02: agent_end state machine ─────────────────────────────────
  pi.on("agent_end", async (_event, ctx) => {
    const state = twinsState;
    if (!state) return;

    // Stale guard
    if (Date.now() - state.startedAt > STALE_TIMEOUT_MS) {
      twinsState = null;
      ctx.ui.setStatus("twins", "");
      return;
    }

    try {
      const p = state.phase;

      // phase 0: command turn finished, modelA prompt is queued — just advance
      // phase 1: modelA responded → switch to modelB, queue prompt
      // phase 2: modelB responded → queue synthesis
      // phase 3: synthesis done → clear

      if (p === 1) {
        state.phase = 2;
        ctx.ui.setStatus("twins", `Step 2/3: Asking ${state.pair[1]}...`);
        await trySwitchModel(state.pair[1], pi, ctx as any);
        pi.sendUserMessage(state.prompt, { deliverAs: "followUp" });
      } else if (p === 2) {
        state.phase = 3;
        ctx.ui.setStatus("twins", "Step 3/3: Synthesizing...");
        pi.sendUserMessage(
          "Look at the two previous answers. Synthesize them into one coherent answer. Keep the model names visible so the user knows which insights came from which model.",
          { deliverAs: "followUp" },
        );
      } else if (p === 3) {
        twinsState = null;
        ctx.ui.setStatus("twins", "");
        ctx.ui.notify("pi-twins: All done! Responses from both models synthesized above.", "info");
      } else if (p === 0) {
        // First agent_end after command — modelA prompt is queued next
        state.phase = 1;
      }
    } catch (err) {
      twinsState = null;
      ctx.ui.setStatus("twins", "");
      ctx.ui.notify(`pi-twins error: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  });

  // ── Slice 02: twins_run tool (for AI agents) ─────────────────────────
  pi.registerTool({
    name: "twins_run",
    label: "Twins Run",
    description: "Run a prompt on two models in parallel and return the synthesized result",
    promptSnippet: "twins_run: send the same prompt to two configured models and synthesize the responses",
    promptGuidelines: [
      "Use twins_run when a decision benefits from multiple model perspectives",
      "The configured pair in ~/.pi/twins.yaml determines which models run",
      "Returns a structured result with both responses and the synthesis",
    ],
    parameters: Type.Object({
      prompt: Type.String({ description: "The question or task to ask both models" }),
      pair: Type.Optional(Type.String({ description: "Pair name from config (defaults to 'default')" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      let pair: [string, string];
      try {
        pair = getPair(params.pair);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Config error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        } as any;
      }

      // Sequential model calls (parallel not possible from tool context)
      const [modelA, modelB] = pair;

      return {
        content: [{
          type: "text",
          text: `To get a twin perspective, run this prompt on both models.
After getting both responses, synthesize them.

Models: ${modelA} and ${modelB}
Prompt: ${params.prompt}

Start with ${modelA}, then ${modelB}, then synthesize.`,
        }],
        details: { pair: [modelA, modelB], prompt: params.prompt },
      } as any;
    },
  });

  // ── Slice 01: config creation tool ─────────────────────────────────────
  pi.registerCommand("twins:config", {
    description: "Create or show the pi-twins configuration file",
    handler: async (_args, ctx) => {
      if (configExists()) {
        ctx.ui.notify(`Config exists at: ${getConfigPath()}`, "info");
      } else {
        writeDefaultConfig();
        ctx.ui.notify(`Created default config at: ${getConfigPath()}`, "info");
      }
    },
  });
}
