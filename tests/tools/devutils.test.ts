import { describe, expect, it } from "vitest";
import { handleBase64Decode, handleBase64Encode } from "../../src/tools/devutils/base64";
import { handleIpValidate } from "../../src/tools/devutils/ip-tools";
import { handleJsonValidate } from "../../src/tools/devutils/json-tools";
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

  it("validates JSON", async () => {
    const result = await handleJsonValidate({ text: "{\"a\":1}" });

    expect(result.ok).toBe(true);
  });

  it("parses URL", async () => {
    const result = await handleUrlParse({ url: "https://example.com:8443/a?b=c#d" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as any).hostname).toBe("example.com");
    }
  });

  it("validates IPv4", async () => {
    const result = await handleIpValidate({ ip: "192.168.1.1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as any).valid).toBe(true);
    }
  });
});
