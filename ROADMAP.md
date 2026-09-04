# Roadmap — pi-twins

> Run the same prompt on two models, get one synthesized answer.

This file is the maintenance context for **pi-twins**. The weekly maintenance seed
planner reads it to pick the next bounded 30–90 minute micro-maintenance candidate.
It is intentionally short, opinionated, and seed-oriented — not a feature wishlist.

- **npm**: https://www.npmjs.com/package/pi-twins
- **GitHub**: https://github.com/eiei114/pi-twins
- **Changelog**: [`CHANGELOG.md`](CHANGELOG.md)
- **Release flow**: [`docs/release.md`](docs/release.md)

---

## Current release status

| Item | Value |
|---|---|
| Latest release | **v0.3.1** (2026-08-22) — dependency/maintenance patch |
| `package.json` version | `0.3.1` (in sync with npm) |
| npm latest | `0.3.1` |
| Next planned | **v0.3.2** (patch — docs/tests) or **v0.4.0** (minor — UX) |
| CI | `npm run ci` = typecheck + `node --test` + `npm pack --dry-run` |
| Release mechanism | npm Trusted Publishing via `auto-release.yml` → `publish.yml` |

**Recent trajectory** (see [`CHANGELOG.md`](CHANGELOG.md) for detail):

- `v0.3.1` — merged 2026-08-22 managed OSS dependency and maintenance PR batch.
- `v0.3.0` — optional synthesis controls (`balanced`, `decision`, `critique`, `concise`) with bounded per-call instructions (DOT-1436).
- `v0.2.4` — scanner catalog pruned to real model IDs (M-1, DOT-1312); README/docs alignment and dev-dependency bumps.
- `v0.2.x` — hygiene/docs/tests patch window; README sponsor button and install-path alignment.
- `v0.2.0` — parallel dual-model runner + Pi synthesis orchestration (`lib/runner.ts`, DOT-224).
- `v0.1.x` — initial release + Windows stability (`spawn EINVAL`, child `pi` hangs) and `/twins:run` UX fixes.

**Recently completed seeds** (removed from the candidate table):

