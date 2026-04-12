import { describe, expect, it } from "vitest";
import { getEnabledTools } from "../../src/mcp/tool-registry";
import { parseKeyList, pickRandomKey } from "../../src/lib/keys";

describe("tool registry", () => {
  it('parseKeyList(" a, b ,, c ") returns trimmed non-empty keys', () => {
    expect(parseKeyList(" a, b ,, c ")).toEqual(["a", "b", "c"]);
  });

  it('pickRandomKey(["only"]) returns the single key', () => {
    expect(pickRandomKey(["only"])).toBe("only");
  });

  it("includes native and devutils tools by default", () => {
    const names = getEnabledTools({}).map((tool) => tool.name);

    expect(names).toContain("weather");
    expect(names).toContain("webfetch");
    expect(names).toContain("devutils.base64_encode");
  });

  it("hides key-gated tools when env keys are absent", () => {
    const names = getEnabledTools({}).map((tool) => tool.name);

    expect(names).not.toContain("tavily.search");
    expect(names).not.toContain("context7.query-docs");
  });

  it("includes external tools when matching env keys are present", () => {
    const names = getEnabledTools({
      TAVILY_API_KEYS: "t1,t2",
      CONTEXT7_API_KEYS: "c1,c2",
      UNSPLASH_ACCESS_KEYS: "u1",
      PUREMD_API_KEYS: "p1"
    }).map((tool) => tool.name);

    expect(names).toContain("tavily.search");
    expect(names).toContain("tavily.extract");
    expect(names).toContain("context7.resolve-library-id");
    expect(names).toContain("unsplash.search_photos");
    expect(names).toContain("puremd.extract");
  });

  it("does not expose roadmap modules", () => {
    const names = getEnabledTools({
      TAVILY_API_KEYS: "t1",
      CONTEXT7_API_KEYS: "c1",
      UNSPLASH_ACCESS_KEYS: "u1",
      PUREMD_API_KEYS: "p1"
    }).map((tool) => tool.name);

    expect(names.some((name) => name.startsWith("news."))).toBe(false);
    expect(names.some((name) => name.startsWith("domain."))).toBe(false);
  });
});
