import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  behaviorAssertions,
  EXTENSION_LOAD_ERROR_PATTERN,
  parseJsonLines,
  SDK_NAMES,
  UNHANDLED_ERROR_PATTERN,
  VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const reportPath = process.argv.includes("--update-curated-report")
  ? resolve(root, "docs/verification/pi-sdk-smoke.json")
  : resolve(root, ".tmp/pi-sdk-smoke.json");
const deadlineMs = 15_000;
const cleanupGraceMs = 1_000;
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(resolve(root, "package.json"));
const sdkVersions = Object.fromEntries(SDK_NAMES.map((name) =>
  [name, readJson(resolve(root, "node_modules", name, "package.json")).version]));
for (const name of SDK_NAMES) {
  if (manifest.devDependencies?.[name] !== sdkVersions[name]) {
    throw new Error(`Smoke requires the exact dev/test SDK pin for ${name}: installed ${sdkVersions[name]}`);
  }
}

const cliManifest = readJson(resolve(root, "node_modules/@earendil-works/pi-coding-agent/package.json"));
const piCli = resolve(root, "node_modules/@earendil-works/pi-coding-agent", cliManifest.bin.pi);
const tempRoot = mkdtempSync(resolve(tmpdir(), "pi-twins-sdk-smoke-"));
const agentDir = resolve(tempRoot, "agent");
const packageConfigDir = resolve(tempRoot, "home", ".pi");
mkdirSync(agentDir, { recursive: true });
mkdirSync(packageConfigDir, { recursive: true });
const env = {
  ...process.env,
  PI_CODING_AGENT_DIR: agentDir,
  PI_OFFLINE: "1",
  PI_TELEMETRY: "0",
  HOME: resolve(tempRoot, "home"),
  USERPROFILE: resolve(tempRoot, "home"),
};
delete env.ANTHROPIC_API_KEY;
delete env.OPENAI_API_KEY;
const commonArgs = ["--offline", "--no-session", "--no-extensions", "-e", ".", "--no-mcp",
  "--no-skills", "--no-context-files", "--no-prompt-templates", "--mode", "rpc"];

function writeFixture(pair) {
  writeFileSync(resolve(packageConfigDir, "twins.yaml"), `pairs:\n  default:\n    - ${pair[0]}\n    - ${pair[1]}\n`, "utf8");
  writeFileSync(resolve(agentDir, "models.json"), JSON.stringify({ providers: {
    openai: {
      baseUrl: `http://127.0.0.1:${serverPort}/v1`,
      api: "openai-completions",
      apiKey: "offline-test-key",
      models: ["smoke-control", "smoke-a", "smoke-b"].map((id) => ({
        id,
        name: id,
        contextWindow: 8192,
        maxTokens: 512,
        input: ["text"],
        reasoning: false,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      })),
    },
  } }, null, 2), "utf8");
}

