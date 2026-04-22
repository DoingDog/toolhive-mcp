import { describe, expect, it, vi } from "vitest";
import packageJson from "../../package.json";
import worker from "../../src/worker";
import { jsonRpcRequest } from "../helpers/request";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

async function call(
  path: string,
  init?: RequestInit,
  env: Record<string, string | undefined> = {}
): Promise<Response> {
  return worker.fetch(new Request(`https://example.com${path}`, init), env, ctx);
}

describe("MCP protocol", () => {
  it("returns 404 for non-/mcp paths", async () => {
    const response = await call("/other", jsonRpcRequest("initialize", {}));

    expect(response.status).toBe(404);
  });

  it("returns 405 for GET /mcp", async () => {
    const response = await call("/mcp", { method: "GET" });

    expect(response.status).toBe(405);
  });

  it("returns initialize JSON-RPC result with package-backed serverInfo", async () => {
    const response = await call("/mcp", jsonRpcRequest("initialize", {}));
    const body = (await response.json()) as {
      jsonrpc: string;
      id: number;
      result: {
        protocolVersion: string;
        capabilities: { tools: Record<string, never> };
        serverInfo: { name: string; version: string };
      };
    };

    expect(response.status).toBe(200);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result).toMatchObject({
      protocolVersion: "2025-06-18",
      serverInfo: {
        name: packageJson.name,
        version: packageJson.version
      }
    });
    expect(body.result.capabilities.tools).toEqual({});
  });

  it("returns 202 with an empty body for notifications/initialized", async () => {
    const response = await call("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
    });

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("returns 401 for tools/list without credentials when auth keys are configured", async () => {
    const response = await call(
      "/mcp",
      jsonRpcRequest("tools/list", {}),
      { MCP_AUTH_KEYS: "valid-key" }
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32600,
        message: "Unauthorized"
      }
    });
  });

  it("accepts Bearer credentials for tools/list", async () => {
    const init = jsonRpcRequest("tools/list", {});
    const response = await call(
      "/mcp",
      {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          Authorization: "Bearer valid-key"
        }
      },
      { MCP_AUTH_KEYS: "valid-key" }
    );

    expect(response.status).toBe(200);
  });

  it("accepts x-api-key credentials for tools/list", async () => {
    const init = jsonRpcRequest("tools/list", {});
    const response = await call(
      "/mcp",
      {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          "x-api-key": "valid-key"
        }
      },
      { MCP_AUTH_KEYS: "valid-key" }
    );

    expect(response.status).toBe(200);
  });

  it("accepts query param credentials for tools/call", async () => {
    const response = await call(
      "/mcp?key=valid-key",
      jsonRpcRequest("tools/call", {
        name: "devutils_base64_encode",
        arguments: { text: "hello" }
      }),
      { MCP_AUTH_KEYS: "valid-key" }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("aGVsbG8=")
          }
        ]
      }
    });
  });

  it("keeps initialize public when auth keys are configured", async () => {
    const response = await call(
      "/mcp",
      jsonRpcRequest("initialize", {}),
      { MCP_AUTH_KEYS: "valid-key" }
    );

    expect(response.status).toBe(200);
  });

  it("returns JSON-RPC method not found for unknown methods", async () => {
    const response = await call("/mcp", jsonRpcRequest("unknown/method", {}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32601,
        message: "Method not found: unknown/method"
      }
    });
  });

  it("filters tavily_research from tools/list for the current request only while returning canonical names", async () => {
    const env = { TAVILY_API_KEYS: "tvly-a", EXA_API_KEYS: "exa-a" };

    const defaultResponse = await worker.fetch(
      new Request("https://example.com/mcp", jsonRpcRequest("tools/list", {})),
      env,
      ctx
    );
    const defaultBody = (await defaultResponse.json()) as { result: { tools: { name: string }[] } };
    const defaultNames = defaultBody.result.tools.map((tool) => tool.name);

    const disabledResponse = await worker.fetch(
      new Request("https://example.com/mcp?disable=tavily.*", jsonRpcRequest("tools/list", {})),
      env,
      ctx
    );
    const disabledBody = (await disabledResponse.json()) as { result: { tools: { name: string }[] } };
    const disabledNames = disabledBody.result.tools.map((tool) => tool.name);

    expect(defaultNames).toContain("tavily_search");
    expect(defaultNames).toContain("exa_search");
    expect(defaultNames).not.toContain("tavily_research");
    expect(disabledNames).not.toContain("tavily_search");
    expect(disabledNames).not.toContain("tavily_extract");
    expect(disabledNames).not.toContain("tavily_research");
    expect(disabledNames).toContain("exa_search");
  });

  it("filters only the specified tools from tools/list while accepting legacy disable names", async () => {
    const env = { TAVILY_API_KEYS: "tvly-a" };
    const response = await worker.fetch(
      new Request("https://example.com/mcp?disable=tavily.search,calc", jsonRpcRequest("tools/list", {})),
      env,
      ctx
    );
    const body = (await response.json()) as { result: { tools: { name: string }[] } };
    const names = body.result.tools.map((tool) => tool.name);

    expect(names).not.toContain("calc");
    expect(names).not.toContain("tavily_search");
    expect(names).toContain("tavily_extract");
    expect(names).toContain("weather");
  });

  it("does not let URL filtering affect tools/call", async () => {
    const response = await worker.fetch(
      new Request(
        "https://example.com/mcp?disable=calc",
        jsonRpcRequest("tools/call", {
          name: "calc",
          arguments: {}
        })
      ),
      {},
      ctx
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
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
  });

  it("lists iplookup without provider env in tools/list", async () => {
    const response = await call("/mcp", jsonRpcRequest("tools/list", {}));
    const body = (await response.json()) as { result: { tools: { name: string }[] } };
    const names = body.result.tools.map((tool) => tool.name);

    expect(response.status).toBe(200);
    expect(names).toContain("iplookup");
  });

  it("routes IP lookup tool calls through JSON-RPC", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        status: "success",
        query: "8.8.8.8",
        country: "United States",
        countryCode: "US",
        region: "CA",
        regionName: "California",
        city: "Mountain View",
        timezone: "America/Los_Angeles",
        lat: 37.4056,
        lon: -122.0775,
        zip: "94043",
        isp: "Google LLC",
        org: "Google Public DNS",
        as: "AS15169 Google LLC",
        asname: "GOOGLE",
        mobile: false,
        proxy: false,
        hosting: true
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request(
        "https://example.com/mcp",
        jsonRpcRequest("tools/call", {
          name: "iplookup",
          arguments: { query: "8.8.8.8" }
        })
      ),
      {},
      ctx
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ip-api.com/json/8.8.8.8?fields=55312383"
    );
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining('"country_code": "US"')
          }
        ]
      }
    });
  });

  it("returns a repairable tool error when calc arguments are missing", async () => {
    const response = await call(
      "/mcp",
      jsonRpcRequest("tools/call", {
        name: "calc",
        arguments: {}
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
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
  });

  it("routes tools/call through canonical tool names", async () => {
    const response = await worker.fetch(
      new Request(
        "https://example.com/mcp",
        jsonRpcRequest("tools/call", {
          name: "devutils_base64_encode",
          arguments: { text: "hello" }
        })
      ),
      {},
      ctx
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("aGVsbG8=")
          }
        ]
      }
    });
  });

  it("keeps legacy dotted tool names working for tools/call", async () => {
    const response = await worker.fetch(
      new Request(
        "https://example.com/mcp",
        jsonRpcRequest("tools/call", {
          name: "devutils.base64_encode",
          arguments: { text: "hello" }
        })
      ),
      {},
      ctx
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("aGVsbG8=")
          }
        ]
      }
    });
  });

  it("accepts libraryName for context7 resolve through JSON-RPC tools/call", async () => {
    const fetchMock = vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1, result: { content: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request(
        "https://example.com/mcp",
        jsonRpcRequest("tools/call", {
          name: "context7_resolve-library-id",
          arguments: { libraryName: "react" }
        })
      ),
      { CONTEXT7_API_KEYS: "ctx-test" },
      ctx
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text"
          }
        ]
      }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mcp.context7.com/mcp",
      expect.objectContaining({ method: "POST" })
    );
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [, init] = calls[0]!;
    const payload = JSON.parse(String(init.body));
    expect(payload.params.arguments).toEqual({ query: "react", libraryName: "react" });
  });

  it("exposes the webfetch format enum through tools/list", async () => {
    const response = await call("/mcp", jsonRpcRequest("tools/list", {}));
    const body = (await response.json()) as {
      result: {
        tools: { name: string; inputSchema: { properties?: Record<string, unknown> } }[];
      };
    };
    const webfetch = body.result.tools.find((tool) => tool.name === "webfetch");

    expect(response.status).toBe(200);
    expect(webfetch?.inputSchema.properties?.format).toEqual({
      type: "string",
      enum: ["markdown", "text", "html"]
    });
  });

  it("routes webfetch tools/call requests with format through JSON-RPC", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("<article><h1>Hello</h1><p>World</p></article>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request(
        "https://example.com/mcp",
        jsonRpcRequest("tools/call", {
          name: "webfetch",
          arguments: {
            url: "https://example.com/post",
            format: "markdown"
          }
        })
      ),
      {},
      ctx
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/post",
      expect.objectContaining({ method: "GET" })
    );
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining('"body": "# Hello\\n\\nWorld"')
          }
        ]
      }
    });
  });

  it("routes webfetch tools/call requests without format through JSON-RPC as raw body", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("<article><h1>Hello</h1><p>World</p></article>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request(
        "https://example.com/mcp",
        jsonRpcRequest("tools/call", {
          name: "webfetch",
          arguments: {
            url: "https://example.com/post"
          }
        })
      ),
      {},
      ctx
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/post",
      expect.objectContaining({ method: "GET" })
    );
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining('"body": "# Hello\\n\\nWorld"')
          }
        ]
      }
    });
  });

  it("does not expose any domain tools from tools/list", async () => {
    const response = await call("/mcp", jsonRpcRequest("tools/list", {}));
    const body = (await response.json()) as { result: { tools: { name: string }[] } };
    const names = body.result.tools.map((tool) => tool.name);

    expect(response.status).toBe(200);
    expect(names).not.toContain("domain_check_domain");
    expect(names).not.toContain("domain_explore_name");
    expect(names).not.toContain("domain_search_domains");
    expect(names).not.toContain("domain_list_categories");
  });

  it("does not expose any news tools from tools/list", async () => {
    const response = await call("/mcp", jsonRpcRequest("tools/list", {}));
    const body = (await response.json()) as { result: { tools: { name: string }[] } };
    const names = body.result.tools.map((tool) => tool.name);

    expect(response.status).toBe(200);
    expect(names).not.toContain("news_get_news");
    expect(names).not.toContain("news_get_news_detail");
    expect(names).not.toContain("news_get_topics");
    expect(names).not.toContain("news_get_regions");
  });
});
