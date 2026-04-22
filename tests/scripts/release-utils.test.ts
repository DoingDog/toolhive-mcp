import { describe, expect, it } from "vitest";
import { bumpPatchVersion, prependChangelogEntry } from "../../scripts/lib/release-utils";

describe("release utils", () => {
  it("bumps a patch version", () => {
    expect(bumpPatchVersion("0.4.0")).toBe("0.4.1");
  });

  it("prepends a new changelog entry below the title", () => {
    const current = [
      "# Changelog",
      "",
      "## 0.4.0 - 2026-04-21",
      "",
      "- Previous entry",
      ""
    ].join("\n");

    const next = prependChangelogEntry(current, "0.4.1", "2026-04-22", [
      "- Release automation preparation"
    ]);

    expect(next).toBe([
      "# Changelog",
      "",
      "## 0.4.1 - 2026-04-22",
      "",
      "- Release automation preparation",
      "",
      "## 0.4.0 - 2026-04-21",
      "",
      "- Previous entry",
      ""
    ].join("\n"));
  });
});
