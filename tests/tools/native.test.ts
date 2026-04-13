import { afterEach, describe, expect, it, vi } from "vitest";
import { handleJsonRpc } from "../../src/mcp/router";
import { handleCalc } from "../../src/tools/native/calc";
import { handleWhoami } from "../../src/tools/native/ip";
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

  it("calc accepts expr alias", async () => {
    const result = await handleCalc({ expr: "2+2" }, context);

    expect(result).toEqual({
      ok: true,
      data: { result: 4 }
    });
  });

  it("calc accepts input alias", async () => {
    const result = await handleCalc({ input: "2+2" }, context);

    expect(result).toEqual({
      ok: true,
      data: { result: 4 }
    });
  });

  it("calc reports a repairable missing-expression error", async () => {
    const result = await handleCalc({}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("validation_error");
      expect(result.error.message).toContain("expression, expr, or input");
    }
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

  it("weather accepts location alias", async () => {
    const fetchMock = vi.fn(async () =>
      new Response('{"current_condition":[{"temp_C":"18"}]}', {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleWeather({ location: "Tokyo" }, context);

    expect(fetchMock).toHaveBeenCalledWith("https://wttr.in/Tokyo?format=j1");
    expect(result).toEqual({
      ok: true,
      data: {
        current_condition: [{ temp_C: "18" }]
      }
    });
  });

  it("weather reports a repairable missing-query error", async () => {
    const result = await handleWeather({}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("validation_error");
      expect(result.error.message).toContain("query or location");
    }
  });

  it("whoami prefers cf-connecting-ip and returns only identity summary fields", async () => {
    const request = new Request("https://example.com/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.42",
        "x-forwarded-for": "198.51.100.5, 198.51.100.6",
        "x-real-ip": "192.0.2.10",
        "user-agent": "VitestAgent/1.0"
      }
    });
    (request as Request & {
      cf?: {
        country?: string;
        region?: string;
        city?: string;
        timezone?: string;
      };
    }).cf = {
      country: "US",
      region: "California",
      city: "San Francisco",
      timezone: "America/Los_Angeles"
    };

    const result = await handleWhoami({}, { ...context, request });

    expect(result).toEqual({
      ok: true,
      data: {
        ip: "203.0.113.42",
        country: "US",
        country_code: "US",
        region: "California",
        city: "San Francisco",
        timezone: "America/Los_Angeles",
        source: "cf-connecting-ip",
        user_agent: "VitestAgent/1.0"
      }
    });
    if (result.ok) {
      expect(result.data).not.toHaveProperty("headers");
      expect(result.data).not.toHaveProperty("cf");
      expect(result.data).not.toHaveProperty("method");
      expect(result.data).not.toHaveProperty("url");
    }
  });

  it("whoami uses the first x-forwarded-for address when cf-connecting-ip is absent", async () => {
    const request = new Request("https://example.com/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.5, 198.51.100.6",
        "x-real-ip": "192.0.2.10"
      }
    });

    const result = await handleWhoami({}, { ...context, request });

    expect(result).toEqual({
      ok: true,
      data: {
        ip: "198.51.100.5",
        country: null,
        country_code: null,
        region: null,
        city: null,
        timezone: null,
        source: "x-forwarded-for",
        user_agent: null
      }
    });
  });

  it("whoami falls back to x-real-ip when other forwarding headers are absent", async () => {
    const request = new Request("https://example.com/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "192.0.2.10"
      }
    });

    const result = await handleWhoami({}, { ...context, request });

    expect(result).toEqual({
      ok: true,
      data: {
        ip: "192.0.2.10",
        country: null,
        country_code: null,
        region: null,
        city: null,
        timezone: null,
        source: "x-real-ip",
        user_agent: null
      }
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

  it("router allows weather location alias through schema validation", async () => {
    const fetchMock = vi.fn(async () =>
      new Response('{"current_condition":[{"temp_C":"18"}]}', {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "weather",
          arguments: {
            location: "Tokyo"
          }
        }
      },
      {},
      context.request
    );
    const body = (await response.json()) as { result: { content: { type: string; text: string }[]; isError?: boolean } };

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("https://wttr.in/Tokyo?format=j1");
    expect(body).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("temp_C")
          }
        ]
      }
    });
    expect(body.result).not.toHaveProperty("isError");
  });

  it("router allows calc expr alias through schema validation", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "calc",
          arguments: {
            expr: "2+2"
          }
        }
      },
      {},
      context.request
    );
    const body = (await response.json()) as { result: { content: { type: string; text: string }[]; isError?: boolean } };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("4")
          }
        ]
      }
    });
    expect(body.result).not.toHaveProperty("isError");
  });

  it("router returns weather handler error for missing query aliases", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "weather",
          arguments: {}
        }
      },
      {},
      context.request
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      result: {
        isError: true,
        content: [
          {
            type: "text",
            text: expect.stringContaining("query or location")
          }
        ]
      }
    });
    expect(body).not.toHaveProperty("error");
  });

  it("router returns calc handler error for missing expression aliases", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "calc",
          arguments: {}
        }
      },
      {},
      context.request
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      result: {
        isError: true,
        content: [
          {
            type: "text",
            text: expect.stringContaining("expression, expr, or input")
          }
        ]
      }
    });
    expect(body).not.toHaveProperty("error");
  });

  it("router keeps whoami as a true no-argument tool and omits noisy request dumps", async () => {
    const request = new Request("https://example.com/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.42",
        "user-agent": "VitestAgent/1.0"
      }
    });

    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "whoami",
          arguments: {}
        }
      },
      {},
      request
    );
    const body = await response.json() as { result: { content: { type: string; text: string }[] } };
    const text = body.result.content[0]?.text ?? "";

    expect(response.status).toBe(200);
    expect(text).toContain("203.0.113.42");
    expect(text).toContain("\"source\": \"cf-connecting-ip\"");
    expect(text).not.toContain("\"headers\"");
    expect(text).not.toContain("\"cf\"");
    expect(text).not.toContain("\"method\"");
    expect(text).not.toContain("\"url\"");
  });

  it("router dispatches canonical devutils names through JSON-RPC", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "devutils_base64_encode",
          arguments: {
            text: "hello"
          }
        }
      },
      {},
      context.request
    );
    const body = (await response.json()) as { result: { content: { type: string; text: string }[]; isError?: boolean } };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("aGVsbG8=")
          }
        ]
      }
    });
    expect(body.result).not.toHaveProperty("isError");
  });

  it("router returns devutils handler error for missing canonical arguments", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "devutils_base64_encode",
          arguments: {}
        }
      },
      {},
      context.request
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      result: {
        isError: true,
        content: [
          {
            type: "text",
            text: expect.stringContaining("text must be a string")
          }
        ]
      }
    });
    expect(body).not.toHaveProperty("error");
  });
});