function responseChunk(model, delta, finishReason) {
  return `data: ${JSON.stringify({ id: "smoke", object: "chat.completion.chunk", created: 1, model,
    choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;
}

function replySse(response, model, { text, toolCall }) {
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "close" });
  response.write(responseChunk(model, { role: "assistant" }, null));
  if (toolCall) {
    response.write(responseChunk(model, { tool_calls: [{ index: 0, id: "twins-smoke-call", type: "function",
      function: { name: "twins_run", arguments: JSON.stringify({ prompt: "compatibility smoke question" }) } }] }, null));
    response.write(responseChunk(model, {}, "tool_calls"));
  } else {
    response.write(responseChunk(model, { content: text }, null));
    response.write(responseChunk(model, {}, "stop"));
  }
  response.end("data: [DONE]\n\n");
}

let serverPort;
const server = createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    let payload;
    try { payload = JSON.parse(body); } catch {
      response.writeHead(400).end("bad json");
      return;
    }
    const model = payload.model;
    const messages = JSON.stringify(payload.messages ?? []);
    if (model === "smoke-control") {
      const alreadyCalledTool = (payload.messages ?? []).some((message) => message.role === "tool");
      replySse(response, model, alreadyCalledTool ? { text: "CONTROL_TURN_COMPLETE" } : { toolCall: true });
    } else if (model === "smoke-a" && messages.includes("以下の2つの回答")) {
      replySse(response, model, { text: "SYNTHESIS_RESPONSE" });
    } else if (model === "smoke-a") {
      replySse(response, model, { text: "MODEL_A_RESPONSE" });
    } else if (model === "smoke-b") {
      replySse(response, model, { text: "MODEL_B_RESPONSE" });
    } else {
      response.writeHead(404).end(`unknown model ${String(model)}`);
    }
  });
});

await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    serverPort = server.address().port;
    resolveListen();
  });
});

function runChild(executable, args, { onRecord, onStart } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(executable, args, { cwd: root, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let pending = "";
    let timedOut = false;
    let exitObserved = false;
    let closeObserved = false;
    let exitCode = null;
    let exitSignal = null;
    let processError = null;
    let finished = false;
    let cleanupTimer;
    const deadline = setTimeout(() => {
      timedOut = true;
      child.kill();
      cleanupTimer = setTimeout(() => {
        child.kill("SIGKILL");
        finish();
      }, cleanupGraceMs);
    }, deadlineMs);
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      clearTimeout(cleanupTimer);
      resolveRun({ stdout, stderr, exit_code: exitObserved ? exitCode : null, exitObserved, closeObserved,
        signal: exitSignal, timedOut, processError, records: parseJsonLines(stdout) });
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const [record] = parseJsonLines(line);
        if (record) onRecord?.(record, child);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      processError = error.message;
      stderr += `\nspawn error: ${error.message}`;
    });
    child.once("exit", (code, signal) => {
      exitObserved = true;
      exitCode = code;
      exitSignal = signal;
    });
    child.once("close", () => {
      closeObserved = true;
      finish();
    });
    onStart?.(child);
  });
}

function runRpc({ feature = false, pair = ["openai/smoke-a", "openai/smoke-b"] } = {}) {
  writeFixture(pair);
  const records = [];
  let promptSent = false;
  let closed = false;
  const childResult = runChild(process.execPath, [piCli, ...commonArgs, "--model", "openai/smoke-control", "--tools", "twins_run"], {
    onStart: (child) => child.stdin.write('{"id":"inventory","type":"get_commands"}\n'),
    onRecord: (record, child) => {
      records.push(record);
      if (record.type === "response" && record.id === "inventory" && record.success === true) {
        if (feature && !promptSent) {
          promptSent = true;
          child.stdin.write('{"id":"feature-prompt","type":"prompt","message":"Run twins_run for a short compatibility smoke."}\n');
        } else if (!feature && !closed) {
          closed = true;
          child.stdin.end();
        }
      }
      if (record.type === "agent_settled" && !closed) {
        closed = true;
        child.stdin.end();
      }
    },
  });
  return childResult.then((result) => ({ ...result, records }));
}

function summarize(name, result, expectedVersion) {
  const fullOutput = `${result.stdout}\n--- stderr ---\n${result.stderr}`;
  const evidenceRecords = result.records
    .filter((record) => ["response", "tool_execution_start", "tool_execution_end", "agent_settled", "first_host_exit", "second_host_exit"].includes(record.type))
    .map((record) => JSON.parse(JSON.stringify(record, (key, value) => {
      if (typeof value !== "string") return value;
      return value.replaceAll(root, "<checkout>").replaceAll(tempRoot, "<isolated-temp>");
    })));
  const assertions = behaviorAssertions(name, { records: evidenceRecords, exit_code: result.exit_code,
    exitObserved: result.exitObserved, closeObserved: result.closeObserved, timedOut: result.timedOut,
    processError: result.processError, stdout: result.stdout, fullOutput, expectedVersion });
  const safeStderr = result.stderr.replaceAll(root, "<checkout>").replaceAll(tempRoot, "<isolated-temp>");
  const hasUnhandledError = UNHANDLED_ERROR_PATTERN.test(fullOutput);
  const hasLoadError = EXTENSION_LOAD_ERROR_PATTERN.test(fullOutput);
  return {
    name,
    command: "node scripts/pi-sdk-smoke.mjs",
    exit_code: result.exit_code,
    passed: result.exit_code === 0 && result.exitObserved && result.closeObserved && !result.timedOut
      && !result.processError && !hasUnhandledError && !hasLoadError
      && assertions.every((item) => item.passed),
    evidence: `${evidenceRecords.map((record) => JSON.stringify(record)).join("\n")}\n${safeStderr.trim()}\nprocess_exit_observed=${result.exitObserved}; close_observed=${result.closeObserved}; timed_out=${result.timedOut}; process_error=${result.processError ?? "none"}; signal=${result.signal ?? "none"}`,
    assertions,
    hasUnhandledError,
    hasLoadError,
  };
}

async function runHostShell(expectedVersion) {
  const cli = process.execPath;
  let shell;
  let args;
  if (process.platform === "win32") {
    shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    const quote = (value) => `'${value.replaceAll("'", "''")}'`;
    args = ["-NoProfile", "-NonInteractive", "-Command",
      `& ${quote(cli)} ${quote(piCli)} --no-extensions --version; exit $LASTEXITCODE`];
  } else {
    shell = "/bin/sh";
    args = ["-c", '"$1" "$2" --no-extensions --version', "pi-host-shell", cli, piCli];
  }
  return runChild(shell, args);
}

