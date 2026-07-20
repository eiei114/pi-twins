# pi-twins

[![CI](https://github.com/eiei114/pi-twins/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-twins/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-twins/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-twins/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-twins.svg)](https://www.npmjs.com/package/pi-twins)
[![npm downloads](https://img.shields.io/npm/dm/pi-twins.svg)](https://www.npmjs.com/package/pi-twins)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)
<a href="https://buymeacoffee.com/ekawano114m"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="217" height="60"></a>

> Run the same prompt on two models, get one synthesized answer.

## What this is

pi-twins sends your prompt to two AI models in parallel, then Pi itself reads both responses and synthesizes a single answer from the best parts. Configure model pairs via YAML. No more manually tabbing between chatbot UIs to compare answers.

## Features

- **Dual-model execution** — run the same prompt on two models simultaneously
- **Automatic synthesis** — Pi reads both responses and produces one unified answer
- **YAML configuration** — define model pairs (e.g. Claude + Gemini) in `~/.pi/twins.yaml`
- **Model discovery** — `/twins:scan` to see which models are available
- **On-demand only** — activate via `/twins:run` when you want it, no overhead otherwise

## Install

Install the published npm package with Pi:

```bash
pi install npm:pi-twins
```

Pin a specific version:

```bash
pi install npm:pi-twins@0.2.3
```

Install into the current project instead of your user Pi settings:

```bash
pi install npm:pi-twins -l
```

Or install from GitHub:

```bash
pi install git:github.com/eiei114/pi-twins
```

Try it without permanently installing:

```bash
pi -e npm:pi-twins
```

## Quick start

Try this package locally:

```bash
pi -e .
```

Then run:

```txt
/twins:run
```

Enter a prompt when asked. Pi runs both models in parallel and synthesizes one answer.

## Configuration

Create `~/.pi/twins.yaml`:

```yaml
pairs:
  default:
    - anthropic/claude-sonnet-4
    - google/gemini-2.5-pro
  coding:
    - anthropic/claude-sonnet-4
    - openai/gpt-4o
```

`/twins:run` uses the `default` pair when present. If `default` is missing, it falls back to the first configured pair.

Run `/twins:config` to create a starter file, or `/twins:scan` to list model IDs.

## Commands

| Command | Description |
|---|---|
| `/twins:run` | Send the same prompt to two models and synthesize one answer |
| `/twins:scan` | List available model IDs for `~/.pi/twins.yaml` |
| `/twins:config` | Create or show the pi-twins config file |

The `twins_run` tool is also available for agent-driven twin runs.

## Package contents

| Path | Purpose |
|---|---|
| `extensions/` | Pi extension entrypoints (`/twins:*` commands, `twins_run` tool) |
| `lib/` | Config loader, model scanner, parallel runner, synthesis helpers |
| `docs/` | Usage examples and release notes |

## Development

```bash
npm install
npm run ci
npm pack --dry-run
```

`npm run ci` runs typecheck, tests, and `npm pack --dry-run` via `pack:check`.

Local smoke test:

```bash
pi -e .
```

## Release

This package uses npm Trusted Publishing (no `NPM_TOKEN` required).

```bash
npm version patch   # or minor / major
git push && git push --tags
```

Pushing a `package.json` version bump to `main` triggers `auto-release.yml`, which tags the release and dispatches `publish.yml`.

See [`docs/release.md`](docs/release.md) for setup details.

## Docs

- [`docs/examples.md`](docs/examples.md) — command and tool examples
- [`docs/release.md`](docs/release.md) — Trusted Publishing details

## Security

Pi packages can execute code with your local permissions. Review extensions before installing third-party packages.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/pi-twins
- GitHub: https://github.com/eiei114/pi-twins
- Issues: https://github.com/eiei114/pi-twins/issues

## License

MIT
