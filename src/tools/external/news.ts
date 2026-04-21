import type { AppEnv } from "../../lib/env";
import { upstreamError, validationError } from "../../lib/errors";
import { createResponseMetadata } from "../../lib/response-metadata";
import type { ToolExecutionResult } from "../../mcp/result";

const DEFAULT_NEWS_API_BASE_URL = "https://newsmcp.io/v1";
const NEWS_PRIMARY_ARRAY_KEYS = new Set(["events", "topics", "regions", "articles"]);
const NEWS_PRIMARY_OBJECT_KEYS = new Set(["event"]);
const NEWS_METADATA_KEYS = new Set([
  "page",
  "per_page",
  "total",
  "total_pages",
  "has_more",
  "next_page",
  "prev_page"
]);

function getNewsApiBaseUrl(env: AppEnv): string {
  return (env.NEWS_API_BASE_URL ?? DEFAULT_NEWS_API_BASE_URL).replace(/\/+$/, "");
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function compactNewsData(data: Record<string, unknown>): Record<string, unknown> {
  const compact: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (isPrimitive(value) || NEWS_METADATA_KEYS.has(key)) {
      compact[key] = value;
      continue;
    }

    if (Array.isArray(value) && NEWS_PRIMARY_ARRAY_KEYS.has(key)) {
      compact[key] = value;
      continue;
    }

    if (value && typeof value === "object" && NEWS_PRIMARY_OBJECT_KEYS.has(key)) {
      compact[key] = value;
    }
  }

  return compact;
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

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return upstreamError(`News API request failed: ${message}`);
  }

  if (!response.ok) {
    return upstreamError(`News API returned ${response.status}: ${await response.text()}`, response.status);
  }

  try {
    const data = await response.json() as Record<string, unknown>;
    return {
      ok: true,
      data: {
        ...compactNewsData(data),
        ...createResponseMetadata({
          providerUsed: "news",
          cached: false,
          partial: false
        })
      }
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

  return getNews(`/news/${encodeURIComponent(eventId)}/`, undefined, env);
}

export async function handleNewsGetTopics(_args: unknown, env: AppEnv = {}): Promise<ToolExecutionResult> {
  return getNews("/news/topics/", undefined, env);
}

export async function handleNewsGetRegions(_args: unknown, env: AppEnv = {}): Promise<ToolExecutionResult> {
  return getNews("/news/regions/", undefined, env);
}
