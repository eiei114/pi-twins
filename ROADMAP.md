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
| Repository package version | **0.4.4** (`package.json`) |
| npm registry freshness | Not checked; do not infer it from the repository version. |
| Next maintenance target | Choose from the bounded candidates below; no release target is assigned. |
| CI | `npm run ci` = typecheck + tests + Pi SDK smoke + `npm pack --dry-run` |
| Release mechanism | npm Trusted Publishing via `auto-release.yml` → `publish.yml` |

**Recent trajectory** (see [`CHANGELOG.md`](CHANGELOG.md) for detail):

- `v0.3.7` — updated the Pi SDK dependencies to 0.99.1.
- `v0.4.0` — added configurable Japanese/English synthesis language (`CHANGELOG.md`, DOT-2605).
- `v0.3.0` — added synthesis controls (`balanced`, `decision`, `critique`, `concise`) with bounded instructions (DOT-1436).
- `v0.2.4` — pruned the scanner catalog and aligned README/docs with the release workflow.
- `v0.2.0` — added the parallel dual-model runner and Pi synthesis orchestration (`lib/runner.ts`, DOT-224).
- `v0.1.x` — initial release + Windows stability (`spawn EINVAL`, child `pi` hangs) and `/twins:run` UX fixes.

**Recently completed seeds** (removed from the candidate table):

- **M-2** — `resolvePair` / `ensureConfig` tests (`extensions-helpers.test.mjs`, DOT-1545).
- **M-3** — `synthesizeResponses` + `formatTwinsMarkdown` tests (`runner.test.mjs`, #45).
- **M-4** — Troubleshooting guide covering config, model, Windows spawn, and dual-failure errors (DOT-1750).
- **M-5** — Interactive pair picker for `/twins:run` (#56).
- **M-6** — Configurable Japanese/English synthesis prompt language (`schema.ts`, `runner.ts`, DOT-2605).
- **M-7** — Typed `twins_run` tool return (DOT-1729).

### Known housekeeping (low priority)

- Registry/release freshness needs an explicit check before selecting a release seed; it is not available from this local checkout alone.
- `extensions/index.ts` still hardcodes a Japanese completion string (`"完了"`) in `/twins:run` — see M-8.
- `docs/architecture.md` is still absent; the flow is described below as M-9.

---

## Project goals & priorities

pi-twins is a small, focused Pi package. The product is stable and the bar for a
release is **"does the dual-model → synthesis loop still work, and is the surface
intentionally small?"** Maintenance should keep the package trustworthy, not grow it.

Priorities, in order:

1. **Correctness & stability of the twin run.** `/twins:run` and the `twins_run` tool
   must reliably call two models in parallel and synthesize one answer across the
   supported platforms (Windows is a first-class target — see `v0.1.x` history).
2. **Useful model discovery.** `/twins:scan` reads Pi's provider registry when it is
   available. If the registry is empty or unavailable, it clearly labels the curated
   model list as examples rather than live, verified IDs.
3. **Small, intentional package surface.** No churn dependencies, no unused files in
   the published tarball (`npm pack --dry-run` must stay clean).
4. **Documentation that matches behavior.** README, `docs/`, and `CHANGELOG.md` stay
   in sync; errors are explained where users hit them.

Non-goals for this maintenance window: adding new providers, a GUI, persistent
history, or a hosted service.

---

## Near-term maintenance goals

Choose a bounded documentation or maintenance candidate below. These are not tied to
a package version or release schedule. Synthesis language configuration and the
interactive pair picker are already implemented; preserve their existing behavior
when making related changes.

---

## Candidate maintenance seeds

Each seed below is bounded to roughly **30–90 minutes** and has explicit acceptance
criteria. The weekly seed planner may promote any of these into a backlog issue.
Seeds are tagged by area: `docs` · `tests` · `refactor` · `feature` · `chore`.

| ID | Title | Area | Est. | Target | Why now |
|---|---|---|---|---|---|
| M-8 | Localize `/twins:run` completion message | chore | ~30m | next seed | Hardcoded `"完了"` is inconsistent with the package's English-facing documentation. |
| M-9 | Add `docs/architecture.md` (run → synthesize flow) | docs | ~45–60m | next seed | New contributors lack a one-page map of `extensions/` → `lib/runner.ts` → synthesis. |
| M-10 | Verify registry/package release freshness before a version bump | chore | ~30m | next seed | Repository metadata and registry state can drift; record the check before planning release work. |

### Completed: M-4 — Add `docs/troubleshooting.md`

This seed is complete; see [`docs/troubleshooting.md`](docs/troubleshooting.md).

> Historical acceptance criteria (completed; retained for traceability):
>

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


### M-8 — Localize `/twins:run` completion message

Replace the hardcoded `"完了"` completion message in `/twins:run` with a neutral
English default, or tie it to the existing synthesis language setting if appropriate.

- **Why**: Visible UX inconsistency for non-Japanese users.
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

- **Curated scanner fallback.** When Pi's provider registry is empty or unavailable,
  `scanner.ts` shows a curated examples list and labels it as unverified. Keep that
  fallback list accurate and do not present it as a live registry result.
- **No per-model timeout / retry.** The runner relies entirely on a passed
  `AbortSignal`; there is no per-model timeout or single-retry on transient
  provider errors. Worth a design pass once the current documentation seeds (M-8/M-9) land.
- **CONTRIBUTING.md is minimal.** No pointer to this roadmap or to test-contribution
  expectations — fold a short "maintenance seeds" pointer in on the next docs pass
  (can piggyback on M-9).

---

## Areas needing improvement

- **Docs**: README and `docs/troubleshooting.md` are current; `docs/architecture.md`
  remains the main documentation gap (M-9).
- **Tests**: `lib/` and extension helpers are reasonably covered after M-2/M-3;
  preserve picker coverage when changing pair selection.
- **Examples**: `docs/examples.md` shows happy-path commands; add architecture links
  or focused error/config examples only when a seed requires them.

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
