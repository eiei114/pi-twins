# Changelog

## [0.2.3] - 2026-07-20

### Changed

- Bump package version to `0.2.3` for the next patch release.


All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## [0.2.2] - 2026-07-04

### Changed

- Add Buy Me a Coffee sponsor button to README and native GitHub funding link via `.github/FUNDING.yml`.

## [0.2.1] - 2026-06-27

### Changed

- README install guidance now matches the current Pi OSS template: GitHub (`pi install git:`), project-local (`-l`), and explicit `npm pack --dry-run` in Development.

## [0.2.0] - 2026-06-23

### Changed

- Release prep: removed template example skill/prompt assets and trimmed README/docs for the published product.
- README now documents `/twins:run`, `/twins:scan`, `/twins:config`, and the `twins_run` tool without template bootstrap guidance.

### Added

- Parallel dual-model runner with Pi synthesis orchestration (`lib/runner.ts`, DOT-224).
- TypeBox-validated config loader and scanner unit tests.

## [0.1.5] - 2026-06-10

### Changed

- Release metadata bump for the latest Windows stability and `/twins:run` UX fixes.
- README now pins the current published install version and documents that `/twins:run` prefers the `default` pair.

## [0.1.4] - 2026-06-10

### Changed

- `/twins:run`: show thinking/progress-style status while waiting on model responses and synthesis.
  The command now updates working/status text for start, dual-model execution, synthesis, and completion.

## [0.1.3] - 2026-06-10

### Fixed

- `/twins:run`: stop hanging after prompt entry when multiple pairs exist in `~/.pi/twins.yaml`.
  The command now auto-selects the `default` pair when present, otherwise the first configured pair, instead of opening a second UI selection step.

## [0.1.2] - 2026-06-10

### Fixed

- Windows: fix child `pi -p` hangs when run from Node child processes.
  `execFile(...)` kept stdin piped, and child Pi could hang after producing output.
  `pi-twins` now uses `spawn(...)` with stdin ignored, adds a 120s timeout, and strips focus-control escape sequences from stderr.

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

