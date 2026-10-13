export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_NAMES = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
];
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|shutdown error/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;

export function parseJsonLines(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed), passed: passed === true };
}

function commandsResponse(records) {
  return records.find((record) => record?.type === "response" && record.command === "get_commands");
}

function twinsToolResult(records) {
  return records.find((record) => record?.type === "tool_execution_end" && record.toolName === "twins_run");
}

function isRegistered(commands) {
  const names = commands?.data?.commands?.map((command) => command.name) ?? [];
  return ["twins:scan", "twins:config", "twins:run"].every((name) => names.includes(name));
}

function successfulFeature(records) {
  const tool = twinsToolResult(records);
  const text = tool?.result?.content?.filter((part) => part.type === "text").map((part) => part.text).join("\n") ?? "";
  return tool?.isError === false
    && text.includes("MODEL_A_RESPONSE")
    && text.includes("MODEL_B_RESPONSE")
    && text.includes("SYNTHESIS_RESPONSE");
}

function handledFeatureError(records) {
  const tool = twinsToolResult(records);
  const text = tool?.result?.content?.filter((part) => part.type === "text").map((part) => part.text).join("\n") ?? "";
  return tool?.isError === true && text.includes("pi-twins error:") && text.includes("Model not found: openai/missing-a");
}

function exitedCleanly(host) {
  return host?.exit_code === 0
    && host.exitObserved === true
    && host.closeObserved === true
    && host.timedOut !== true
    && host.signal == null
    && !host.processError;
}

export function behaviorAssertions(name, { records = [], exit_code, exitObserved, stdout = "", fullOutput = "", expectedVersion }) {
  const commands = commandsResponse(records);
  const registered = commands?.success === true && isRegistered(commands);
  const feature = successfulFeature(records);
  if (name === "extension_load") {
    return [assertion("extension_registered", "The actual Pi process discovers pi-twins scan/config/run commands",
      commands ?? null, registered && exit_code === 0 && exitObserved)];
  }
  if (name === "happy_path") {
    const tool = twinsToolResult(records);
    return [assertion("feature_response", "The real twins_run tool returns both model responses and a synthesis",
      tool ?? null, feature && exit_code === 0 && exitObserved)];
  }
  if (name === "error_path") {
    const tool = twinsToolResult(records);
    return [assertion("handled_error", "Missing configured models produce a handled twins_run error result",
      tool ?? null, handledFeatureError(records) && exit_code === 0 && exitObserved)];
  }
  if (name === "reload_cleanup") {
    const tool = twinsToolResult(records);
    const firstHost = records.find((record) => record?.type === "first_host_exit");
    const secondHost = records.find((record) => record?.type === "second_host_exit");
    const shutdownErrors = UNHANDLED_ERROR_PATTERN.test(fullOutput);
    return [
      assertion("reloaded_extension_registered", "A second actual Pi host discovers all pi-twins commands",
        commands ?? null, registered && exit_code === 0 && exitObserved),
      assertion("reloaded_feature_response", "The second host executes twins_run and returns both responses plus synthesis",
        tool ?? null, feature),
      assertion("clean_shutdown", "Both actual Pi processes exit cleanly after stdin closes",
        { firstHost: firstHost ?? null, secondHost: secondHost ?? { exit_code, exitObserved }, shutdownErrors },
        exitedCleanly(firstHost) && exitedCleanly(secondHost) && !shutdownErrors),
    ];
  }
  if (name === "host_shell") {
    return [assertion("native_shell_boundary", "The native host shell launches this checkout's pinned Pi CLI and prints its exact version",
      { exit_code, exitObserved, output: stdout.trim(), expectedVersion },
      exit_code === 0 && exitObserved && stdout.trim() === expectedVersion)];
  }
  throw new Error(`Unknown smoke case: ${name}`);
}
