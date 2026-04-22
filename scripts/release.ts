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
const pushArgs = ["push", "origin", "HEAD", "--follow-tags"];

function runStep(command: string, args: string[]): void {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: "inherit"
  });
}

function runOutput(command: string, args: string[]): string {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: "utf8"
  }).trim();
}

function updatePackageVersion(nextVersion: string): void {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
  packageJson.version = nextVersion;
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function readReleaseNotes(currentVersion: string): string[] {
  const lastTag = `v${currentVersion}`;
  const subjects = runOutput("git", ["log", `${lastTag}..HEAD`, "--pretty=%s"]);

  if (!subjects) {
    return ["- No changes since the last release tag."];
  }

  return subjects.split("\n").map((subject) => `- ${subject}`);
}

function updateChangelog(nextVersion: string, releaseNotes: string[]): void {
  const current = readFileSync(changelogPath, "utf8");
  const next = prependChangelogEntry(current, nextVersion, releaseDate, releaseNotes);
  writeFileSync(changelogPath, next);
}

function readCurrentVersion(): string {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
  return packageJson.version;
}

function shouldPush(): boolean {
  return process.argv.includes("--push") || process.env.RELEASE_PUSH === "1";
}

function main(): void {
  const currentVersion = readCurrentVersion();
  const nextVersion = bumpPatchVersion(currentVersion);
  const tagName = `v${nextVersion}`;
  const releaseNotes = readReleaseNotes(currentVersion);

  runStep("npm", ["run", "render:readme"]);
  runStep("npm", ["test"]);
  runStep("npm", ["run", "typecheck"]);

  updatePackageVersion(nextVersion);
  updateChangelog(nextVersion, releaseNotes);

  runStep("git", ["add", "package.json", "CHANGELOG.md", "README.md", "README.zh-CN.md"]);
  runStep("git", ["commit", "-m", `release: ${tagName}`]);
  runStep("git", ["tag", tagName]);

  if (shouldPush()) {
    runStep("git", pushArgs);
  } else {
    process.stdout.write(`Dry run: git ${pushArgs.join(" ")}\n`);
  }

  process.stdout.write(`Prepared ${tagName}.\n`);
}

main();
