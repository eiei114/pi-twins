import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const contributing = await readFile(new URL("../CONTRIBUTING.md", import.meta.url), "utf8");
const examples = await readFile(new URL("../docs/examples.md", import.meta.url), "utf8");
const autoReleaseWorkflow = await readFile(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8");
const publishWorkflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");

test("CHANGELOG top release matches package version", () => {
  const topRelease = changelog.match(/^## \[([^\]]+)\]/m);
  assert.ok(topRelease, "CHANGELOG should document a top-level release section");
  assert.equal(topRelease[1], packageJson.version);
});

test("README install pin matches package version", () => {
  const pinMatch = readme.match(/^pi install npm:pi-twins@([^\s]+)$/m);
  assert.ok(pinMatch, "README should document a pinned npm install version");
  assert.equal(pinMatch[1], packageJson.version);
});

test("README release flow matches auto-release handoff", () => {
  const releaseSection = readme.match(/^## Release[\s\S]*?(?=^## |\Z)/m);
  assert.ok(releaseSection, "README should have a Release section");
  const releaseBlock = releaseSection[0].match(/```bash\n([\s\S]*?)```/);
  assert.ok(releaseBlock, "README should document a release command block");
  const commands = releaseBlock[1];
  assert.match(commands, /^npm version (patch|minor|major)/m);
  assert.match(commands, /^git push$/m);
  assert.doesNotMatch(commands, /push --tags/);
});

test("CONTRIBUTING release flow matches auto-release handoff", () => {
  const releaseSection = contributing.match(/^## Release[\s\S]*$/m);
  assert.ok(releaseSection, "CONTRIBUTING should have a Release section");
  const releaseBlock = releaseSection[0].match(/```bash\n([\s\S]*?)```/);
  assert.ok(releaseBlock, "CONTRIBUTING should document a release command block");
  const commands = releaseBlock[1];
  assert.match(commands, /^npm version patch$/m);
  assert.match(commands, /^git push$/m);
  assert.doesNotMatch(commands, /push --tags/);
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

test("release workflow includes npm publish handoff", () => {
  assert.match(autoReleaseWorkflow, /actions:\s*write/);
  assert.match(autoReleaseWorkflow, /contents:\s*write/);
  assert.match(autoReleaseWorkflow, /gh workflow run publish\.yml/);
  assert.match(publishWorkflow, /id-token:\s*write/);
  assert.match(publishWorkflow, /workflow_dispatch:/);
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
