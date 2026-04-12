import type { AppEnv } from "../../lib/env";
import { configError, upstreamError, validationError } from "../../lib/errors";
import { parseKeyList, pickRandomKey } from "../../lib/keys";
import type { ToolExecutionResult } from "../../mcp/result";

function tavilyKey(env: AppEnv): string | undefined {
  return pickRandomKey(parseKeyList(env.TAVILY_API_KEYS));
}

async function postTavily(endpoint: "search" | "extract", body: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  const key = tavilyKey(env);
  if (!key) {
    return configError("TAVILY_API_KEYS is not configured");
  }

  let response: Response;
  try {
    response = await fetch(`https://api.tavily.com/${endpoint}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    return upstreamError(error instanceof Error ? error.message : "Tavily request failed");
  }

  const text = await response.text();
  if (!response.ok) {
    return upstreamError(`Tavily API returned ${response.status}: ${text}`, response.status);
  }

  if (!text) {
    return { ok: true, data: {} };
  }

  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return upstreamError("Tavily API returned invalid JSON");
  }
}

export async function handleTavilySearch(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  if (!args || typeof args !== "object" || typeof (args as { query?: unknown }).query !== "string") {
    return validationError("query must be a string");
  }
  return postTavily("search", args, env);
}

export async function handleTavilyExtract(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  const urls = (args as { urls?: unknown } | undefined)?.urls;
  if (
    typeof urls !== "string"
    && (!Array.isArray(urls) || !urls.every((url) => typeof url === "string"))
  ) {
    return validationError("urls must be a string or string array");
  }
  return postTavily("extract", args, env);
}
