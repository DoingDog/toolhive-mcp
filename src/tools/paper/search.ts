import { internalError, validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";
import { mergePaperResults } from "./normalize";
import { normalizeArxivEntry } from "./providers/arxiv";
import { normalizeCrossrefReference, normalizeCrossrefWork } from "./providers/crossref";
import { normalizeOpenAlexWork } from "./providers/openalex";
import { lookupUnpaywallByDoi } from "./providers/unpaywall";
import type { NormalizedPaper, PaperProvider } from "./types";
import type { ToolContext } from "../types";

type PaperSearchArgs = {
  query?: unknown;
};

type PaperDetailsArgs = {
  doi?: unknown;
  arxiv_id?: unknown;
};

type PaperOpenAccessArgs = {
  doi?: unknown;
};

type PaperRelatedArgs = {
  paper_id?: unknown;
  doi?: unknown;
};

type ProviderPaperResult = {
  provider: Extract<PaperProvider, "arxiv" | "crossref" | "openalex">;
  paper: NormalizedPaper | null;
};

type ProviderPaperSearchResult = {
  provider: Extract<PaperProvider, "crossref" | "openalex">;
  papers: NormalizedPaper[];
};

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function looksLikeDoi(value: string): boolean {
  return /^10\.\S+\/\S+$/i.test(value.trim());
}

type RelatedPaperIdClassification =
  | { kind: "doi"; value: string }
  | { kind: "openalex_id"; value: string }
  | { kind: "openalex_url"; value: string; workId: string }
  | { kind: "invalid"; value: string };

export function classifyRelatedPaperId(value: string): RelatedPaperIdClassification {
  const normalizedValue = value.trim();

  if (looksLikeDoi(normalizedValue)) {
    return {
      kind: "doi",
      value: normalizedValue
    };
  }

  const openAlexWorkId = normalizeOpenAlexWorkId(normalizedValue);
  if (!openAlexWorkId) {
    return {
      kind: "invalid",
      value: normalizedValue
    };
  }

  if (/^https?:\/\/openalex\.org\//i.test(normalizedValue)) {
    return {
      kind: "openalex_url",
      value: `https://openalex.org/${openAlexWorkId}`,
      workId: openAlexWorkId
    };
  }

  return {
    kind: "openalex_id",
    value: openAlexWorkId
  };
}

function withOpenAccessData(paper: NormalizedPaper, openAccess: { open_access: boolean; download_links: string[] }): NormalizedPaper {
  return {
    ...paper,
    open_access: openAccess.open_access,
    download_links: Array.from(new Set([...paper.download_links, ...openAccess.download_links]))
  };
}

async function fetchCrossrefDetails(doi: string): Promise<ProviderPaperResult> {
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Crossref API returned ${response.status}`);
  }

  const json = await response.json() as { message?: unknown };
  return {
    provider: "crossref",
    paper: json.message ? normalizeCrossrefWork(json.message as Record<string, unknown>) : null
  };
}

async function fetchOpenAlexDetails(doi: string): Promise<ProviderPaperResult> {
  const response = await fetch(`https://api.openalex.org/works?filter=doi:${encodeURIComponent(doi)}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`OpenAlex API returned ${response.status}`);
  }

  const json = await response.json() as { results?: unknown };
  const firstResult = Array.isArray(json.results) ? json.results[0] : null;

  return {
    provider: "openalex",
    paper: firstResult ? normalizeOpenAlexWork(firstResult as Record<string, unknown>) : null
  };
}

async function searchCrossrefWorks(query: string): Promise<ProviderPaperSearchResult> {
  const response = await fetch(
    `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=10`,
    { method: "GET" }
  );
  if (!response.ok) {
    throw new Error(`Crossref API returned ${response.status}`);
  }

  const json = await response.json() as { message?: { items?: unknown } };
  const items = Array.isArray(json.message?.items) ? json.message.items : [];

  return {
    provider: "crossref",
    papers: items.map((item) => normalizeCrossrefWork(item as Record<string, unknown>))
  };
}

