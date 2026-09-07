# Troubleshooting

Common pi-twins errors and how to fix them. For setup and examples, see [`docs/examples.md`](examples.md).

## Config not found (`ConfigNotFoundError`)

**Symptoms**

- Error name: `ConfigNotFoundError`
- Message includes `pi-twins config not found at …/twins.yaml`
- `/twins:run` or `twins_run` stops before asking for a prompt

**Cause**

pi-twins expects a YAML config at `~/.pi/twins.yaml` (or the path shown in the error). The file is missing.

**Fix**

1. Run `/twins:config` in Pi to create a starter file, or create it manually:

   ```yaml
   pairs:
     default:
       - anthropic/claude-sonnet-4
       - google/gemini-2.5-pro
   ```

2. Run `/twins:scan` to list valid model IDs, then edit the pair entries to match your providers.
3. Retry `/twins:run`.

If you cancel the “Create default config?” prompt in `/twins:run`, the command exits without creating a file. Run `/twins:config` or create `~/.pi/twins.yaml` yourself.

---

## Model not found (`Model not found: …`)

**Symptoms**

- One model succeeds but the other shows `_Error: Model not found: provider/model-id_`
- Tool or command output includes `Model not found: anthropic/…` (or similar)
- Synthesis may still run if at least one model returned text

**Cause**

The model ID in `~/.pi/twins.yaml` is misspelled, outdated, or not registered in your Pi installation (provider not installed, wrong ID format, or typo).

**Fix**

1. Run `/twins:scan` and copy **exact** IDs (format: `provider/model-id`).
2. Update the failing entry in `~/.pi/twins.yaml`.
3. Confirm the provider is configured in Pi (API keys, auth) for that model.
4. Retry the run.

Model IDs must use a slash: `provider/model-id`. A bare name like `claude-sonnet-4` without a provider prefix will fail.

---

## Windows: `spawn EINVAL` or child `pi` hangs

**Symptoms**

- On Windows, spawning Pi from a script or extension fails with `spawn EINVAL`
- A child `pi` process starts but never finishes (hangs after producing output)
- Problems are more common on Node.js v23+ or when Pi is invoked via `pi.cmd`

**Cause**

Older Node.js spawn patterns on Windows mishandle batch wrappers (`pi.cmd`) and piped stdin, which can block child Pi processes.

**Fix**

1. **Upgrade pi-twins** to the latest release (v0.1.1+ fixes `spawn EINVAL`; v0.1.2+ fixes child hangs). Reinstall if needed:

   ```bash
   pi install npm:pi-twins
   ```

2. **Confirm Pi is on PATH** — from a new terminal, `pi --version` should succeed.
3. **Update Node.js and Pi** to supported versions if the error persists after upgrading pi-twins.
4. **Retry from Pi directly** (`pi -e npm:pi-twins` or your installed extension) rather than nesting multiple child `pi` invocations from custom scripts.

If you still see hangs, check for antivirus or terminal focus-control tools interfering with child process I/O.

---

## Both models failed

**Symptoms**

- Error message: `Both models failed`, or a combined message like `model-a: …; model-b: …`
- `/twins:run` shows `pi-twins error: …` and no synthesized answer
- `twins_run` returns `isError: true`

**Cause**

Neither configured model returned usable text. Typical reasons:

- Missing or invalid API keys for one or both providers
- Network or provider outage
- Both model IDs invalid (see [Model not found](#model-not-found-model-not-found-))
- Request aborted (timeout or user cancel)
- Provider rate limits or auth errors surfaced as model errors

**Fix**

1. Read the full error string — it often lists per-model failures (`provider/model: reason`).
2. Fix auth for each provider in Pi settings; verify keys work outside pi-twins.
3. Run `/twins:scan` and confirm both IDs in your pair exist and are spelled correctly.
4. Test with a simpler prompt and a known-good pair (for example the `default` template from `/twins:config`).
5. If only one model fails, pi-twins can still synthesize from the successful response; when **both** fail, there is nothing to merge — resolve both sides before retrying.

For persistent provider errors, check Pi’s provider logs and your account quotas before opening an issue.

---

## Still stuck?

- [`docs/examples.md`](examples.md) — commands and config samples
- [GitHub Issues](https://github.com/eiei114/pi-twins/issues) — include Pi version, pi-twins version, OS, the exact error text, and your `pairs` block (redact secrets)
