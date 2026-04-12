import type { AppEnv } from "../../lib/env";
import { upstreamError, validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

const DEFAULT_NEWS_API_BASE_URL = "https://newsmcp.io/v1";

function getNewsApiBaseUrl(env: AppEnv): string {
  return (env.NEWS_API_BASE_URL ?? DEFAULT_NEWS_API_BASE_URL).replace(/\/+$/, "");
}

async function getNews(pathname: string, args?: Record<string, unknown>, env: AppEnv = {}): Promise<ToolExecutionResult> {
  const url = new URL(`${getNewsApiBaseUrl(env)}${pathname}`);

  if (args) {
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    return upstreamError(`News API returned ${response.status}: ${await response.text()}`, response.status);
  }

  try {
    return {
      ok: true,
      data: await response.json()
    };
  } catch {
    return upstreamError("News API returned invalid JSON");
  }
}

export async function handleNewsGetNews(args: unknown, env: AppEnv = {}): Promise<ToolExecutionResult> {
  const input = args && typeof args === "object" ? args as Record<string, unknown> : {};
  return getNews("/news/", input, env);
}

export async function handleNewsGetNewsDetail(args: unknown, env: AppEnv = {}): Promise<ToolExecutionResult> {
  const eventId = (args as { event_id?: unknown } | undefined)?.event_id;
  if (typeof eventId !== "string" || eventId.trim() === "") {
    return validationError("event_id must be a non-empty string");
  }

  return getNews(`/news/${eventId}/`, undefined, env);
}

export async function handleNewsGetTopics(_args: unknown, env: AppEnv = {}): Promise<ToolExecutionResult> {
  return getNews("/news/topics/", undefined, env);
}

export async function handleNewsGetRegions(_args: unknown, env: AppEnv = {}): Promise<ToolExecutionResult> {
  return getNews("/news/regions/", undefined, env);
}