async function searchOpenAlexWorks(query: string): Promise<ProviderPaperSearchResult> {
  const response = await fetch(
    `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=10`,
    { method: "GET" }
  );
  if (!response.ok) {
    throw new Error(`OpenAlex API returned ${response.status}`);
  }

  const json = await response.json() as { results?: unknown };
  const results = Array.isArray(json.results) ? json.results : [];

  return {
    provider: "openalex",
    papers: results.map((result) => normalizeOpenAlexWork(result as Record<string, unknown>))
  };
}

type OpenAlexWorkLookupResult = {
  workId: string;
  paper: NormalizedPaper | null;
  relatedWorkIds: string[];
};

type OpenAlexRelatedLookupErrorCode =
  | "openalex_seed_not_found"
  | "openalex_seed_upstream_failed"
  | "openalex_related_fetch_failed";

type OpenAlexRelatedLookupError = {
  code: OpenAlexRelatedLookupErrorCode;
  stage: "seed_resolution" | "related_fetch";
  provider: "openalex";
  status?: number;
};

function normalizeOpenAlexWorkId(value: string): string | null {
  const normalizedValue = value.trim();
  const openAlexId = normalizedValue.match(/^(?:https?:\/\/openalex\.org\/)?(W\d+)$/i)?.[1];
  return openAlexId ? openAlexId.toUpperCase() : null;
}

function createOpenAlexRelatedLookupError(code: OpenAlexRelatedLookupErrorCode, stage: OpenAlexRelatedLookupError["stage"], status?: number): OpenAlexRelatedLookupError {
  return {
    code,
    stage,
    provider: "openalex",
    ...(status === undefined ? {} : { status })
  };
}

function parseOpenAlexWorkLookup(work: Record<string, unknown>, status?: number): OpenAlexWorkLookupResult {
  const workId = normalizeNonEmptyString(work.id);
  if (!workId) {
    throw createOpenAlexRelatedLookupError("openalex_seed_not_found", "seed_resolution", status);
  }

  return {
    workId,
    paper: normalizeOpenAlexWork(work),
    relatedWorkIds: Array.isArray(work.related_works)
      ? work.related_works
          .map((relatedWorkId) => typeof relatedWorkId === "string" ? normalizeOpenAlexWorkId(relatedWorkId) : null)
          .filter((relatedWorkId): relatedWorkId is string => relatedWorkId !== null)
      : []
  };
}

function normalizeOpenAlexLookupError(error: unknown, stage: OpenAlexRelatedLookupError["stage"]): OpenAlexRelatedLookupError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "stage" in error &&
    "provider" in error
  ) {
    return error as OpenAlexRelatedLookupError;
  }

  if (error instanceof Response) {
    return createOpenAlexRelatedLookupError("openalex_seed_upstream_failed", stage, error.status);
  }

  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    return createOpenAlexRelatedLookupError("openalex_seed_upstream_failed", stage, error.status);
  }

  return createOpenAlexRelatedLookupError(stage === "related_fetch" ? "openalex_related_fetch_failed" : "openalex_seed_not_found", stage);
}

async function fetchOpenAlexWorkById(id: string): Promise<OpenAlexWorkLookupResult> {
  const response = await fetch(`https://api.openalex.org/works/${encodeURIComponent(id)}`, { method: "GET" });
  if (!response.ok) {
    throw createOpenAlexRelatedLookupError("openalex_seed_upstream_failed", "seed_resolution", response.status);
  }

  const work = await response.json() as Record<string, unknown>;
  return parseOpenAlexWorkLookup(work, response.status);
}

