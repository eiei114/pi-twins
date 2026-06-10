# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## [0.1.1] - 2026-06-10

### Fixed

- Windows: fix `spawn EINVAL` error when invoking `pi.cmd` via `execFile` (Node.js v23+).
  Now uses `cmd.exe /c pi` wrapper on win32 to avoid the batch-file spawn issue.

## [0.1.0] - 2026-06-10

### Added

- Initial release of pi-twins — dual-model synthesis for Pi.
- `/twins:run` command: ask two models the same question and get a synthesized answer.
- `twins_run` tool: AI-accessible tool for twin model execution.
- `/twins:scan` command: display available models for configuration.
- `/twins:config` command: create or show `~/.pi/twins.yaml`.
- YAML configuration system with model pair definitions.
- Agent state machine for sequential model calling (model A → model B → synthesis).
- Error resilience: stale state timeout, model-not-found graceful fallback.
