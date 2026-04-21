import { afterEach, describe, expect, it, vi } from "vitest";
import { handleJsonRpc } from "../../src/mcp/router";
import { fetchGuardedText } from "../../src/lib/upstream";
import { handleCalc } from "../../src/tools/native/calc";
import { handleWhoami } from "../../src/tools/native/ip";
import { handleTime } from "../../src/tools/native/time";
import { handleWeather } from "../../src/tools/native/weather";
import { handleWebfetch, renderFetchedBody } from "../../src/tools/native/webfetch";

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

  it("webfetch emits compact metadata by default and keeps response headers opt-in", async () => {
    const fetchMock = vi.fn(async () => {
      const response = new Response("hello", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "x-test": "ok"
        }
      });
      Object.defineProperty(response, "url", { value: "https://example.com/hello" });
      return response;
    });
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
          provider_used: "webfetch",
          content_length: 5,
          truncated: false,
          cached: false,
          partial: false,
        headers: expect.objectContaining({
          "content-type": "text/plain",
          "x-test": "ok"
        })
      }
    });
  });

  it("webfetch returns the final response URL after redirects with compact metadata", async () => {
    const fetchMock = vi.fn(async () => {
      const response = new Response("redirected", {
        status: 200,
        headers: {
          "content-type": "text/plain"
        }
      });
      Object.defineProperty(response, "url", { value: "https://example.com/final" });
      return response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleWebfetch(
      {
        url: "https://example.com/original"
      },
      context
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/original",
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toEqual({
      ok: true,
      data: {
        status: 200,
        url: "https://example.com/final",
        body: "redirected",
        provider_used: "webfetch",
        content_length: 10,
        truncated: false,
        cached: false,
        partial: false,
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

  it("webfetch rejects GET requests with a body", async () => {
    const fetchMock = vi.fn(async () => new Response("ignored", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleWebfetch(
      {
        url: "https://example.com/get",
        method: "GET",
        body: "hello=world"
      },
      context
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("validation_error");
      expect(result.error.message).toContain("body is only allowed for POST");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("webfetch marks truncated responses with byte-length metadata", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode("你"));
              controller.enqueue(encoder.encode("a"));
              controller.close();
            }
          }),
          {
            status: 200,
            headers: {
              "content-type": "text/plain",
              "content-length": "4"
            }
          }
        )
      )
    );

    const result = await handleWebfetch(
      {
        url: "https://example.com/large",
        max_bytes: 3
      },
      context
    );

    expect(result).toEqual({
      ok: true,
      data: {
        status: 200,
        url: "https://example.com/large",
        body: "你",
          provider_used: "webfetch",
          content_length: 4,
          truncated: true,
          cached: false,
          partial: false,
      }
    });
  });

  it("webfetch stops reading once max_bytes is reached instead of buffering the full response", async () => {
    const encoder = new TextEncoder();
    let pulledChunks = 0;
    let cancelCalled = false;
    let responseFullyRead = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              pulledChunks += 1;
              if (pulledChunks === 1) {
                controller.enqueue(encoder.encode("abc"));
                return;
              }

              if (pulledChunks === 2) {
                controller.enqueue(encoder.encode("def"));
                return;
              }

              responseFullyRead = true;
              controller.enqueue(encoder.encode("ghi"));
              controller.close();
            },
            cancel() {
              cancelCalled = true;
            }
          }),
          {
            status: 200,
            headers: {
              "content-type": "text/plain",
              "content-length": "9"
            }
          }
        )
      )
    );

    const result = await handleWebfetch(
      {
        url: "https://example.com/stream",
        max_bytes: 3
      },
      context
    );

    expect(result).toEqual({
      ok: true,
      data: {
        status: 200,
        url: "https://example.com/stream",
        body: "abc",
          provider_used: "webfetch",
          content_length: 9,
          truncated: true,
          cached: false,
          partial: false,
      }
    });
    expect(cancelCalled || !responseFullyRead).toBe(true);
  });

  it("webfetch omits content_length when truncation happens without a content-length header", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode("abc"));
              controller.enqueue(encoder.encode("def"));
              controller.close();
            }
          }),
          {
            status: 200,
            headers: {
              "content-type": "text/plain"
            }
          }
        )
      )
    );

    const result = await handleWebfetch(
      {
        url: "https://example.com/unknown-length",
        max_bytes: 3
      },
      context
    );

    expect(result).toEqual({
      ok: true,
      data: {
        status: 200,
        url: "https://example.com/unknown-length",
        body: "abc",
          provider_used: "webfetch",
          truncated: true,
          cached: false,
          partial: false,
      }
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).not.toHaveProperty("content_length");
    }
  });

  it("webfetch reports requested and actual format when HTML converts to markdown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<article><h1>Hello</h1><p>World</p></article>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      )
    );

    const result = await handleWebfetch(
      { url: "https://example.com/article", format: "markdown" },
      context
    );

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        body: expect.stringContaining("# Hello"),
        requested_format: "markdown",
        actual_format: "markdown",
        extracted: true,
        fallback_reason: null
      })
    });
  });

  it("renderFetchedBody falls back to text when markdown conversion throws", () => {
    expect(
      renderFetchedBody(
        "<article><h1>Hello</h1><p>World</p></article>",
        "text/html; charset=utf-8",
        "markdown",
        () => {
          throw new Error("conversion failed");
        }
      )
    ).toEqual({
      body: "Hello\n\nWorld",
      requested_format: "markdown",
      actual_format: "text",
      extracted: false,
      fallback_reason: "markdown_conversion_failed"
    });
  });

  it("webfetch treats XHTML responses as HTML for markdown conversion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<article><h1>Hello</h1><p>XHTML</p></article>", {
          status: 200,
          headers: { "content-type": "application/xhtml+xml; charset=utf-8" }
        })
      )
    );

    const result = await handleWebfetch(
      {
        url: "https://example.com/xhtml",
        format: "markdown"
      },
      context
    );

    expect(result).toEqual({
      ok: true,
      data: {
        status: 200,
        url: "https://example.com/xhtml",
        body: expect.stringContaining("# Hello"),
          provider_used: "webfetch",
          content_length: 45,
          truncated: false,
          cached: false,
          partial: false,
      }
    });
    if (result.ok) {
      expect(result.data).toMatchObject({
        body: expect.stringContaining("XHTML")
      });
    }
  });

  it("webfetch converts HTML to markdown when format is omitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<article><h1>Hello</h1><p>World</p><p>Again</p></article>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      )
    );

    const result = await handleWebfetch(
      {
        url: "https://example.com/article"
      },
      context
    );

    expect(result).toEqual({
      ok: true,
      data: {
        status: 200,
        url: "https://example.com/article",
        body: expect.stringContaining("# Hello"),
          provider_used: "webfetch",
          content_length: 57,
          truncated: false,
          cached: false,
          partial: false,
      }
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(expect.objectContaining({
        body: expect.stringContaining("World")
      }));
      expect(result.data).toEqual(expect.objectContaining({
        body: expect.not.stringContaining("<article>")
      }));
    }
  });

  it("webfetch converts HTML to readable text when requested", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<article><h1>Hello</h1><p>World</p><p>Again</p></article>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      )
    );

    const result = await handleWebfetch(
      {
        url: "https://example.com/article",
        format: "text"
      },
      context
    );

    expect(result).toEqual({
      ok: true,
      data: {
        status: 200,
        url: "https://example.com/article",
        body: "Hello\n\nWorld\n\nAgain",
          provider_used: "webfetch",
          content_length: 57,
          truncated: false,
          cached: false,
          partial: false,
      }
    });
  });

  it("webfetch returns raw HTML unchanged when format is html", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<article><h1>Hello</h1><p>World</p><p>Again</p></article>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      )
    );

    const result = await handleWebfetch(
      {
        url: "https://example.com/article",
        format: "html"
      },
      context
    );

    expect(result).toEqual({
      ok: true,
      data: {
        status: 200,
        url: "https://example.com/article",
        body: "<article><h1>Hello</h1><p>World</p><p>Again</p></article>",
          provider_used: "webfetch",
          content_length: 57,
          truncated: false,
          cached: false,
          partial: false,
      }
    });
  });

  it("webfetch keeps non-HTML text unchanged for all formats", async () => {
    const fetchMock = vi.fn(async () =>
      new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      handleWebfetch({ url: "https://example.com/data", format: "markdown" }, context)
    ).resolves.toEqual({
      ok: true,
      data: {
        status: 200,
        url: "https://example.com/data",
        body: '{"ok":true}',
          provider_used: "webfetch",
          content_length: 11,
          truncated: false,
          cached: false,
          partial: false,
      }
    });

    await expect(
      handleWebfetch({ url: "https://example.com/data", format: "text" }, context)
    ).resolves.toEqual({
      ok: true,
      data: {
        status: 200,
        url: "https://example.com/data",
        body: '{"ok":true}',
          provider_used: "webfetch",
          content_length: 11,
          truncated: false,
          cached: false,
          partial: false,
      }
    });

    await expect(
      handleWebfetch({ url: "https://example.com/data", format: "html" }, context)
    ).resolves.toEqual({
      ok: true,
      data: {
        status: 200,
        url: "https://example.com/data",
        body: '{"ok":true}',
          provider_used: "webfetch",
          content_length: 11,
          truncated: false,
          cached: false,
          partial: false,
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("webfetch rejects timed out upstream fetches", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          reject(signal.reason);
        }, { once: true });
      }));
      vi.stubGlobal("fetch", fetchMock);

      const resultPromise = handleWebfetch({ url: "https://example.com/fail" }, context);
      await vi.advanceTimersByTimeAsync(30_000);
      const result = await resultPromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("upstream_error");
        expect(result.error.message).toContain("timed out");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("fetchGuardedText keeps timeout active when the caller already provides a signal", async () => {
    vi.useFakeTimers();
    try {
      const callerController = new AbortController();
      const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          reject(signal.reason);
        }, { once: true });
      }));
      vi.stubGlobal("fetch", fetchMock);

      const resultPromise = fetchGuardedText(
        {
          url: "https://example.com/fail",
          init: { signal: callerController.signal }
        },
        { serviceName: "webfetch", timeoutMs: 30_000 }
      );
      await vi.advanceTimersByTimeAsync(30_000);
      const result = await resultPromise;

      expect(result).toMatchObject({
        error: expect.objectContaining({
          type: "upstream_error",
          message: expect.stringContaining("timed out")
        })
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("fetchGuardedText preserves caller abort behavior when a timeout is also configured", async () => {
    vi.useFakeTimers();
    try {
      const callerController = new AbortController();
      const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          reject(signal.reason);
        }, { once: true });
      }));
      vi.stubGlobal("fetch", fetchMock);

      const resultPromise = fetchGuardedText(
        {
          url: "https://example.com/fail",
          init: { signal: callerController.signal }
        },
        { serviceName: "webfetch", timeoutMs: 30_000 }
      );
      callerController.abort(new Error("caller cancelled"));
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toMatchObject({
        error: expect.objectContaining({
          type: "upstream_error",
          message: expect.stringContaining("caller cancelled")
        })
      });
    } finally {
      vi.useRealTimers();
    }
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
