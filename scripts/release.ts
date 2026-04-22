import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bumpPatchVersion, prependChangelogEntry } from "./lib/release-utils";

type PackageJson = {
  name: string;
  version: string;
  scripts?: Record<string, string>;
};

const rootDir = resolve(import.meta.dirname, "..");
const packageJsonPath = resolve(rootDir, "package.json");
const changelogPath = resolve(rootDir, "CHANGELOG.md");
const releaseDate = new Date().toISOString().slice(0, 10);
const releaseNotes = [
  "- Refresh generated README tooling snapshot.",
  "- Run the test and typecheck gates before preparing the release.",
  "- Prepare Git metadata for the patch release commit and tag."
];

function runStep(command: string, args: string[]): void {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: "inherit"
  });
}

function updatePackageVersion(nextVersion: string): void {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
  packageJson.version = nextVersion;
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function updateChangelog(nextVersion: string): void {
  const current = readFileSync(changelogPath, "utf8");
  const next = prependChangelogEntry(current, nextVersion, releaseDate, releaseNotes);
  writeFileSync(changelogPath, next);
}

function readCurrentVersion(): string {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
  return packageJson.version;
}

function main(): void {
  const currentVersion = readCurrentVersion();
  const nextVersion = bumpPatchVersion(currentVersion);
  const tagName = `v${nextVersion}`;

  runStep("npm", ["run", "render:readme"]);
  runStep("npm", ["test"]);
  runStep("npm", ["run", "typecheck"]);

  updatePackageVersion(nextVersion);
  updateChangelog(nextVersion);

  runStep("git", ["add", "package.json", "CHANGELOG.md", "README.md", "README.zh-CN.md"]);
  runStep("git", ["commit", "-m", `release: ${tagName}`]);
  runStep("git", ["tag", tagName]);

  process.stdout.write(`Prepared ${tagName}.\n`);
  process.stdout.write("Next manual step: git push origin HEAD --follow-tags\n");
}

main();
