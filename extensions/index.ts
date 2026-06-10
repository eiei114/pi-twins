import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { configExists, getConfigPath, loadConfig, writeDefaultConfig } from "../lib/config.ts";
import { groupByProvider } from "../lib/scanner.ts";
import { DEFAULT_PAIR_NAME } from "../lib/schema.ts";
import { formatTwinsMarkdown, runTwins, type TwinsRunProgress } from "../lib/runner.ts";

async function ensureConfig(ctx: ExtensionCommandContext): Promise<boolean> {
  if (configExists()) return true;
  ctx.ui.notify("No ~/.pi/twins.yaml found", "info");
  const create = await ctx.ui.confirm("pi-twins config", "Create a default config at ~/.pi/twins.yaml?");
  if (!create) {
    ctx.ui.notify("Run /twins:scan to see available models, then create ~/.pi/twins.yaml manually", "info");
    return false;
  }
  writeDefaultConfig();
  ctx.ui.notify(`Created default config at: ${getConfigPath()}`, "info");
  return true;
}

async function choosePair(ctx: ExtensionCommandContext): Promise<[string, string] | undefined> {
  const config = loadConfig();
  const names = Object.keys(config.pairs);
  if (names.length === 0) throw new Error("No pairs found in ~/.pi/twins.yaml");

  const pairName = config.pairs[DEFAULT_PAIR_NAME]
    ? DEFAULT_PAIR_NAME
    : names[0];

  if (names.length > 1) {
    ctx.ui.notify(`Using pi-twins pair: ${pairName}`, "info");
  }

  return config.pairs[pairName];
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("twins:scan", {
    description: "Display available models for twin pairs",
    handler: async (_args, ctx) => {
      const groups = groupByProvider();
      const lines: string[] = ["**Available models:**", ""];
      for (const [provider, models] of Object.entries(groups)) {
        lines.push(`**${provider}**`);
        for (const m of models) lines.push(`- \`${m.id}\` — ${m.displayName}`);
        lines.push("");
      }
      lines.push("Use these exact IDs in ~/.pi/twins.yaml.");
      pi.sendMessage({ customType: "twins", content: lines.join("\n"), display: true, details: { kind: "scan" } });
    },
  });

  pi.registerCommand("twins:config", {
    description: "Create or show the pi-twins configuration file",
    handler: async (_args, ctx) => {
      if (configExists()) {
        pi.sendMessage({ customType: "twins", content: `Config exists at: ${getConfigPath()}`, display: true, details: { kind: "config" } });
      } else {
        writeDefaultConfig();
        pi.sendMessage({ customType: "twins", content: `Created default config at: ${getConfigPath()}`, display: true, details: { kind: "config" } });
      }
    },
  });

  pi.registerCommand("twins:run", {
    description: "Ask two models the same question and synthesize",
    handler: async (_args, ctx) => {
      try {
        const ok = await ensureConfig(ctx);
        if (!ok) return;
        const prompt = await ctx.ui.input("What would you like to ask both models?", "");
        if (!prompt?.trim()) return;
        const pair = await choosePair(ctx);
        if (!pair) return;

        ctx.ui.setStatus("twins", `Running ${pair[0]} + ${pair[1]}...`);
        ctx.ui.setWorkingVisible(true);
        ctx.ui.setWorkingMessage("Thinking... starting pi-twins...");

        const showProgress = (progress: TwinsRunProgress) => {
          ctx.ui.setWorkingVisible(true);
          ctx.ui.setWorkingMessage(`Thinking... ${progress.message}`);
          ctx.ui.setStatus("twins", progress.message);
        };

        const result = await runTwins(prompt.trim(), pair, ctx.cwd, ctx.signal, showProgress);
        pi.sendMessage({
          customType: "twins",
          content: formatTwinsMarkdown(result),
          display: true,
          details: { kind: "run", pair },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`pi-twins error: ${message}`, "error");
        pi.sendMessage({ customType: "twins", content: `pi-twins error: ${message}`, display: true, details: { kind: "error", error: true } });
      } finally {
        ctx.ui.setStatus("twins", "");
        ctx.ui.setWorkingVisible(false);
        ctx.ui.setWorkingMessage("");
      }
    },
  });

  pi.registerTool({
    name: "twins_run",
    label: "Twins Run",
    description: "Run a prompt on two configured models and return a synthesized result",
    promptSnippet: "twins_run: run the same prompt on two configured models and synthesize the responses",
    promptGuidelines: [
      "Use twins_run when a decision benefits from multiple model perspectives.",
      "The pair name comes from ~/.pi/twins.yaml.",
      "Returns both raw model responses and the final synthesis.",
    ],
    parameters: Type.Object({
      prompt: Type.String({ description: "The question or task to ask both models" }),
      pair: Type.Optional(Type.String({ description: "Pair name from ~/.pi/twins.yaml (defaults to first pair)" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      try {
        const config = loadConfig();
        const names = Object.keys(config.pairs);
        if (names.length === 0) throw new Error("No pairs found in ~/.pi/twins.yaml");
        const pairName = params.pair && config.pairs[params.pair] ? params.pair : names[0];
        const pair = config.pairs[pairName];
        const result = await runTwins(params.prompt, pair, ctx.cwd, signal);
        return {
          content: [{ type: "text", text: formatTwinsMarkdown(result) }],
          details: { pairName, pair, modelA: result.modelA, modelB: result.modelB },
        } as any;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `pi-twins error: ${message}` }],
          details: { error: true },
          isError: true,
        } as any;
      }
    },
  });
}

