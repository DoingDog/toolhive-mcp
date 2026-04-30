import { internalError } from "../lib/errors";
import { isAuthorizedMcpRequest, isProtectedMcpMethod } from "../lib/mcp-auth";
import type { JsonRpcRequest } from "./jsonrpc";
import { jsonRpcError, jsonRpcResult } from "./jsonrpc";
import { buildPromptHandlerMap } from "./prompt-catalog";
import { promptManifestEntries } from "./prompt-manifest";
import { initializeResult } from "./protocol";
import { findEnabledPrompt, getEnabledPrompts } from "./prompt-registry";
import { buildResourceHandlerMap } from "./resource-catalog";
import { resourceManifestEntries } from "./resource-manifest";
import { findEnabledResource, getEnabledResources } from "./resource-registry";
import { toToolResult } from "./result";
import { buildToolCatalog } from "./tool-catalog";
import { getManifestEnabledEntries } from "./tool-manifest";
import { findEnabledTool, getEnabledTools } from "./tool-registry";
import { validateToolArguments } from "./validate";
import type { ToolContext } from "../tools/types";

export type Env = Record<string, string | undefined>;

const resourceHandlerMap = buildResourceHandlerMap(resourceManifestEntries);
const promptHandlerMap = buildPromptHandlerMap(promptManifestEntries);

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
    case "resources/list":
      return jsonRpcResult(request.id ?? null, {
        resources: getEnabledResources(env)
      });
    case "resources/read": {
      const params = request.params;
      if (!params || typeof params !== "object") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const uri = "uri" in params ? (params as { uri?: unknown }).uri : undefined;
      if (typeof uri !== "string") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const resource = findEnabledResource(uri, env);
      if (!resource) {
        return jsonRpcError(request.id ?? null, -32602, `Unknown resource: ${uri}`);
      }

      const result = await resourceHandlerMap.get(resource.uri)?.({ env, request: originalRequest });
      return jsonRpcResult(request.id ?? null, result);
    }
    case "prompts/list":
      return jsonRpcResult(request.id ?? null, {
        prompts: getEnabledPrompts(env)
      });
    case "prompts/get": {
      const params = request.params;
      if (!params || typeof params !== "object") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const name = "name" in params ? (params as { name?: unknown }).name : undefined;
      if (typeof name !== "string") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const prompt = findEnabledPrompt(name, env);
      if (!prompt) {
        return jsonRpcError(request.id ?? null, -32602, `Unknown prompt: ${name}`);
      }

      const args = "arguments" in params ? (params as { arguments?: unknown }).arguments ?? {} : {};
      const validationErrorMessage = validateToolArguments(prompt.argumentsSchema, args);
      if (validationErrorMessage) {
        return jsonRpcError(request.id ?? null, -32602, validationErrorMessage);
      }

      const result = await promptHandlerMap.get(prompt.name)?.(args as Record<string, unknown>, {
        env,
        request: originalRequest
      });
      return jsonRpcResult(request.id ?? null, result);
    }
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
