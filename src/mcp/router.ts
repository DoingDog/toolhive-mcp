import type { JsonRpcRequest } from "./jsonrpc";
import { jsonRpcError, jsonRpcResult } from "./jsonrpc";
import { initializeResult } from "./protocol";
import { internalError } from "../lib/errors";
import { isAuthorizedMcpRequest, isProtectedMcpMethod } from "../lib/mcp-auth";
import { toToolResult } from "./result";
import { findEnabledTool, getEnabledTools } from "./tool-registry";
import { validateToolArguments } from "./validate";
import { buildToolCatalog } from "./tool-catalog";
import { getManifestEnabledEntries } from "./tool-manifest";
import type { ToolContext } from "../tools/types";

export type Env = Record<string, string | undefined>;

export async function handleJsonRpc(
  request: JsonRpcRequest,
  env: Env,
  originalRequest: Request
): Promise<Response> {
  if (isProtectedMcpMethod(request.method) && !isAuthorizedMcpRequest(originalRequest, env)) {
    return jsonRpcError(request.id ?? null, -32600, "Unauthorized", { status: 401 });
  }

  switch (request.method) {
    case "initialize":
      return jsonRpcResult(request.id ?? null, initializeResult());
    case "tools/list":
      return jsonRpcResult(request.id ?? null, {
        tools: getEnabledTools(env, { disabledTools: getDisabledTools(originalRequest) })
      });
    case "tools/call": {
      const params = request.params;
      if (!params || typeof params !== "object") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const name = "name" in params ? (params as { name?: unknown }).name : undefined;
      if (typeof name !== "string") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const tool = findEnabledTool(name, env);
      if (!tool) {
        return jsonRpcError(request.id ?? null, -32602, `Unknown tool: ${name}`);
      }

      const args = "arguments" in params ? (params as { arguments?: unknown }).arguments ?? {} : {};
      const validationErrorMessage = validateToolArguments(tool.inputSchema, args);
      if (validationErrorMessage) {
        return jsonRpcError(request.id ?? null, -32602, validationErrorMessage);
      }

      const result = await dispatchTool(tool.name, args, { env, request: originalRequest });
      return jsonRpcResult(request.id ?? null, toToolResult(result));
    }
    default:
      return jsonRpcError(request.id ?? null, -32601, `Method not found: ${request.method}`);
  }
}

function getDisabledTools(request: Request): string[] {
  return new URL(request.url).searchParams
    .get("disable")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
}

async function dispatchTool(name: string, args: unknown, context: ToolContext) {
  const { aliasMap, handlerMap } = buildToolCatalog(getManifestEnabledEntries(context.env));
  const canonicalName = aliasMap.get(name) ?? name.replace(/[.-]/g, "_");
  const handler = handlerMap.get(canonicalName);

  if (!handler) {
    return internalError(`Tool handler not implemented: ${name}`);
  }

  return handler(args, context);
}
