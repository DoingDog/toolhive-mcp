import type { AppEnv } from "../../lib/env";
import { configError, upstreamError, validationError } from "../../lib/errors";
import { parseKeyList } from "../../lib/keys";
import { fetchWithKeyRetry } from "../../lib/upstream";
import type { ToolExecutionResult } from "../../mcp/result";

async function callContext7(method: string, params: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  const keys = parseKeyList(env.CONTEXT7_API_KEYS);
  if (keys.length === 0) {
    return configError("CONTEXT7_API_KEYS is not configured");
  }

  const result = await fetchWithKeyRetry({
    keys,
    serviceName: "Context7 MCP",
    makeRequest: (key) => ({
      url: "https://mcp.context7.com/mcp",
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          CONTEXT7_API_KEY: key,
          authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: method,
            arguments: params
          }
        })
      }
    })
  });

  if ("error" in result) {
    return result;
  }

  if (!result.text) {
    return { ok: true, data: {} };
  }

  try {
    const parsed = JSON.parse(result.text) as {
      result?: unknown;
      error?: { message?: unknown };
    };
    if (parsed.error) {
      const message = typeof parsed.error.message === "string"
        ? parsed.error.message
        : "unknown error";
      return upstreamError(`Context7 MCP returned JSON-RPC error: ${message}`);
    }
    return { ok: true, data: parsed.result ?? parsed };
  } catch {
    return upstreamError("Context7 MCP returned invalid JSON");
  }
}

export async function handleContext7Resolve(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  const input = args as { query?: unknown; libraryName?: unknown } | undefined;
  const query = typeof input?.query === "string" ? input.query : input?.libraryName;
  if (typeof query !== "string") {
    return validationError("query must be a string");
  }
  return callContext7("resolve-library-id", { query, libraryName: query }, env);
}

export async function handleContext7QueryDocs(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  const input = args as { libraryId?: unknown; query?: unknown } | undefined;
  if (!input || typeof input.libraryId !== "string" || typeof input.query !== "string") {
    return validationError("libraryId and query must be strings");
  }
  return callContext7("query-docs", args, env);
}
