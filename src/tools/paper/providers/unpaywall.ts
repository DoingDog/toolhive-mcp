import type { AppEnv } from "../../../lib/env";
import { configError, upstreamError, validationError } from "../../../lib/errors";
import { parseKeyList, pickRandomKey } from "../../../lib/keys";
import type { PaperLookupResult } from "../types";

type UnpaywallLocation = {
  url?: unknown;
  url_for_pdf?: unknown;
};

type UnpaywallResponse = {
  doi?: unknown;
  is_oa?: unknown;
  best_oa_location?: unknown;
  oa_locations?: unknown;
};

function collectLinks(location: UnpaywallLocation | undefined): string[] {
  if (!location) {
    return [];
  }

  const links = [location.url, location.url_for_pdf].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );

  return Array.from(new Set(links));
}

export async function lookupUnpaywallByDoi(doi: string, env: AppEnv): Promise<PaperLookupResult> {
  if (typeof doi !== "string" || doi.trim().length === 0) {
    return validationError("doi must be a non-empty string");
  }

  const emails = parseKeyList(env.PAPER_SEARCH_MCP_UNPAYWALL_EMAILS);
  const email = pickRandomKey(emails);
  if (!email) {
    return configError("PAPER_SEARCH_MCP_UNPAYWALL_EMAILS is not configured");
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`,
      { method: "GET" }
    );
  } catch (error) {
    return upstreamError(
      error instanceof Error ? `Unpaywall request failed: ${error.message}` : "Unpaywall request failed"
    );
  }

  if (!response.ok) {
    const text = await response.text();
    return upstreamError(`Unpaywall API returned ${response.status}: ${text}`, response.status);
  }

  let json: UnpaywallResponse;
  try {
    json = await response.json() as UnpaywallResponse;
  } catch {
    return upstreamError("Unpaywall API returned invalid JSON");
  }

  const locations = [json.best_oa_location, ...(Array.isArray(json.oa_locations) ? json.oa_locations : [])]
    .map((location) => (location ?? {}) as UnpaywallLocation);
  const downloadLinks = Array.from(new Set(locations.flatMap((location) => collectLinks(location))));

  return {
    ok: true,
    data: {
      doi: typeof json.doi === "string" ? json.doi : doi,
      open_access: json.is_oa === true,
      provider: "unpaywall",
      download_links: downloadLinks
    }
  };
}
