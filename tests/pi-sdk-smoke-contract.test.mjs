import assert from "node:assert/strict";
import test from "node:test";
import { behaviorAssertions } from "../scripts/pi-sdk-smoke-contract.mjs";

const commands = {
  type: "response",
  command: "get_commands",
  success: true,
  data: { commands: ["twins:scan", "twins:config", "twins:run"].map((name) => ({ name })) },
};
const successTool = {
  type: "tool_execution_end",
  toolName: "twins_run",
  isError: false,
  result: { content: [{ type: "text", text: "MODEL_A_RESPONSE MODEL_B_RESPONSE SYNTHESIS_RESPONSE" }] },
};
const errorTool = {
  type: "tool_execution_end",
  toolName: "twins_run",
  isError: true,
  result: { content: [{ type: "text", text: "pi-twins error: openai/missing-a: Model not found: openai/missing-a" }] },
};
const cleanHost = {
  exit_code: 0,
  exitObserved: true,
  closeObserved: true,
  signal: null,
  timedOut: false,
  processError: null,
  stdout: "",
  stderr: "",
};

function reloadAssertions(firstHost = {}, secondHost = {}) {
  const first = { ...cleanHost, ...firstHost, type: "first_host_exit" };
  const second = { ...cleanHost, ...secondHost, type: "second_host_exit" };
  const fullOutput = [first.stdout, first.stderr, second.stdout, second.stderr].join("\n");
  return behaviorAssertions("reload_cleanup", { records: [commands, successTool, first, second],
    exit_code: second.exit_code, exitObserved: second.exitObserved, fullOutput });
}

test("smoke contract accepts actual feature output and fails closed when it is absent", () => {
  const input = { records: [commands, successTool], exit_code: 0, exitObserved: true };
  assert.equal(behaviorAssertions("happy_path", input)[0].passed, true);
  assert.equal(behaviorAssertions("happy_path", { ...input, records: [commands] })[0].passed, false);
});

test("smoke contract accepts the handled error and fails closed when it is absent", () => {
  const input = { records: [commands, errorTool], exit_code: 0, exitObserved: true };
  assert.equal(behaviorAssertions("error_path", input)[0].passed, true);
  assert.equal(behaviorAssertions("error_path", { ...input, records: [commands] })[0].passed, false);
});

test("reload contract requires second-host behavior and clean shutdown from both hosts", () => {
  assert.deepEqual(reloadAssertions().map((item) => item.passed), [true, true, true]);
  assert.deepEqual(reloadAssertions({ exit_code: 1 }).map((item) => item.passed), [true, true, false]);
  assert.deepEqual(reloadAssertions({ exitObserved: false }).map((item) => item.passed), [true, true, false]);
  assert.deepEqual(reloadAssertions({ closeObserved: false }).map((item) => item.passed), [true, true, false]);
  assert.deepEqual(reloadAssertions({ timedOut: true }).map((item) => item.passed), [true, true, false]);
  assert.deepEqual(reloadAssertions({ processError: "spawn failed" }).map((item) => item.passed), [true, true, false]);
  assert.deepEqual(reloadAssertions({ signal: "SIGTERM" }).map((item) => item.passed), [true, true, false]);
  assert.deepEqual(reloadAssertions({ stderr: "shutdown error: first host failed" })
    .map((item) => item.passed), [true, true, false]);
  assert.deepEqual(reloadAssertions({}, { exit_code: 1 }).map((item) => item.passed), [false, true, false]);
  assert.deepEqual(reloadAssertions({}, { closeObserved: false }).map((item) => item.passed), [true, true, false]);
  assert.deepEqual(reloadAssertions({}, { timedOut: true }).map((item) => item.passed), [true, true, false]);
  assert.deepEqual(reloadAssertions({}, { processError: "spawn failed" }).map((item) => item.passed), [true, true, false]);
  assert.deepEqual(reloadAssertions({}, { stderr: "shutdown error: second host failed" })
    .map((item) => item.passed), [true, true, false]);
  assert.deepEqual(reloadAssertions({ stderr: "shutdown error: first host failed" },
    { stderr: "shutdown error: second host failed" }).map((item) => item.passed), [true, true, false]);
  assert.deepEqual(behaviorAssertions("reload_cleanup", { records: [successTool,
    { type: "first_host_exit", ...cleanHost }, { type: "second_host_exit", ...cleanHost }],
    exit_code: 0, exitObserved: true }).map((item) => item.passed), [false, true, true]);
});

test("host-shell contract requires exact pinned CLI version and observed process exit", () => {
  const expectedVersion = "1.1.0";
  assert.equal(behaviorAssertions("host_shell", { exit_code: 0, exitObserved: true,
    stdout: `${expectedVersion}\n`, expectedVersion })[0].passed, true);
  assert.equal(behaviorAssertions("host_shell", { exit_code: 0, exitObserved: true,
    stdout: "", expectedVersion })[0].passed, false);
});
