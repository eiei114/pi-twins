import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const piSdkSmokeScript = await readFile(new URL("../scripts/pi-sdk-smoke.mjs", import.meta.url), "utf8");
const piSdkSmokeReport = JSON.parse(await readFile(new URL("../docs/verification/pi-sdk-smoke.json", import.meta.url), "utf8"));
const readme = (await readFile(new URL("../README.md", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const contributing = await readFile(new URL("../CONTRIBUTING.md", import.meta.url), "utf8");
const examples = await readFile(new URL("../docs/examples.md", import.meta.url), "utf8");
const autoReleaseWorkflow = await readFile(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8");
const publishWorkflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");

test("CHANGELOG keeps an undated Unreleased section ahead of dated releases", () => {
  const topHeading = changelog.match(/^## .+$/m);
  assert.ok(topHeading, "CHANGELOG should document a top-level section");
  assert.equal(topHeading[0], "## Unreleased");
});

test("README install pin matches the latest dated changelog release", () => {
  const pinMatch = readme.match(/^pi install npm:pi-twins@([^\s]+)$/m);
  assert.ok(pinMatch, "README should document a pinned npm install version");
  const latestRelease = changelog.match(/^## \[([^\]]+)\] - \d{4}-\d{2}-\d{2}$/m);
  assert.ok(latestRelease, "CHANGELOG should document a dated release");
  assert.equal(pinMatch[1], latestRelease[1]);
});

test("README release flow requires a manual release after merging", () => {
  const releaseSection = readme.match(/^## Release[\s\S]*?(?=^## |\Z)/m);
  assert.ok(releaseSection, "README should have a Release section");
  const releaseBlock = releaseSection[0].match(/```bash\n([\s\S]*?)```/);
  assert.ok(releaseBlock, "README should document a release command block");
  const commands = releaseBlock[1];
  assert.match(commands, /^npm version (patch|minor|major)/m);
  assert.match(commands, /^git push$/m);
  assert.doesNotMatch(commands, /push --tags/);
  assert.match(releaseSection[0], /manually run the \*\*Release \(manual\)\*\* workflow/i);
  assert.match(releaseSection[0], /Merging a PR does not create a tag or release/);
});

test("CONTRIBUTING release flow requires a manual release after merging", () => {
  const releaseSection = contributing.match(/^## Release[\s\S]*$/m);
  assert.ok(releaseSection, "CONTRIBUTING should have a Release section");
  const releaseBlock = releaseSection[0].match(/```bash\n([\s\S]*?)```/);
  assert.ok(releaseBlock, "CONTRIBUTING should document a release command block");
  const commands = releaseBlock[1];
  assert.match(commands, /^npm version patch$/m);
  assert.match(commands, /^git push$/m);
  assert.doesNotMatch(commands, /push --tags/);
  assert.match(releaseSection[0], /manually run the \*\*Release \(manual\)\*\* workflow/i);
});

test("README development section does not duplicate pack:check", () => {
  const devSection = readme.match(/^## Development[\s\S]*?(?=^## |\Z)/m);
  assert.ok(devSection, "README should have a Development section");
  const devBlock = devSection[0].match(/```bash\n([\s\S]*?)```/);
  assert.ok(devBlock, "README should document a development command block");
  const commands = devBlock[1];
  assert.match(commands, /npm run ci/);
  assert.doesNotMatch(commands, /npm pack --dry-run/);
});

test("package declares pi resources", () => {
  assert.deepEqual(packageJson.pi.extensions, ["./extensions"]);
  assert.equal(packageJson.pi.skills, undefined);
  assert.equal(packageJson.pi.prompts, undefined);
  assert.equal(packageJson.pi.themes, undefined);
});

test("package is discoverable as a Pi package", () => {
  assert.ok(packageJson.keywords.includes("pi-package"));
});

test("package uses public publish config", () => {
  assert.equal(packageJson.publishConfig.access, "public");
});

test("curated Pi SDK smoke report matches the pinned SDK and actual host versions", () => {
  for (const name of [
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-tui",
  ]) {
    assert.equal(piSdkSmokeReport.sdk_versions[name], packageJson.devDependencies[name]);
  }

  const hostVersion = packageJson.devDependencies["@earendil-works/pi-coding-agent"];
  assert.match(piSdkSmokeScript, /actual Pi \$\{cliManifest\.version\} process/);
  assert.match(piSdkSmokeReport.model_inference, new RegExp(`actual Pi ${hostVersion} process`));

  const hostShell = piSdkSmokeReport.cases.find((item) => item.name === "host_shell");
  const shellAssertion = hostShell.assertions.find((item) => item.id === "native_shell_boundary");
  const observedShell = JSON.parse(shellAssertion.observed);
  assert.equal(observedShell.output, hostVersion);
  assert.equal(observedShell.expectedVersion, hostVersion);
});

test("release and publish workflows keep publication out of the merge path", () => {
  assert.match(autoReleaseWorkflow, /actions:\s*write/);
  assert.match(autoReleaseWorkflow, /contents:\s*write/);
  assert.match(autoReleaseWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(autoReleaseWorkflow, /\n  push:/);
  assert.match(autoReleaseWorkflow, /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.match(autoReleaseWorkflow, /gh workflow run publish\.yml/);
  assert.match(publishWorkflow, /id-token:\s*write/);
  assert.match(publishWorkflow, /workflow_dispatch:/);
  assert.match(publishWorkflow, /tags:/);
  assert.doesNotMatch(publishWorkflow, /branches:\s*\n\s+- main/);
  assert.match(publishWorkflow, /npm publish --access public/);
});

test("twins_run pair parameter description matches default-pair fallback behavior", async () => {
  const { TwinsRunToolParametersSchema } = await import("../lib/schema.ts");
  const pairDescription = TwinsRunToolParametersSchema.properties.pair.description;
  assert.match(pairDescription, /default pair when present/i);
  assert.match(pairDescription, /first configured pair/i);
  assert.doesNotMatch(pairDescription, /defaults to first pair/i);
});

test("docs/examples local development flow matches CI gate", () => {
  const localDevBlock = examples.match(/^## Local development[\s\S]*?```bash\n([\s\S]*?)```/m);
  assert.ok(localDevBlock, "docs/examples.md should document a local development command block");
  const commands = localDevBlock[1];
  assert.match(commands, /^npm install$/m);
  assert.match(commands, /^npm run ci$/m);
  assert.match(commands, /^pi -e \.$/m);
});

test("docs/examples links troubleshooting and documents pair fallback", () => {
  assert.match(examples, /docs\/troubleshooting\.md/);
  assert.match(examples, /`default` pair is used when present/i);
  assert.match(examples, /first configured pair/i);
  assert.match(examples, /balanced \| decision \| critique \| concise/);
});
