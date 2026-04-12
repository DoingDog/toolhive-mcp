import { afterEach, describe, expect, it, vi } from "vitest";
import { handleCalc } from "../../src/tools/native/calc";
import { handleTime } from "../../src/tools/native/time";
import { handleWebfetch } from "../../src/tools/native/webfetch";

const context = {
  env: {},
  request: new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" }
  })
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("native tools", () => {
  it("calc evaluates whitelisted math expressions", async () => {
    const result = await handleCalc(
      { expression: "sqrt(9) + sin(pi / 2)" },
      context
    );

    expect(result).toEqual({
      ok: true,
      data: { result: 4 }
    });
  });

  it("calc rejects unsafe expressions", async () => {
    const result = await handleCalc({ expression: "process.exit()" }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("validation_error");
    }
  });

  it("webfetch GET can return response headers", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("hello", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "x-test": "ok"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleWebfetch(
      {
        url: "https://example.com/hello",
        return_responseheaders: true
      },
      context
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/hello",
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toEqual({
      ok: true,
      data: {
        status: 200,
        url: "https://example.com/hello",
        body: "hello",
        headers: expect.objectContaining({
          "content-type": "text/plain",
          "x-test": "ok"
        })
      }
    });
  });

  it("webfetch POST forwards body", async () => {
    const fetchMock = vi.fn(async () => new Response("posted", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await handleWebfetch(
      {
        url: "https://example.com/post",
        method: "POST",
        body: "hello=world"
      },
      context
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/post",
      expect.objectContaining({
        method: "POST",
        body: "hello=world"
      })
    );
  });

  it("webfetch rejects non-http schemes", async () => {
    const result = await handleWebfetch({ url: "file:///etc/passwd" }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("validation_error");
    }
  });

  it("time accepts Asia/Shanghai", async () => {
    const result = await handleTime({ timezone: "Asia/Shanghai" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ timezone: "Asia/Shanghai" });
    }
  });

  it("time rejects invalid timezones", async () => {
    const result = await handleTime({ timezone: "Invalid/Zone" }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("validation_error");
    }
  });
});
