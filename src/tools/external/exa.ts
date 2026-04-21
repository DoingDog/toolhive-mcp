import type { AppEnv } from "../../lib/env";
import { configError, upstreamError, validationError } from "../../lib/errors";
import { parseKeyList } from "../../lib/keys";
import { createResponseMetadata } from "../../lib/response-metadata";
import { fetchWithKeyRetry } from "../../lib/upstream";
import type { ToolExecutionResult } from "../../mcp/result";

type ExaSearchResult = {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  publishedDate?: unknown;
  author?: unknown;
  score?: unknown;
  text?: unknown;
  highlights?: unknown;
  summary?: unknown;
  image?: unknown;
  favicon?: unknown;
};

type ExaSearchResponse = {
  requestId?: unknown;
  results?: unknown;
  [key: string]: unknown;
};

function buildContents(input: Record<string, unknown>) {
  const contents: Record<string, unknown> = {};

  if (input.include_text) {
    contents.text = typeof input.text_max_characters === "number"
      ? { maxCharacters: input.text_max_characters }
      : {};
  }

  if (input.include_highlights) {
    contents.highlights = typeof input.highlights_max_characters === "number"
      ? { maxCharacters: input.highlights_max_characters }
      : {};
  }

  if (input.include_summary) {
    contents.summary = typeof input.summary_query === "string"
      ? { query: input.summary_query }
      : {};
  }

  if (input.livecrawl !== undefined) {
    contents.livecrawl = input.livecrawl;
  }

  return Object.keys(contents).length > 0 ? contents : undefined;
}

function mapRequestBody(input: Record<string, unknown>) {
  const body: Record<string, unknown> = {
    query: input.query
  };

  const directFields: Array<[string, string]> = [
    ["limit", "numResults"],
    ["search_type", "type"],
    ["category", "category"],
    ["include_domains", "includeDomains"],
    ["exclude_domains", "excludeDomains"],
    ["start_published_date", "startPublishedDate"],
    ["end_published_date", "endPublishedDate"],
    ["start_crawl_date", "startCrawlDate"],
    ["end_crawl_date", "endCrawlDate"],
    ["moderation", "moderation"],
    ["user_location", "userLocation"]
  ];

  for (const [from, to] of directFields) {
    if (input[from] !== undefined) {
      body[to] = input[from];
    }
  }

  const contents = buildContents(input);
  if (contents) {
    body.contents = contents;
  }

  return body;
}

function mapResult(result: ExaSearchResult) {
  return {
    id: typeof result.id === "string" ? result.id : undefined,
    title: typeof result.title === "string" ? result.title : undefined,
    url: typeof result.url === "string" ? result.url : undefined,
    published_date: typeof result.publishedDate === "string" ? result.publishedDate : undefined,
    author: typeof result.author === "string" ? result.author : undefined,
    score: typeof result.score === "number" ? result.score : undefined,
    text: typeof result.text === "string" ? result.text : undefined,
    highlights: Array.isArray(result.highlights) ? result.highlights : undefined,
    summary: typeof result.summary === "string" ? result.summary : undefined,
    image: typeof result.image === "string" ? result.image : undefined,
    favicon: typeof result.favicon === "string" ? result.favicon : undefined
  };
}

export async function handleExaSearch(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  if (!args || typeof args !== "object" || typeof (args as { query?: unknown }).query !== "string") {
    return validationError("query must be a string");
  }

  const keys = parseKeyList(env.EXA_API_KEYS);
  if (keys.length === 0) {
    return configError("EXA_API_KEYS is not configured");
  }

  const input = args as Record<string, unknown>;
  const result = await fetchWithKeyRetry({
    keys,
    serviceName: "Exa API",
    makeRequest: (key) => ({
      url: "https://api.exa.ai/search",
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key
        },
        body: JSON.stringify(mapRequestBody(input))
      }
    })
  });

  if ("error" in result) {
    return result;
  }

  let json: ExaSearchResponse;
  try {
    json = JSON.parse(result.text) as ExaSearchResponse;
  } catch {
    return upstreamError("Exa API returned invalid JSON");
  }

  if (!Array.isArray(json.results)) {
    return upstreamError("Exa API returned unexpected response shape");
  }

  return {
    ok: true,
    data: {
      request_id: typeof json.requestId === "string" ? json.requestId : undefined,
      results: json.results.map((entry) => mapResult((entry ?? {}) as ExaSearchResult)),
      ...createResponseMetadata({
        providerUsed: "exa",
        cached: false,
        partial: false
      })
    }
  };
}
