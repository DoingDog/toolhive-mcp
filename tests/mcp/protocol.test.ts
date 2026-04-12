import { describe, expect, it } from "vitest";
import worker from "../../src/worker";
import { jsonRpcRequest } from "../helpers/request";

const env = {};
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

async function call(path: string, init?: RequestInit): Promise<Response> {
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

  it("returns initialize JSON-RPC result", async () => {
    const response = await call("/mcp", jsonRpcRequest("initialize", {}));
    const body = (await response.json()) as {
      jsonrpc: string;
      id: number;
      result: {
        protocolVersion: string;
        capabilities: { tools: Record<string, never> };
        serverInfo: { name: string };
      };
    };

    expect(response.status).toBe(200);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result).toMatchObject({
      protocolVersion: "2025-06-18",
      serverInfo: { name: "cloudflare-multi-mcp" }
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

  it("filters tavily tools from tools/list for the current request only while returning canonical names", async () => {
    const env = { TAVILY_API_KEYS: "tvly-a" };

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
    expect(disabledNames).not.toContain("tavily_search");
    expect(disabledNames).not.toContain("tavily_extract");
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
});
