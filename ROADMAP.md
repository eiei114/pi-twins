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
| Latest release | **v0.2.2** (2026-07-04) — sponsor button + patch |
| `package.json` version | `0.2.2` (in sync with npm) |
| npm latest | `0.2.2` |
| Next planned | **v0.2.3** (patch — hygiene/docs/tests) → **v0.3.0** (minor — behavior) |
| CI | `npm run ci` = typecheck + `node --test` + `npm pack --dry-run` |
| Release mechanism | npm Trusted Publishing via `auto-release.yml` → `publish.yml` |

**Recent trajectory** (see [`CHANGELOG.md`](CHANGELOG.md) for detail):

- `v0.2.2` — README sponsor button + native GitHub funding link (`.github/FUNDING.yml`).
- `v0.2.1` — README install paths aligned with the Pi OSS template.
- `v0.2.0` — parallel dual-model runner + Pi synthesis orchestration (`lib/runner.ts`, DOT-224); TypeBox-validated config loader + scanner tests.
- `v0.1.x` — initial release + Windows stability (`spawn EINVAL`, child `pi` hangs) and `/twins:run` UX fixes.

### Known housekeeping (low priority)

- `CHANGELOG.md` still lists the sponsor note under **Unreleased**, but it shipped in `v0.2.2`. Fold it into a `[0.2.2]` section on the next doc pass (seed `M-0`).
- Two Dependabot PRs are open and awaiting review: `typebox 1.3.0 → 1.3.6` (#20) and `@types/node 22 → 25.9.3` (#21).

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

## Short-term maintenance goals (next 2–3 releases)

### v0.2.3 — hygiene, docs & tests (patch, no behavior change)

Land the low-risk seeds: reconcile the changelog, refresh the model catalog so it
only references real models, backfill the missing unit tests, and add a
troubleshooting doc. No user-facing behavior change, so this is a patch bump.

### v0.3.0 — small behavior improvements (minor)

- Interactive pair selection for `/twins:run` when more than one pair is configured.
- A configurable synthesis prompt language (English default, Japanese as an option)
  instead of the current always-Japanese synthesis instruction.

These are additive, opt-in, and behind config — a minor bump.

---

## Candidate maintenance seeds

Each seed below is bounded to roughly **30–90 minutes** and has explicit acceptance
criteria. The weekly seed planner may promote any of these into a backlog issue.
Seeds are tagged by area: `docs` · `tests` · `refactor` · `feature` · `chore`.

| ID | Title | Area | Est. | Target |
|---|---|---|---|---|
| M-0 | Reconcile CHANGELOG Unreleased → `[0.2.2]` | docs | ~20–30m | v0.2.3 |
| M-1 | Refresh `scanner.ts` model catalog (remove fictional/stale IDs) | refactor | ~30–45m | v0.2.3 |
| M-2 | Backfill `extensions/index.ts` tests (`resolvePair`, `ensureConfig`) | tests | ~45–60m | v0.2.3 |
| M-3 | Add `synthesizeResponses` + `formatTwinsMarkdown` tests | tests | ~30–45m | v0.2.3 |
| M-4 | Add `docs/troubleshooting.md` (common errors → fixes) | docs | ~45–60m | v0.2.3 |
| M-5 | Interactive pair picker for `/twins:run` | feature | ~45–75m | v0.3.0 |
| M-6 | Configurable synthesis prompt language (EN default, JA option) | feature | ~60–90m | v0.3.0 |

### M-0 — Reconcile CHANGELOG Unreleased → `[0.2.2]`
The sponsor button shipped in `v0.2.2` but `CHANGELOG.md` still lists it under
**Unreleased**. Move it into a dated `[0.2.2]` section.
- **Acceptance**: `CHANGELOG.md` has a `[0.2.2] - 2026-07-04` section containing the
  sponsor note; **Unreleased** is empty or removed; `npm run ci` green.

### M-1 — Refresh `scanner.ts` model catalog
`lib/scanner.ts` is a hardcoded MVP list and contains IDs that do not resolve to
real models (e.g. `deepseek/deepseek-v4-pro`) and a duplicate-ish date-pinned
Claude entry. Prune to models that actually resolve via Pi's provider registry.
- **Acceptance**: every ID in `KNOWN_MODELS` is a real, currently-available model
  in `provider/model-id` form; no fictional IDs; existing `config-scanner.test.mjs`
  assertions still pass (update display names only if needed); `npm run ci` green.

### M-2 — Backfill `extensions/index.ts` tests
The command wiring in `extensions/index.ts` is currently untested. Focus on the
pure helpers: `resolvePair` (default fallback → first-pair fallback → named pair)
and the config-existence branch of `ensureConfig`. Extract or re-export helpers
from `lib/` if needed to make them importable from `node --test`.
- **Acceptance**: new test file covers all three `resolvePair` branches and the
  missing-config path; `npm run ci` green; no behavior change.

### M-3 — Cover `synthesizeResponses` + `formatTwinsMarkdown`
`lib/runner.ts` exposes synthesis and full-output formatting that have no direct
tests today (only `buildSynthesisPrompt` / `formatResponsesMarkdown` are covered).
- **Acceptance**: tests cover the success path, the partial-failure path (one model
  errored), and the "synthesis model fails → throws" path; `npm run ci` green.

### M-4 — Add `docs/troubleshooting.md`
Document the errors users actually hit, mapped to fixes: config not found
(`ConfigNotFoundError`), model not found (`Model not found: …`), Windows spawn
issues (`spawn EINVAL`, child `pi` hangs), and "Both models failed". Link it from
`README.md` under Docs.
- **Acceptance**: `docs/troubleshooting.md` exists and covers all four error
  classes above; README links to it; `npm run ci` green.

### M-5 — Interactive pair picker for `/twins:run`
Today `/twins:run` silently auto-selects `default`, else the first pair. When two
or more pairs exist and there is no `default`, offer an interactive selection via
the Pi UI instead of silently using `names[0]`.
- **Acceptance**: with ≥2 pairs and no `default`, the user can choose; a single
  pair or a present `default` keeps current behavior; new test for the selection
  branch; manual `pi -e .` smoke passes; `npm run ci` green.

### M-6 — Configurable synthesis prompt language
`buildSynthesisPrompt` always emits a Japanese synthesis instruction. Make the
language configurable: default English, Japanese available via a config field
(e.g. `synthesis.language: ja`). Non-breaking — default behavior changes to EN, so
gate behind v0.3.0.
- **Acceptance**: `schema.ts` + config loader support a `synthesis.language`
  option; `buildSynthesisPrompt` honors it; tests for both languages;
  `docs/examples.md` updated; `npm run ci` green.

---

## Known technical debt (medium-term, larger than a single seed)

- **Static model discovery.** `scanner.ts` returns a curated list rather than
  reading Pi's provider registry dynamically (the file says so itself). M-1 keeps
  the list honest in the short term; a future minor could read models live.
- **`as any` casts on tool return values.** `twins:run`'s tool handler casts its
  return as `any`. Type the result properly in a refactor pass.
- **No per-model timeout / retry.** The runner relies entirely on a passed
  `AbortSignal`; there is no per-model timeout or single-retry on transient
  provider errors. Worth a design pass once the test backfill (M-2/M-3) lands.
- **CONTRIBUTING.md is minimal.** No pointer to this roadmap or to test-contribution
  expectations — fold a short "maintenance seeds" pointer in on the next docs pass.

---

## Areas needing improvement

- **Docs**: README is solid; `docs/` only has `examples.md` + `release.md`. Needs
  `troubleshooting.md` (M-4) and an architecture note for the run → synthesize flow.
- **Tests**: `lib/` is reasonably covered; `extensions/index.ts` (the command/tool
  wiring) has no tests (M-2), and synthesis output paths are thin (M-3).
- **Examples**: `docs/examples.md` shows happy-path commands only; no error/config
  examples. Improve alongside M-4.

---

## How seeds become issues (for the weekly seed planner)

1. Pick one seed from the **Candidate maintenance seeds** table above.
2. Create a scoped issue referencing the seed ID (e.g. `M-1`) with its acceptance
   criteria copied verbatim.
3. Keep the change within the stated estimate (30–90 min). If a seed grows beyond
   that, split it and leave the remainder here as a new seed.
4. On merge, update this roadmap: move the completed seed under **Current release
   status** history and mark the next target.

---

## Maintaining this file

- **When you cut a release**: update **Current release status** and the trajectory
  list; resolve M-0-style changelog drift before tagging.
- **When you finish a seed**: strike it from the table or move it to history; keep
  the candidate count at ≥3 so the planner always has options.
- **Keep seeds bounded**: every candidate must have an estimate and acceptance
  criteria. Vague items belong in **Known technical debt**, not the seed table.
