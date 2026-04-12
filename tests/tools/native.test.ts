import { afterEach, describe, expect, it, vi } from "vitest";
import { handleJsonRpc } from "../../src/mcp/router";
import { handleCalc } from "../../src/tools/native/calc";
import { handleIp } from "../../src/tools/native/ip";
import { handleTime } from "../../src/tools/native/time";
import { handleWeather } from "../../src/tools/native/weather";
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

  it("calc applies exponent precedence around unary minus", async () => {
    await expect(handleCalc({ expression: "-2^2" }, context)).resolves.toEqual({
      ok: true,
      data: { result: -4 }
    });

    await expect(handleCalc({ expression: "(-2)^2" }, context)).resolves.toEqual({
      ok: true,
      data: { result: 4 }
    });

    await expect(handleCalc({ expression: "2^-2" }, context)).resolves.toEqual({
      ok: true,
      data: { result: 0.25 }
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

  it("webfetch rejects upstream fetch failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));

    const result = await handleWebfetch({ url: "https://example.com/fail" }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("upstream_error");
      expect(result.error.message).toContain("network down");
    }
  });

  it("webfetch rejects invalid request headers", async () => {
    const result = await handleWebfetch(
      {
        url: "https://example.com/hello",
        requestheaders: {
          "bad header": "value\u0000"
        }
      },
      context
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("validation_error");
    }
  });

  it("webfetch rejects non-http schemes", async () => {
    const result = await handleWebfetch({ url: "file:///etc/passwd" }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("validation_error");
    }
  });

  it("weather fetches wttr.in json", async () => {
    const fetchMock = vi.fn(async () =>
      new Response('{"current_condition":[{"temp_C":"12"}]}', {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleWeather({ query: "London" }, context);

    expect(fetchMock).toHaveBeenCalledWith("https://wttr.in/London?format=j1");
    expect(result).toEqual({
      ok: true,
      data: {
        current_condition: [{ temp_C: "12" }]
      }
    });
  });

  it("ip reads cf-connecting-ip from request headers", async () => {
    const request = new Request("https://example.com/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.42"
      }
    });

    const result = await handleIp({}, { ...context, request });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        ip: "203.0.113.42"
      })
    });
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

  it("router dispatches native calc through JSON-RPC", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "calc",
          arguments: {
            expression: "sqrt(9)"
          }
        }
      },
      {},
      context.request
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("3")
          }
        ]
      }
    });
  });
});