async function fetchOpenAlexWorkByDoi(doi: string): Promise<OpenAlexWorkLookupResult> {
  const primaryResponse = await fetch(
    `https://api.openalex.org/works/${encodeURIComponent(`https://doi.org/${doi}`)}`,
    { method: "GET" }
  );
  if (primaryResponse.ok) {
    const primaryWork = await primaryResponse.json() as Record<string, unknown>;
    return parseOpenAlexWorkLookup(primaryWork, primaryResponse.status);
  }

  const primaryUpstreamFailure = primaryResponse.status !== 404
    ? createOpenAlexRelatedLookupError("openalex_seed_upstream_failed", "seed_resolution", primaryResponse.status)
    : null;

  const fallbackResponse = await fetch(
    `https://api.openalex.org/works?filter=doi:${encodeURIComponent(doi)}`,
    { method: "GET" }
  );
  if (!fallbackResponse.ok) {
    throw createOpenAlexRelatedLookupError("openalex_seed_upstream_failed", "seed_resolution", fallbackResponse.status);
  }

  const fallbackJson = await fallbackResponse.json() as { results?: unknown };
  const firstResult = Array.isArray(fallbackJson.results) ? fallbackJson.results[0] : null;
  if (!firstResult || typeof firstResult !== "object") {
    throw primaryUpstreamFailure ?? createOpenAlexRelatedLookupError("openalex_seed_not_found", "seed_resolution", fallbackResponse.status);
  }

  return parseOpenAlexWorkLookup(firstResult as Record<string, unknown>, fallbackResponse.status);
}

async function fetchOpenAlexWorksByIds(ids: string[]): Promise<NormalizedPaper[]> {
  const papers = await Promise.all(
    ids.map(async (id) => (await fetchOpenAlexWorkById(id)).paper)
  );

  return papers.filter((paper): paper is NormalizedPaper => paper !== null);
}

async function fetchCrossrefReferences(doi: string): Promise<NormalizedPaper[]> {
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Crossref API returned ${response.status}`);
  }

  const json = await response.json() as { message?: { reference?: unknown } };
  const references = Array.isArray(json.message?.reference) ? json.message.reference : [];

  return references
    .map((reference) => normalizeCrossrefReference(reference as Record<string, unknown>))
    .filter((paper): paper is NormalizedPaper => paper !== null);
}

async function fetchArxivDetails(identifier: string): Promise<ProviderPaperResult> {
  const response = await fetch(
    `https://export.arxiv.org/api/query?search_query=id:${encodeURIComponent(identifier)}&start=0&max_results=1`,
    { method: "GET" }
  );
  if (!response.ok) {
    throw new Error(`arXiv API returned ${response.status}`);
  }

  const xml = await response.text();
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/i);
  if (!entryMatch) {
    return {
      provider: "arxiv",
      paper: null
    };
  }

  const entryBody = entryMatch[1] ?? "";
  const id = entryBody.match(/<id>([\s\S]*?)<\/id>/i)?.[1]?.trim() ?? null;
  const title = entryBody.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
  const summary = entryBody.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1]?.trim() ?? null;

  return {
    provider: "arxiv",
    paper: normalizeArxivEntry({ id, title, summary })
  };
}

export async function handlePaperSearch(args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  const searchArgs = (args ?? {}) as PaperSearchArgs;
  const query = normalizeNonEmptyString(searchArgs.query);

  if (!query) {
    return validationError("query must be a non-empty string");
  }

  const providerResults = await Promise.allSettled([
    searchCrossrefWorks(query),
    searchOpenAlexWorks(query)
  ]);

  const providers: ProviderPaperSearchResult["provider"][] = [];
  const papers: NormalizedPaper[] = [];
  let partial = false;

  providerResults.forEach((result) => {
    if (result.status === "rejected") {
      partial = true;
      return;
    }

    providers.push(result.value.provider);
    papers.push(...result.value.papers);
  });

  return {
    ok: true,
    data: {
      query,
      providers,
      partial,
      results: mergePaperResults(papers)
    }
  };
}

