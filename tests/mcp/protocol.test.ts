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
});
