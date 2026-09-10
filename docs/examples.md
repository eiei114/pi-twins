# Examples

## Local development

Clone, install dependencies, run the repository checks, then load the extension locally:

```bash
git clone https://github.com/eiei114/pi-twins.git
cd pi-twins
npm install
npm run ci
pi -e .
```

`npm run ci` runs typecheck, tests, and `npm pack --dry-run` — the same gate used in CI.

## First-time setup

After `pi -e .` (or `pi install npm:pi-twins`), configure a pair before your first run:

1. `/twins:config` — create or show `~/.pi/twins.yaml`
2. `/twins:scan` — list valid model IDs grouped by provider
3. Edit `~/.pi/twins.yaml` if needed, then `/twins:run`

If config is missing, `/twins:run` offers to create a starter file. See [`docs/troubleshooting.md`](troubleshooting.md) when setup or runs fail.

## `/twins:run`

Run the command, then enter a prompt:

```txt
/twins:run
```

Pi sends the prompt to both models in your configured pair, then synthesizes one answer. With multiple pairs, the `default` pair is used when present; otherwise pi-twins uses the first configured pair.

## `/twins:scan`

List model IDs grouped by provider:

```txt
/twins:scan
```

Copy **exact** IDs (format `provider/model-id`) into `~/.pi/twins.yaml`.

## `/twins:config`

Create or show `~/.pi/twins.yaml`:

```txt
/twins:config
```

## `twins_run` tool

Agents can call the tool directly:

```json
{
  "prompt": "Compare SQLite vs PostgreSQL for a small SaaS app",
  "pair": "default"
}
```

`pair` is optional. When omitted, pi-twins uses the `default` pair when present; otherwise it uses the first configured pair.

Override synthesis defaults for one tool call:

```json
{
  "prompt": "Compare SQLite vs PostgreSQL for a small SaaS app",
  "pair": "default",
  "synthesisMode": "decision",
  "synthesisInstructions": "End with a recommended choice and migration caveats."
}
```

When both models fail, the tool returns `isError: true` with per-model messages (for example `anthropic/claude-sonnet-4: Model not found: …; google/gemini-2.5-pro: …`). See [`docs/troubleshooting.md`](troubleshooting.md) for fixes.

## Configuration example

```yaml
pairs:
  default:
    - anthropic/claude-sonnet-4
    - google/gemini-2.5-pro
  coding:
    - anthropic/claude-sonnet-4
    - openai/gpt-4o

# Optional synthesis defaults; omit for balanced behavior.
synthesis:
  mode: critique # balanced | decision | critique | concise
  instructions: "Highlight uncertain claims before the final answer."
```

Synthesis modes:

| Mode | Use when |
|---|---|
| `balanced` | Default — merge the best parts without a strong bias |
| `decision` | You want a clear recommendation or choice |
| `critique` | You want disagreements and uncertainty surfaced first |
| `concise` | You want a shorter final answer |

Per-call overrides via `twins_run` (`synthesisMode`, `synthesisInstructions`) take precedence over the YAML defaults.
