import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 5 * 1024 * 1024;

export interface TwinsRunResult {
  modelA: string;
  modelB: string;
  prompt: string;
  responseA: string;
  responseB: string;
  synthesis: string;
}

async function runPiPrompt(
  model: string,
  prompt: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  const piArgs = [
    "-p",
    "--no-session",
    "--approve",
    "--model",
    model,
    "--exclude-tools",
    "twins_run",
    prompt,
  ];

  // On Windows, execFile with .cmd batch files fails with EINVAL (Node.js v23+).
  // Use cmd.exe /c wrapper instead.
  const isWin = process.platform === "win32";
  const bin = isWin ? "cmd.exe" : "pi";
  const args = isWin ? ["/c", "pi", ...piArgs] : piArgs;

  const { stdout, stderr } = await execFileAsync(bin, args, {
    cwd,
    windowsHide: true,
    maxBuffer: MAX_BUFFER,
    signal,
  });

  const text = (stdout || "").trim();
  if (text) return text;
  const err = (stderr || "").trim();
  if (err) throw new Error(err);
  throw new Error(`No output from model ${model}`);
}

function synthesisPrompt(prompt: string, modelA: string, responseA: string, modelB: string, responseB: string): string {
  return [
    "You are synthesizing two independent model answers into one final answer.",
    "Write one coherent response for the user.",
    "If the answers disagree, resolve the disagreement and prefer the more precise or evidence-backed claim.",
    "At the end, add a short 'Sources of insight' line naming both models.",
    "",
    `Original prompt: ${prompt}`,
    "",
    `--- Answer from ${modelA} ---`,
    responseA,
    "",
    `--- Answer from ${modelB} ---`,
    responseB,
  ].join("\n");
}

export async function runTwins(
  prompt: string,
  pair: readonly [string, string],
  cwd: string,
  signal?: AbortSignal,
): Promise<TwinsRunResult> {
  const [modelA, modelB] = pair;
  const [responseA, responseB] = await Promise.all([
    runPiPrompt(modelA, prompt, cwd, signal),
    runPiPrompt(modelB, prompt, cwd, signal),
  ]);

  const synthesis = await runPiPrompt(modelA, synthesisPrompt(prompt, modelA, responseA, modelB, responseB), cwd, signal);

  return {
    modelA,
    modelB,
    prompt,
    responseA,
    responseB,
    synthesis,
  };
}

export function formatTwinsMarkdown(result: TwinsRunResult): string {
  return [
    `## pi-twins`,
    "",
    `**Prompt**`,
    result.prompt,
    "",
    `**Model A**: \`${result.modelA}\``,
    result.responseA,
    "",
    `**Model B**: \`${result.modelB}\``,
    result.responseB,
    "",
    `**Synthesis**`,
    result.synthesis,
  ].join("\n");
}
