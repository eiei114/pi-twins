# Release

This package uses npm Trusted Publishing with GitHub Actions OIDC.

Do not add `NPM_TOKEN` or long-lived npm tokens to GitHub Secrets.

## One-time npm setup

On npmjs.com, configure Trusted Publishing for this package:

- Publisher: GitHub Actions
- Repository: this GitHub repository
- Workflow filename: `publish.yml`

## Publish

```bash
npm version patch
git push
```

The version bump reaching `main` does not create a release or publish the package. An authorized release owner must manually run the **Release (manual)** workflow from the `main` branch. It validates the stable version, skips an existing tag, then creates the tag and GitHub Release and explicitly dispatches `.github/workflows/publish.yml` for that tag.

The `v*.*.*` tag also triggers `.github/workflows/publish.yml`, which runs CI and publishes to npm when tags are pushed manually.
Publishing also runs when a GitHub Release is published, and can be run manually from GitHub Actions with `workflow_dispatch`.

The workflow skips `name@version` if that exact package version already exists on npm.

## Workflow guardrail

Do not ship a new Pi OSS package or version bump with only `package.json` changes.
The repository must keep release and publish actions out of the merge path:

- `.github/workflows/auto-release.yml` is manual-only and creates `v<version>` tags and GitHub Releases from `main`.
- `.github/workflows/publish.yml` publishes to npm through Trusted Publishing only after an explicit release/tag event or workflow dispatch.

Important: tags or releases created by `GITHUB_TOKEN` do not reliably fan out into another workflow through normal `push.tags` or `release.published` triggers. The manual release workflow keeps publishing reliable by explicitly dispatching `publish.yml` after creating the tag/release. Do not add a `main` push trigger to either workflow: a version bump PR merge must not trigger release or publish actions.

## GitHub Actions requirements

- `permissions: id-token: write`
- `permissions: actions: write` on auto-release so it can dispatch `publish.yml`
- `auto-release.yml` must call `gh workflow run publish.yml --ref "$TAG" -f ref="$TAG"`, or `publish.yml` must have an equivalent explicit handoff trigger such as `workflow_run`
- GitHub-hosted runner
- Node.js 24, so the release job uses a current npm CLI for Trusted Publishing
- No `NPM_TOKEN`
- `npm publish` from the configured workflow file

## First release checklist

- [ ] `package.json` name is final
- [ ] `repository.url` points to the real GitHub repository
- [ ] npm Trusted Publisher is configured
- [ ] `npm run ci` passes
- [ ] `npm pack --dry-run` contains only intended files
- [ ] CHANGELOG.md has the release date

