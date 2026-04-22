import { describe, expect, it } from "vitest";
import { bumpPatchVersion, prependChangelogEntry } from "../../scripts/lib/release-utils";

describe("release utils", () => {
  it("bumps 0.4.0 to 0.4.1", () => {
    expect(bumpPatchVersion("0.4.0")).toBe("0.4.1");
  });

  it("prepends a new changelog entry below the title with LF", () => {
    const current = [
      "# Changelog",
      "",
      "## 0.4.0 - 2026-04-21",
      "",
      "- Previous entry",
      ""
    ].join("\n");

    const next = prependChangelogEntry(current, "0.4.1", "2026-04-22", [
      "- Productized paper auth support"
    ]);

    expect(next).toBe([
      "# Changelog",
      "",
      "## 0.4.1 - 2026-04-22",
      "",
      "- Productized paper auth support",
      "",
      "## 0.4.0 - 2026-04-21",
      "",
      "- Previous entry",
      ""
    ].join("\n"));
  });

  it("prepends a new changelog entry below the title with CRLF", () => {
    const current = [
      "# Changelog",
      "",
      "## 0.4.0 - 2026-04-21",
      "",
      "- Previous entry",
      ""
    ].join("\r\n");

    const next = prependChangelogEntry(current, "0.4.1", "2026-04-22", [
      "- Productized paper auth support"
    ]);

    expect(next).toBe([
      "# Changelog",
      "",
      "## 0.4.1 - 2026-04-22",
      "",
      "- Productized paper auth support",
      "",
      "## 0.4.0 - 2026-04-21",
      "",
      "- Previous entry",
      ""
    ].join("\r\n"));
  });
});
