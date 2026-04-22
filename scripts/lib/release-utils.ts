export function bumpPatchVersion(version: string): string {
  const parts = version.split(".");
  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = Number(parts[2]);

  if (parts.length !== 3 || [major, minor, patch].some((value) => Number.isNaN(value))) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  return `${major}.${minor}.${patch + 1}`;
}

export function prependChangelogEntry(
  current: string,
  version: string,
  date: string,
  bullets: string[]
): string {
  const header = "# Changelog";

  if (!current.startsWith(`${header}\n`)) {
    throw new Error("CHANGELOG.md must start with '# Changelog'");
  }

  const entry = [header, "", `## ${version} - ${date}`, "", ...bullets, "", ""].join("\n");
  const rest = current.slice(header.length + 2);

  return `${entry}${rest}`;
}
