import type { AppEnv } from "../../lib/env";
import { configError, upstreamError, validationError } from "../../lib/errors";
import { parseKeyList } from "../../lib/keys";
import { fetchWithKeyRetry } from "../../lib/upstream";
import type { ToolExecutionResult } from "../../mcp/result";

type UnsplashPhoto = {
  id: string;
  width: number;
  height: number;
  description: string | null;
  alt_description: string | null;
  color: string | null;
  user: { name: string; links: { html: string } };
  urls: { small: string; regular: string; full: string };
  links: { html: string };
};

export async function handleUnsplashSearch(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  if (!args || typeof args !== "object" || typeof (args as { query?: unknown }).query !== "string") {
    return validationError("query must be a string");
  }

  const keys = parseKeyList(env.UNSPLASH_ACCESS_KEYS);
  if (keys.length === 0) {
    return configError("UNSPLASH_ACCESS_KEYS is not configured");
  }

  const input = args as Record<string, unknown>;
  const url = new URL("https://api.unsplash.com/search/photos");
  for (const field of ["query", "page", "per_page", "orientation", "color", "order_by"]) {
    const value = input[field];
    if (value !== undefined) {
      url.searchParams.set(field, String(value));
    }
  }

  const result = await fetchWithKeyRetry({
    keys,
    serviceName: "Unsplash API",
    makeRequest: (key) => ({
      url: url.toString(),
      init: {
        headers: {
          authorization: `Client-ID ${key}`,
          accept: "application/json"
        }
      }
    })
  });

  if ("error" in result) {
    return result;
  }

  const text = result.text;

  let json: { results: UnsplashPhoto[] };
  try {
    json = JSON.parse(text) as { results: UnsplashPhoto[] };
  } catch {
    return upstreamError("Unsplash API returned invalid JSON");
  }

  if (!Array.isArray(json.results)) {
    return upstreamError("Unsplash API returned unexpected response shape");
  }

  return {
    ok: true,
    data: {
      results: json.results.map((photo) => ({
        id: photo.id,
        width: photo.width,
        height: photo.height,
        description: photo.description,
        alt_description: photo.alt_description,
        author_name: photo.user.name,
        author_profile: photo.user.links.html,
        image_small: photo.urls.small,
        image_regular: photo.urls.regular,
        image_full: photo.urls.full,
        html_url: photo.links.html,
        color: photo.color
      }))
    }
  };
}
