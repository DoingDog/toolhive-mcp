import type { JsonRpcRequest } from "./jsonrpc";
import { jsonRpcError, jsonRpcResult } from "./jsonrpc";
import { initializeResult } from "./protocol";

export type Env = Record<string, string | undefined>;

export async function handleJsonRpc(
  request: JsonRpcRequest,
  env: Env,
  originalRequest: Request
): Promise<Response> {
  void env;
  void originalRequest;

  switch (request.method) {
    case "initialize":
      return jsonRpcResult(request.id ?? null, initializeResult());
    case "tools/list":
      return jsonRpcResult(request.id ?? null, { tools: [] });
    case "tools/call":
      return jsonRpcError(request.id ?? null, -32601, "tools/call not implemented yet");
    default:
      return jsonRpcError(request.id ?? null, -32601, `Method not found: ${request.method}`);
  }
}
