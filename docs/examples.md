# Examples

## Local development

```bash
git clone https://github.com/eiei114/pi-twins.git
cd pi-twins
npm install
pi -e .
```

## `/twins:run`

Run the command, then enter a prompt:

```txt
/twins:run
```

Pi sends the prompt to both models in your configured pair, then synthesizes one answer.

## `/twins:scan`

List model IDs grouped by provider:

```txt
/twins:scan
```

Copy IDs into `~/.pi/twins.yaml`.

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

`pair` is optional; when omitted, pi-twins uses `default` or the first configured pair.

## Configuration example

```yaml
pairs:
  default:
    - anthropic/claude-sonnet-4
    - google/gemini-2.5-pro
```
