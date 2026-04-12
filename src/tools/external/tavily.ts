import type { AppEnv } from "../../lib/env";
import { configError, upstreamError, validationError } from "../../lib/errors";
import { parseKeyList } from "../../lib/keys";
import { fetchWithKeyRetry } from "../../lib/upstream";
import type { ToolExecutionResult } from "../../mcp/result";

async function postTavily(
  endpoint: "search" | "extract" | "crawl" | "research",
  body: unknown,
  env: AppEnv
): Promise<ToolExecutionResult> {
  const keys = parseKeyList(env.TAVILY_API_KEYS);
  if (keys.length === 0) {
    return configError("TAVILY_API_KEYS is not configured");
  }

  const result = await fetchWithKeyRetry({
    keys,
    serviceName: "Tavily API",
    makeRequest: (key) => ({
      url: `https://api.tavily.com/${endpoint}`,
      init: {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
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
    return { ok: true, data: JSON.parse(result.text) as unknown };
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

export async function handleTavilyCrawl(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  if (!args || typeof args !== "object" || typeof (args as { url?: unknown }).url !== "string") {
    return validationError("url must be a string");
  }
  return postTavily("crawl", args, env);
}

export async function handleTavilyResearch(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  if (!args || typeof args !== "object" || typeof (args as { input?: unknown }).input !== "string") {
    return validationError("input must be a string");
  }
  return postTavily("research", args, env);
}
