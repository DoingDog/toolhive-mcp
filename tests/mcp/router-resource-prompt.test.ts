import { describe, expect, it } from "vitest";
import { handleJsonRpc } from "../../src/mcp/router";

const request = new Request("https://example.com/mcp", {
  method: "POST",
  headers: { "content-type": "application/json" }
});

async function getBody(response: Response) {
  return response.json() as Promise<any>;
}

describe("resource and prompt JSON-RPC methods", () => {
  it("initialize advertises resources and prompts", async () => {
    const response = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, {}, request);
    const body = await getBody(response);

    expect(body.result.capabilities).toMatchObject({
      tools: {},
      resources: {},
      prompts: {}
    });
  });

  it("lists manifest-backed resources", async () => {
    const response = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "resources/list" }, {}, request);
    const body = await getBody(response);

    expect(body.result.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uri: "resource://toolhive/overview" }),
        expect.objectContaining({ uri: "resource://toolhive/runtime/enabled" })
      ])
    );
  });

  it("reads a known resource", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "resources/read",
        params: { uri: "resource://toolhive/overview" }
      },
      {},
      request
    );
    const body = await getBody(response);

    expect(body.result.contents).toEqual([
      expect.objectContaining({
        uri: "resource://toolhive/overview",
        mimeType: "text/markdown"
      })
    ]);
  });

  it("rejects an unknown resource", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "resources/read",
        params: { uri: "resource://toolhive/missing" }
      },
      {},
      request
    );
    const body = await getBody(response);

    expect(body.error).toEqual({
      code: -32602,
      message: "Unknown resource: resource://toolhive/missing"
    });
  });

  it("lists manifest-backed prompts", async () => {
    const response = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "prompts/list" }, {}, request);
    const body = await getBody(response);

    expect(body.result.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "choose_tool_for_task" }),
        expect.objectContaining({ name: "research_with_sources" })
      ])
    );
  });

  it("gets a prompt with validated arguments", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "prompts/get",
        params: {
          name: "choose_tool_for_task",
          arguments: { task: "Find the latest React docs" }
        }
      },
      {},
      request
    );
    const body = await getBody(response);

    expect(body.result.messages).toEqual([
      {
        role: "user",
        content: {
          type: "text",
          text: expect.stringContaining("Find the latest React docs")
        }
      }
    ]);
  });

  it("rejects prompt calls with invalid arguments", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "prompts/get",
        params: {
          name: "choose_tool_for_task",
          arguments: {}
        }
      },
      {},
      request
    );
    const body = await getBody(response);

    expect(body.error).toEqual({
      code: -32602,
      message: "Invalid params"
    });
  });
});