- **M-2** — `resolvePair` / `ensureConfig` tests (`extensions-helpers.test.mjs`, DOT-1545).
- **M-3** — `synthesizeResponses` + `formatTwinsMarkdown` tests (`runner.test.mjs`, #45).

### Known housekeeping (low priority)

- No open Dependabot PRs at last check; re-run `gh pr list` before the next seed batch.
- `extensions/index.ts` still hardcodes a Japanese completion string (`"完了"`) in `/twins:run` — see M-8.

---

## Project goals & priorities

pi-twins is a small, focused Pi package. The product is stable and the bar for a
release is **"does the dual-model → synthesis loop still work, and is the surface
intentionally small?"** Maintenance should keep the package trustworthy, not grow it.

Priorities, in order:

1. **Correctness & stability of the twin run.** `/twins:run` and the `twins_run` tool
   must reliably call two models in parallel and synthesize one answer across the
   supported platforms (Windows is a first-class target — see `v0.1.x` history).
2. **A trustworthy model catalog.** `/twins:scan` must not point users at fictional
   or stale model IDs. (Current `scanner.ts` is a hardcoded MVP list — see debt below.)
3. **Small, intentional package surface.** No churn dependencies, no unused files in
   the published tarball (`npm pack --dry-run` must stay clean).
4. **Documentation that matches behavior.** README, `docs/`, and `CHANGELOG.md` stay
   in sync; errors are explained where users hit them.

Non-goals for this maintenance window: adding new providers, a GUI, persistent
history, or a hosted service.

---

## Short-term maintenance goals (next 1–2 releases)

### v0.3.2 — docs & test hygiene (patch)

Close the remaining documentation and typing gaps without changing default twin-run
behavior. Primary targets: user-facing troubleshooting guide (M-4), a short
architecture note for the run → synthesize flow (M-9), and removing `as any` from
the `twins_run` tool return type (M-7). These are low-risk and suitable for a patch
bump once at least one doc seed lands.

### v0.4.0 — small UX improvements (minor)

- Interactive pair selection for `/twins:run` when more than one pair is configured
  and no `default` pair is present (M-5).
- Configurable synthesis prompt language (English default, Japanese as an option)
  instead of the current always-Japanese synthesis instruction (M-6).

These are additive, opt-in, and behind config or UI — a minor bump.

---

## Candidate maintenance seeds

Each seed below is bounded to roughly **30–90 minutes** and has explicit acceptance
criteria. The weekly seed planner may promote any of these into a backlog issue.
Seeds are tagged by area: `docs` · `tests` · `refactor` · `feature` · `chore`.

| ID | Title | Area | Est. | Target | Why now |
|---|---|---|---|---|---|
| M-4 | Add `docs/troubleshooting.md` (common errors → fixes) | docs | ~45–60m | v0.3.2 | Users hit config/model/spawn errors with no mapped fixes; README docs section is thin. |
| M-5 | Interactive pair picker for `/twins:run` | feature | ~45–75m | v0.4.0 | Multi-pair configs silently use the first pair; explicit selection reduces surprise. |
| M-6 | Configurable synthesis prompt language (EN default, JA option) | feature | ~60–90m | v0.4.0 | `buildSynthesisPrompt` is always Japanese; English-first configs need an opt-in path. |
| M-7 | Type `twins_run` tool return (remove `as any`) | refactor | ~30–45m | v0.3.2 | Tool handler casts to `any`; proper typing catches regressions before publish. |
| M-8 | Localize `/twins:run` completion message | chore | ~30m | v0.3.2 | Hardcoded `"完了"` is inconsistent with EN synthesis defaults planned in M-6. |
| M-9 | Add `docs/architecture.md` (run → synthesize flow) | docs | ~45–60m | v0.3.2 | New contributors lack a one-page map of `extensions/` → `lib/runner.ts` → synthesis. |

### M-4 — Add `docs/troubleshooting.md`

Document the errors users actually hit, mapped to fixes: config not found
(`ConfigNotFoundError`), model not found (`Model not found: …`), Windows spawn
issues (`spawn EINVAL`, child `pi` hangs), and "Both models failed". Link it from
`README.md` under Docs.

- **Why**: Error strings exist in code but are not collected anywhere user-facing.
- **Acceptance**: `docs/troubleshooting.md` exists and covers all four error
  classes above; README links to it; `npm run ci` green.

### M-5 — Interactive pair picker for `/twins:run`

Today `/twins:run` silently auto-selects `default`, else the first pair. When two
or more pairs exist and there is no `default`, offer an interactive selection via
the Pi UI instead of silently using `names[0]`.

- **Why**: `resolvePair` fallback is correct but opaque; users with multiple pairs
  cannot choose without editing YAML.
- **Acceptance**: with ≥2 pairs and no `default`, the user can choose; a single
  pair or a present `default` keeps current behavior; new test for the selection
  branch; manual `pi -e .` smoke passes; `npm run ci` green.

### M-6 — Configurable synthesis prompt language

`buildSynthesisPrompt` always emits a Japanese synthesis instruction. Make the
language configurable: default English, Japanese available via a config field
(e.g. `synthesis.language: ja`). Non-breaking — default behavior changes to EN, so
gate behind v0.4.0.

- **Why**: Synthesis controls (v0.3.0) added modes/instructions but not locale;
  English-first users get a Japanese synthesis prompt today.
- **Acceptance**: `schema.ts` + config loader support a `synthesis.language`
  option; `buildSynthesisPrompt` honors it; tests for both languages;
  `docs/examples.md` updated; `npm run ci` green.

### M-7 — Type `twins_run` tool return

The `twins_run` execute handler returns `{ ... } as any` on success and error
paths. Define a small result type aligned with Pi's tool return shape and remove
the casts.

- **Why**: `as any` hides shape drift between `formatTwinsMarkdown` output and
  what Pi expects; cheap to fix now that M-3 tests cover formatting paths.
- **Acceptance**: no `as any` in `extensions/index.ts` tool handler; typecheck
  passes; `npm run ci` green; no runtime behavior change.

### M-8 — Localize `/twins:run` completion message

Replace the hardcoded `"完了"` completion message in `/twins:run` with a neutral
English default (or tie it to the same language knob as M-6 if that lands first).

- **Why**: Visible UX inconsistency for non-Japanese users; one-line fix unless
  blocked on M-6's config surface.
- **Acceptance**: completion message is English by default; `npm run ci` green;
  manual smoke shows the updated string.

### M-9 — Add `docs/architecture.md`

One-page overview: config load → pair resolution → parallel `runTwins` →
`buildSynthesisPrompt` / `synthesizeResponses` → markdown output. Link from
README Docs and optionally from CONTRIBUTING.

- **Why**: Maintenance agents and new contributors need a stable map before
  touching runner or extension wiring.
- **Acceptance**: `docs/architecture.md` exists with the flow above; README
  links to it; `npm run ci` green.

---

## Known technical debt (medium-term, larger than a single seed)

- **Static model discovery.** `scanner.ts` returns a curated list rather than
  reading Pi's provider registry dynamically (the file says so itself). M-1 keeps
  the list honest in the short term; a future minor could read models live.
- **No per-model timeout / retry.** The runner relies entirely on a passed
  `AbortSignal`; there is no per-model timeout or single-retry on transient
  provider errors. Worth a design pass once doc/typing seeds (M-4/M-7) land.
- **CONTRIBUTING.md is minimal.** No pointer to this roadmap or to test-contribution
  expectations — fold a short "maintenance seeds" pointer in on the next docs pass
  (can piggyback on M-9).

---

## Areas needing improvement

- **Docs**: README is solid; `docs/` only has `examples.md` + `release.md`. Needs
  `troubleshooting.md` (M-4) and an architecture note (M-9).
- **Tests**: `lib/` and extension helpers are reasonably covered after M-2/M-3;
  interactive pair selection (M-5) still lacks tests.
- **Examples**: `docs/examples.md` shows happy-path commands only; no error/config
  examples. Improve alongside M-4.

---

## How seeds become issues (for the weekly seed planner)

1. Pick one seed from the **Candidate maintenance seeds** table above.
2. Create a scoped issue referencing the seed ID (e.g. `M-4`) with its acceptance
   criteria copied verbatim.
3. Keep the change within the stated estimate (30–90 min). If a seed grows beyond
   that, split it and leave the remainder here as a new seed.
4. On merge, update this roadmap: move the completed seed under **Current release
   status** history and mark the next target.

---

## Maintaining this file

- **When you cut a release**: update **Current release status** and the trajectory
  list; resolve changelog drift before tagging.
- **When you finish a seed**: strike it from the table or move it to history; keep
  the candidate count at ≥3 so the planner always has options.
- **Keep seeds bounded**: every candidate must have an estimate and acceptance
  criteria. Vague items belong in **Known technical debt**, not the seed table.
