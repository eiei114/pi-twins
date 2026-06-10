# pi-twins

[![CI](https://github.com/eiei114/pi-twins/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-twins/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-twins/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-twins/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-twins.svg)](https://www.npmjs.com/package/pi-twins)
[![npm downloads](https://img.shields.io/npm/dm/pi-twins.svg)](https://www.npmjs.com/package/pi-twins)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)

> Run the same prompt on two models, get one synthesized answer.

## What this is

pi-twins sends your prompt to two AI models in parallel, then Pi itself reads both responses and synthesizes a single answer from the best parts. Configure model pairs via YAML. No more manually tabbing between chatbot UIs to compare answers.

## Features

- **Dual-model execution** — run the same prompt on two models simultaneously
- **Automatic synthesis** — Pi reads both responses and produces one unified answer
- **YAML configuration** — define model pairs (e.g. Claude + Gemini) in `~/.pi/twins.yaml`
- **Model discovery** — `/twins:scan` to see which models are available
- **On-demand only** — activate via `/twins` when you want it, no overhead otherwise

## Install

Install the published npm package with Pi:

```bash
pi install npm:pi-twins
```

Pin a specific version:

```bash
pi install npm:pi-twins@0.1.0
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
/twins "What are the tradeoffs between SQLite and PostgreSQL for my use case?"
```

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

## Commands

/twins:run — 2モデルに同じプロンプトを投げて統合回答を得る（プロンプトは実行後に入力）
/twins:scan — 利用可能なモデル一覧を表示

引数は不要。詳細は各コマンド実行後のプロンプト

## Package contents

| Path | Purpose |
|---|---|
| `extensions/` | Pi TypeScript extension entrypoints (`*.ts` and `index.ts`) |
| `lib/` | Shared TypeScript helpers |
| `skills/` | Agent Skills |
| `prompts/` | Prompt templates |
| `themes/` | Pi themes |
| `docs/` | Optional supporting docs (usage, examples, release, ADRs) |

## Development

```bash
npm install
npm run ci
```

## Development flow

Use this default flow when building a new Pi extension OSS project from this template:

1. Create the Vault project notes under `4_Project/<ProjectName>/`.
2. Add `CONTEXT.md`, `README.md`, `ROADMAP.md`, `Docs/`, `Issues/`, and `Progress/`.
3. Write the PRD in `4_Project/<ProjectName>/Docs/`.
4. Split approved tracer-bullet issues into `4_Project/<ProjectName>/Issues/`.
5. Implement in the OSS repo.
6. Run `npm run ci`, `npm test`, and `npm pack --dry-run`.
7. Release with Trusted Publishing.
8. Save release notes and follow-up decisions back to the Vault project.

Short version:

```txt
Vault notes -> PRD -> Issues -> implement -> ci/check -> release -> save learnings
```

## Release

This package is set up for npm Trusted Publishing, so no `NPM_TOKEN` is required.

```bash
npm version patch
git push
```

See [`docs/release.md`](docs/release.md) for setup details.

## Docs

`docs/` is optional supporting documentation, not a fixed six-file set. README stays the GitHub/npm entrypoint; add `docs/*.md` only when they help users or maintainers.

After creating a repository from this template:

1. Delete or merge template bootstrap docs that no longer add project value.

Useful docs to keep when they add value:

- [`docs/examples.md`](docs/examples.md) — examples for extensions, skills, prompts, and themes
- [`docs/release.md`](docs/release.md) — Trusted Publishing details (README Release summarizes the flow)
- `docs/usage.md` — create when usage does not fit in README

Optional maintainer guidance (not a public-user navigation target in mature repos):

- [`docs/template-checklist.md`](docs/template-checklist.md)

Template bootstrap docs to delete or merge after setup unless they still teach something project-specific:

- `docs/github-template.md`
- `docs/repository-settings.md`
- `docs/typescript.md`

## Security

Pi packages can execute code with your local permissions. Review extensions before installing third-party packages.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/pi-twins
- GitHub: https://github.com/eiei114/pi-twins
- Issues: https://github.com/eiei114/pi-twins/issues

## License

MIT\n