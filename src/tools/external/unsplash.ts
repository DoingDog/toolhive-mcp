import type { AppEnv } from "../../lib/env";
import { configError, upstreamError, validationError } from "../../lib/errors";
import { parseKeyList, pickRandomKey } from "../../lib/keys";
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

  const key = pickRandomKey(parseKeyList(env.UNSPLASH_ACCESS_KEYS));
  if (!key) {
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

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        authorization: `Client-ID ${key}`,
        accept: "application/json"
      }
    });
  } catch (error) {
    return upstreamError(error instanceof Error ? error.message : "Unsplash request failed");
  }

  const text = await response.text();
  if (!response.ok) {
    return upstreamError(`Unsplash API returned ${response.status}: ${text}`, response.status);
  }

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
