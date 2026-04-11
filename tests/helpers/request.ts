export function jsonRpcRequest(method: string, params: unknown, id = 1): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream"
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  };
}