export async function handlePaperGetDetails(args: unknown, context: ToolContext): Promise<ToolExecutionResult> {
  const detailsArgs = (args ?? {}) as PaperDetailsArgs;
  const doi = normalizeNonEmptyString(detailsArgs.doi);
  const arxivId = normalizeNonEmptyString(detailsArgs.arxiv_id);
  const resolvedPaperId = doi ?? arxivId;

  if (!resolvedPaperId) {
    return validationError("doi or arxiv_id must be a non-empty string");
  }

  const providerResults = await Promise.allSettled([
    ...(doi ? [fetchCrossrefDetails(doi), fetchOpenAlexDetails(doi)] : []),
    ...(arxivId ? [fetchArxivDetails(arxivId)] : []),
    ...(doi ? [lookupUnpaywallByDoi(doi, context.env)] : [])
  ]);

  const providers: PaperProvider[] = [];
  const papers: NormalizedPaper[] = [];
  let partial = false;
  let openAccess: { open_access: boolean; download_links: string[] } | null = null;

  providerResults.forEach((result) => {
    if (result.status === "rejected") {
      partial = true;
      return;
    }

    const value = result.value;
    if ("provider" in value) {
      if (value.paper) {
        providers.push(value.provider);
        papers.push(value.paper);
      }
      return;
    }

    if (!value.ok) {
      partial = true;
      return;
    }

    providers.push(value.data.provider);
    openAccess = {
      open_access: value.data.open_access,
      download_links: value.data.download_links
    };
  });

  const mergedResult = mergePaperResults(papers)[0] ?? null;

  return {
    ok: true,
    data: {
      paper_id: resolvedPaperId,
      providers,
      partial,
      result: mergedResult && openAccess ? withOpenAccessData(mergedResult, openAccess) : mergedResult
    }
  };
}

export async function handlePaperGetRelated(args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  const relatedArgs = (args ?? {}) as PaperRelatedArgs;
  const paperId = normalizeNonEmptyString(relatedArgs.paper_id);
  const doi = normalizeNonEmptyString(relatedArgs.doi);
  const resolvedPaperId = paperId ?? doi;

  if (!resolvedPaperId) {
    return validationError("paper_id or doi must be a non-empty string");
  }

  const classification = doi
    ? { kind: "doi", value: doi } as const
    : classifyRelatedPaperId(resolvedPaperId);

  let lookup: OpenAlexWorkLookupResult;

  try {
    switch (classification.kind) {
      case "doi":
        lookup = await fetchOpenAlexWorkByDoi(classification.value);
        break;
      case "openalex_id":
        lookup = await fetchOpenAlexWorkById(classification.value);
        break;
      case "openalex_url":
        lookup = await fetchOpenAlexWorkById(classification.workId);
        break;
      case "invalid":
        throw createOpenAlexRelatedLookupError("openalex_seed_not_found", "seed_resolution");
    }
  } catch (error) {
    if (classification.kind === "doi") {
      try {
        const fallbackResults = mergePaperResults(await fetchCrossrefReferences(classification.value));
        return {
          ok: true,
          data: {
            paper_id: classification.value,
            providers: ["crossref"],
            partial: true,
            results: fallbackResults
          }
        };
      } catch {
        // fall through to original OpenAlex error
      }
    }

    return internalError("paper_get_related could not resolve an OpenAlex work id from paper_id or doi", normalizeOpenAlexLookupError(error, "seed_resolution"));
  }

  try {
    const relatedResults = lookup.relatedWorkIds.length > 0
      ? mergePaperResults(await fetchOpenAlexWorksByIds(lookup.relatedWorkIds.slice(0, 10)))
      : [];

    return {
      ok: true,
      data: {
        paper_id: classification.kind === "doi" ? classification.value : lookup.workId,
        providers: ["openalex"],
        partial: false,
        results: relatedResults
      }
    };
  } catch (error) {
    return internalError("paper_get_related could not fetch related papers from OpenAlex", normalizeOpenAlexLookupError(error, "related_fetch"));
  }
}

export async function handlePaperGetOpenAccess(args: unknown, context: ToolContext): Promise<ToolExecutionResult> {
  const openAccessArgs = (args ?? {}) as PaperOpenAccessArgs;

  if (typeof openAccessArgs.doi !== "string" || openAccessArgs.doi.trim() === "") {
    return validationError("doi must be a non-empty string");
  }

  return lookupUnpaywallByDoi(openAccessArgs.doi, context.env);
}
