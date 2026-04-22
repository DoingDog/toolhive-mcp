import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bumpPatchVersion, prependChangelogEntry } from "./lib/release-utils.ts";

type PackageJson = {
  name: string;
  version: string;
  scripts?: Record<string, string>;
};

type ReleasePlan = {
  currentVersion: string;
  nextVersion: string;
  tagName: string;
  releaseNotes: string[];
  shouldPush: boolean;
  pushCommandArgs: string[];
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const packageJsonPath = resolve(rootDir, "package.json");
const changelogPath = resolve(rootDir, "CHANGELOG.md");
const releaseDate = new Date().toISOString().slice(0, 10);
const npmCliPath = resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const pushArgs = (tagName: string) => ["push", "origin", "HEAD", `refs/tags/${tagName}`];

function runStep(command: string, args: string[]): void {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: "inherit"
  });
}

function runNpmStep(args: string[]): void {
  runStep(process.execPath, [npmCliPath, ...args]);
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

function isPlanMode(): boolean {
  return process.argv.includes("--plan");
}

function shouldPush(): boolean {
  return process.argv.includes("--push") || process.env.RELEASE_PUSH === "1";
}

function createReleasePlan(): ReleasePlan {
  const currentVersion = readCurrentVersion();
  const nextVersion = bumpPatchVersion(currentVersion);
  const tagName = `v${nextVersion}`;
  const releaseNotes = readReleaseNotes(currentVersion);
  const shouldPushRelease = shouldPush();

  return {
    currentVersion,
    nextVersion,
    tagName,
    releaseNotes,
    shouldPush: shouldPushRelease,
    pushCommandArgs: pushArgs(tagName)
  };
}

function printPlan(plan: ReleasePlan): void {
  const changelogPreview = prependChangelogEntry(
    "# Changelog\n\n## PREVIOUS - 1970-01-01\n\n- Previous entry\n",
    plan.nextVersion,
    releaseDate,
    plan.releaseNotes
  )
    .split("\n")
    .slice(0, plan.releaseNotes.length + 5)
    .join("\n");

  process.stdout.write(`Release plan (${plan.currentVersion} -> ${plan.nextVersion})\n`);
  process.stdout.write(`- version bump: package.json ${plan.currentVersion} -> ${plan.nextVersion}\n`);
  process.stdout.write(`- changelog entry:\n${changelogPreview}\n`);
  process.stdout.write(`- commit: release: ${plan.tagName}\n`);
  process.stdout.write(`- tag: ${plan.tagName}\n`);
  process.stdout.write(
    `- push: ${plan.shouldPush ? `git ${plan.pushCommandArgs.join(" ")}` : "skip (pass --push or RELEASE_PUSH=1 to enable)"}\n`
  );
  process.stdout.write("Plan mode made no file or git changes.\n");
}

function main(): void {
  const planMode = isPlanMode();
  const plan = createReleasePlan();

  runNpmStep(["run", "render:readme"]);
  runNpmStep(["test"]);
  runNpmStep(["run", "typecheck"]);

  if (planMode) {
    printPlan(plan);
    return;
  }

  updatePackageVersion(plan.nextVersion);
  updateChangelog(plan.nextVersion, plan.releaseNotes);

  runStep("git", ["add", "package.json", "CHANGELOG.md", "README.md", "README.zh-CN.md"]);
  runStep("git", ["commit", "-m", `release: ${plan.tagName}`]);
  runStep("git", ["tag", plan.tagName]);

  if (plan.shouldPush) {
    runStep("git", plan.pushCommandArgs);
  } else {
    process.stdout.write(`Dry run: git ${plan.pushCommandArgs.join(" ")}\n`);
  }

  process.stdout.write(`Prepared ${plan.tagName}.\n`);
}

main();
