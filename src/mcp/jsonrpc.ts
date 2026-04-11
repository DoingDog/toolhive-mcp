export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export function jsonRpcResult(id: JsonRpcId, result: unknown): Response {
  return jsonResponse({
    jsonrpc: "2.0",
    id,
    result
  });
}

export function jsonRpcError(id: JsonRpcId, code: number, message: string): Response {
  return jsonResponse({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  });
}

export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return !!value &&
    typeof value === "object" &&
    "jsonrpc" in value &&
    value.jsonrpc === "2.0" &&
    "method" in value &&
    typeof value.method === "string";
}
