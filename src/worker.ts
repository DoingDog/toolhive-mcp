import packageJson from "../package.json";
import type { Env } from "./mcp/router";
import { handleJsonRpc } from "./mcp/router";
import { isJsonRpcRequest, jsonRpcError } from "./mcp/jsonrpc";

const METHOD_NOT_ALLOWED = new Response(null, {
  status: 405
});

const NOT_FOUND = new Response(null, {
  status: 404
});

function createHealthResponse(): Response {
  return Response.json({ status: "ok" });
}

function createReadyResponse(): Response {
  return Response.json({ ready: true });
}

function createVersionResponse(): Response {
  return Response.json({
    name: packageJson.name,
    version: packageJson.version
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    void ctx;

    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return createHealthResponse();
    }

    if (url.pathname === "/readyz") {
      return createReadyResponse();
    }

    if (url.pathname === "/version") {
      return createVersionResponse();
    }

    if (url.pathname !== "/mcp") {
      return NOT_FOUND;
    }

    if (request.method !== "POST") {
      return METHOD_NOT_ALLOWED;
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return jsonRpcError(null, -32700, "Parse error");
    }

    if (!isJsonRpcRequest(payload)) {
      return jsonRpcError(null, -32600, "Invalid Request");
    }

    if (payload.method === "notifications/initialized" && payload.id === undefined) {
      return new Response(null, { status: 202 });
    }

    return handleJsonRpc(payload, env, request);
  }
};
