import type { AppEnv } from "../../lib/env";
import { configError, upstreamError, validationError } from "../../lib/errors";
import { parseKeyList, pickRandomKey } from "../../lib/keys";
import type { ToolExecutionResult } from "../../mcp/result";

async function callContext7(method: string, params: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  const key = pickRandomKey(parseKeyList(env.CONTEXT7_API_KEYS));
  if (!key) {
    return configError("CONTEXT7_API_KEYS is not configured");
  }

  let response: Response;
  try {
    response = await fetch("https://mcp.context7.com/mcp", {
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
    });
  } catch (error) {
    return upstreamError(error instanceof Error ? error.message : "Context7 request failed");
  }

  const text = await response.text();
  if (!response.ok) {
    return upstreamError(`Context7 MCP returned ${response.status}: ${text}`, response.status);
  }

  if (!text) {
    return { ok: true, data: {} };
  }

  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return upstreamError("Context7 MCP returned invalid JSON");
  }
}

export async function handleContext7Resolve(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  if (!args || typeof args !== "object" || typeof (args as { query?: unknown }).query !== "string") {
    return validationError("query must be a string");
  }
  return callContext7("resolve-library-id", args, env);
}

export async function handleContext7QueryDocs(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  const input = args as { libraryId?: unknown; query?: unknown } | undefined;
  if (!input || typeof input.libraryId !== "string" || typeof input.query !== "string") {
    return validationError("libraryId and query must be strings");
  }
  return callContext7("query-docs", args, env);
}
