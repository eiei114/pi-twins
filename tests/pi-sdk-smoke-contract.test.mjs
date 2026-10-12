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

test("reload contract requires real second-host registration, feature output, and clean shutdown", () => {
  const input = { records: [commands, successTool, { type: "first_host_exit", exit_code: 0, exitObserved: true }],
    exit_code: 0, exitObserved: true };
  assert.deepEqual(behaviorAssertions("reload_cleanup", input).map((item) => item.passed), [true, true, true]);
  assert.deepEqual(behaviorAssertions("reload_cleanup", { ...input, records: [successTool,
    { type: "first_host_exit", exit_code: 0, exitObserved: true }] })
    .map((item) => item.passed), [false, true, true]);
  assert.equal(behaviorAssertions("reload_cleanup", { ...input, records: [commands, successTool,
    { type: "first_host_exit", exit_code: 1, exitObserved: true }] })[2].passed, false);
  assert.equal(behaviorAssertions("reload_cleanup", { ...input, exitObserved: false })[2].passed, false);
});

test("host-shell contract requires exact pinned CLI version and observed process exit", () => {
  const expectedVersion = "1.1.0";
  assert.equal(behaviorAssertions("host_shell", { exit_code: 0, exitObserved: true,
    stdout: `${expectedVersion}\n`, expectedVersion })[0].passed, true);
  assert.equal(behaviorAssertions("host_shell", { exit_code: 0, exitObserved: true,
    stdout: "", expectedVersion })[0].passed, false);
});