try {
  const cases = [];
  cases.push(summarize("extension_load", await runRpc(), cliManifest.version));
  cases.push(summarize("happy_path", await runRpc({ feature: true }), cliManifest.version));
  cases.push(summarize("error_path", await runRpc({ feature: true,
    pair: ["openai/missing-a", "openai/missing-b"] }), cliManifest.version));

  const firstHost = await runRpc();
  const secondHost = await runRpc({ feature: true });
  const hostExitRecord = (type, host) => ({ type,
    exit_code: host.exit_code,
    exitObserved: host.exitObserved,
    closeObserved: host.closeObserved,
    signal: host.signal,
    timedOut: host.timedOut,
    processError: host.processError,
    stderr: host.stderr,
  });
  const reloadResult = { ...secondHost,
    stdout: `${firstHost.stdout}\n--- second host stdout ---\n${secondHost.stdout}`,
    stderr: `${firstHost.stderr}\n--- second host stderr ---\n${secondHost.stderr}`,
    timedOut: firstHost.timedOut || secondHost.timedOut,
    processError: [firstHost.processError, secondHost.processError].filter(Boolean).join("; ") || null,
    records: [...secondHost.records, hostExitRecord("first_host_exit", firstHost),
      hostExitRecord("second_host_exit", secondHost)],
  };
  cases.push(summarize("reload_cleanup", reloadResult, cliManifest.version));
  cases.push(summarize("host_shell", await runHostShell(cliManifest.version), cliManifest.version));

  const report = {
    schema_version: 1,
    verification_contract: VERIFICATION_CONTRACT,
    sdk_versions: sdkVersions,
    platform: process.platform,
    model_inference: "offline deterministic OpenAI-compatible fixture server; actual Pi 1.1.0 process, package extension/tool execution, registry and provider client are not mocked",
    unhandled_errors: cases.filter((item) => item.hasUnhandledError).length,
    extension_load_errors: cases.filter((item) => item.hasLoadError
      || (item.name === "extension_load" && !item.passed)
      || (item.name === "reload_cleanup" && !item.assertions.find((assertion) => assertion.id === "reloaded_extension_registered")?.passed)).length,
    cases: cases.map(({ hasUnhandledError, hasLoadError, ...item }) => item),
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ verification_contract: VERIFICATION_CONTRACT, platform: process.platform,
    cases: cases.map(({ name, passed, exit_code, assertions }) => ({ name, passed, exit_code,
      assertions: assertions.map(({ id, passed: assertionPassed }) => ({ id, passed: assertionPassed })) })) }));
  if (cases.some((item) => !item.passed)) process.exitCode = 1;
} finally {
  server.closeAllConnections();
  await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(tempRoot, { recursive: true, force: true });
}
