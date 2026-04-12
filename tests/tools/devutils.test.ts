import { describe, expect, it } from "vitest";
import { handleBase64Decode, handleBase64Encode } from "../../src/tools/devutils/base64";
import { handleHash } from "../../src/tools/devutils/hash";
import { handleCidrCalculate, handleIpValidate } from "../../src/tools/devutils/ip-tools";
import { handleJsonValidate } from "../../src/tools/devutils/json-tools";
import { handleJwtDecode } from "../../src/tools/devutils/jwt";
import { handleRegexTest } from "../../src/tools/devutils/regex";
import { handleCaseConvert, handleSlugify, handleTextStats } from "../../src/tools/devutils/text";
import { handleTimestampConvert } from "../../src/tools/devutils/timestamp";
import { handleUrlParse } from "../../src/tools/devutils/url-parse";

describe("devutils", () => {
  it("encodes and decodes base64", async () => {
    const encoded = await handleBase64Encode({ text: "hello" });
    expect(encoded.ok).toBe(true);
    if (encoded.ok) {
      expect(encoded.data).toEqual({ result: "aGVsbG8=" });
    }

    const decoded = await handleBase64Decode({ text: "aGVsbG8=" });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.data).toEqual({ result: "hello" });
    }
  });

  it("accepts explicit SHA-256 algorithm names", async () => {
    const result = await handleHash({ text: "hello", algorithm: "SHA-256" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as any).algorithm).toBe("SHA-256");
    }
  });

  it("validates JSON", async () => {
    const result = await handleJsonValidate({ text: "{\"a\":1}" });

    expect(result.ok).toBe(true);
  });

  it("decodes JWT header and payload", async () => {
    const token = "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjMifQ.";
    const result = await handleJwtDecode({ token });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as any).header.alg).toBe("none");
      expect((result.data as any).payload.sub).toBe("123");
    }
  });

  it("supports regex flags without requiring global input", async () => {
    const result = await handleRegexTest({ pattern: "HELLO", text: "hello world", flags: "i" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as any).matches[0]).toEqual({ match: "hello", index: 0 });
    }
  });

  it("parses URL", async () => {
    const result = await handleUrlParse({ url: "https://example.com:8443/a?b=c#d" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as any).hostname).toBe("example.com");
    }
  });

  it("converts unix timestamps", async () => {
    const result = await handleTimestampConvert({ value: 1710000000 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as any).unix).toBe(1710000000);
    }
  });

  it("validates IPv4", async () => {
    const result = await handleIpValidate({ ip: "192.168.1.1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as any).valid).toBe(true);
    }
  });

  it("rejects invalid CIDR IPv4 addresses", async () => {
    const result = await handleCidrCalculate({ cidr: "999.999.999.999/24" });

    expect(result.ok).toBe(false);
  });

  it("reports text stats and converts string cases", async () => {
    const stats = await handleTextStats({ text: "Hello world\nAgain" });
    expect(stats.ok).toBe(true);
    if (stats.ok) {
      expect((stats.data as any)).toMatchObject({ characters: 17, words: 3, lines: 2 });
    }

    const slug = await handleSlugify({ text: "Hello World!" });
    expect(slug.ok).toBe(true);
    if (slug.ok) {
      expect((slug.data as any).slug).toBe("hello-world");
    }

    const cases = await handleCaseConvert({ text: "Hello world example" });
    expect(cases.ok).toBe(true);
    if (cases.ok) {
      expect((cases.data as any)).toMatchObject({
        snake_case: "hello_world_example",
        kebab_case: "hello-world-example",
        camelCase: "helloWorldExample"
      });
    }
  });
});


