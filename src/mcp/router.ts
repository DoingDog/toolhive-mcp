import type { JsonRpcRequest } from "./jsonrpc";
import { jsonRpcError, jsonRpcResult } from "./jsonrpc";
import { initializeResult } from "./protocol";
import { internalError, validationError } from "../lib/errors";
import { toToolResult } from "./result";
import { findEnabledTool, getEnabledTools } from "./tool-registry";
import { handleCalc } from "../tools/native/calc";
import { handleIp } from "../tools/native/ip";
import { handleTime } from "../tools/native/time";
import { handleWeather } from "../tools/native/weather";
import { handleWebfetch } from "../tools/native/webfetch";
import type { ToolContext } from "../tools/types";

export type Env = Record<string, string | undefined>;

export async function handleJsonRpc(
  request: JsonRpcRequest,
  env: Env,
  originalRequest: Request
): Promise<Response> {
  switch (request.method) {
    case "initialize":
      return jsonRpcResult(request.id ?? null, initializeResult());
    case "tools/list":
      return jsonRpcResult(request.id ?? null, { tools: getEnabledTools(env) });
    case "tools/call": {
      const params = request.params;
      if (!params || typeof params !== "object") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const name = "name" in params ? (params as { name?: unknown }).name : undefined;
      if (typeof name !== "string") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      if (!findEnabledTool(name, env)) {
        return jsonRpcError(request.id ?? null, -32602, `Unknown tool: ${name}`);
      }

      const args = "arguments" in params ? (params as { arguments?: unknown }).arguments ?? {} : {};
      const result = await dispatchTool(name, args, { env, request: originalRequest });
      return jsonRpcResult(request.id ?? null, toToolResult(result));
    }
    default:
      return jsonRpcError(request.id ?? null, -32601, `Method not found: ${request.method}`);
  }
}

async function dispatchTool(name: string, args: unknown, context: ToolContext) {
  switch (name) {
    case "weather":
      return handleWeather(args, context);
    case "webfetch":
      return handleWebfetch(args, context);
    case "calc":
      return handleCalc(args, context);
    case "time":
      return handleTime(args, context);
    case "ip":
      return handleIp(args, context);
    default:
      return name.includes(".")
        ? internalError(`Tool handler not implemented: ${name}`)
        : validationError(`Unknown native tool: ${name}`);
  }
}
