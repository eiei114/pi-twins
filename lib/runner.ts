import { spawn } from "node:child_process";

const MAX_BUFFER = 5 * 1024 * 1024;
const CHILD_TIMEOUT_MS = 120_000;

export interface TwinsRunResult {
  modelA: string;
  modelB: string;
  prompt: string;
  responseA: string;
  responseB: string;
  synthesis: string;
}

function stripControlSequences(text: string): string {
  return text
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "");
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
  // Also keep stdin ignored: piping stdin makes child `pi -p` hang after producing output.
  const isWin = process.platform === "win32";
  const bin = isWin ? "cmd.exe" : "pi";
  const args = isWin ? ["/c", "pi", ...piArgs] : piArgs;

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const child = spawn(bin, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let abortHandler: (() => void) | undefined;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
      fn();
    };

    const fail = (message: string) => settle(() => reject(new Error(message)));

    if (signal?.aborted) {
      child.kill("SIGTERM");
      return fail("pi-twins run aborted");
    }

    abortHandler = () => {
      child.kill("SIGTERM");
      fail("pi-twins run aborted");
    };

    if (signal) signal.addEventListener("abort", abortHandler, { once: true });

    timeoutId = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      fail(`Timed out waiting for model ${model} after ${Math.round(CHILD_TIMEOUT_MS / 1000)}s`);
    }, CHILD_TIMEOUT_MS);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") > MAX_BUFFER) {
        child.kill("SIGTERM");
        fail(`Output from model ${model} exceeded ${MAX_BUFFER} bytes`);
      }
    });

    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr, "utf8") > MAX_BUFFER) {
        child.kill("SIGTERM");
        fail(`Error output from model ${model} exceeded ${MAX_BUFFER} bytes`);
      }
    });

    child.on("error", (error) => {
      fail(error.message);
    });

    child.on("close", (code, closeSignal) => {
      const text = stripControlSequences(stdout).trim();
      const err = stripControlSequences(stderr).trim();

      if (code === 0) {
        if (text) return settle(() => resolve(text));
        if (err) return fail(err);
        return fail(`No output from model ${model}`);
      }

      const parts = [err || `Child pi exited with code ${code ?? "unknown"}`];
      if (closeSignal) parts.push(`signal=${closeSignal}`);
      fail(parts.join(" "));
    });
  });
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
